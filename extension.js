// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// 导入自定义模块
const ConnectionManager = require('./src/connectionManager');
const DatabaseExplorer = require('./src/databaseExplorer');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed


// 创建SQL CodeLens提供者
class SqlCodeLensProvider {
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
    }
    
    provideCodeLenses(document, token) {
        // 移除文件类型检查，允许在所有文件中识别SQL语句
        // if (!document.fileName.toLowerCase().endsWith('.sql')) {
        //     return [];
        // }
        
        const text = document.getText();
        const codeLenses = [];
        
        // SQL语句检测正则表达式
        const sqlRegex = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b[\s\S]*?;/gi;
        
        let match;
        while ((match = sqlRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            
            // 添加执行查询的 CodeLens
            const codeLens = new vscode.CodeLens(range, {
                title: '▶ execute query',
                command: 'nextsql.executeQuery',
                arguments: [range]
            });
            
            codeLenses.push(codeLens);
            
            // // 添加一个额外的按钮 CodeLens
            // const buttonCodeLens = new vscode.CodeLens(range, {
            //     title: '▶ execute query to new window',
            //     command: 'nextsql.executeQueryToNewWindow',  // 修改这里，使用新的命令
            //     arguments: [range]
            // });
            
            // codeLenses.push(buttonCodeLens);
        }
        
        return codeLenses;
    }
}

// 存储查询结果面板的引用和状态
let queryResultPanel = undefined;
let isPanelDisposed = true;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "nextsql" is now active!');

    // 创建连接管理器
    const connectionManager = new ConnectionManager();
    
    // 创建数据库资源管理器
    const databaseExplorer = new DatabaseExplorer(connectionManager);
    
    // 注册视图
    const treeView = vscode.window.createTreeView('sqlExplorer', {
        treeDataProvider: databaseExplorer,
        // 添加以下配置以支持双击事件
        showCollapseAll: true
    });
    
    // 监听节点展开事件
    treeView.onDidExpandElement(async e => {
        // 当节点展开时，如果是连接节点但未连接，则自动连接
        console.log(`用户展开了节点: ${e.element.label}`);
        if (e.element.type === 'connection' && !connectionManager.isConnected(e.element.connectionId)) {
            await handleConnect(e.element);
        }
    });
    
    // 监听节点折叠事件
    treeView.onDidCollapseElement(e => {
        // 记录用户折叠的节点
        console.log(`用户折叠了节点: ${e.element.label}`);
    });
    
    // 注册命令
    const addConnectionCommand = vscode.commands.registerCommand('nextsql.addConnection', async () => {
        // 实现添加连接的逻辑
        const name = await vscode.window.showInputBox({ prompt: '连接名称' });
        if (!name) return;
        
        const host = await vscode.window.showInputBox({ prompt: '主机地址', value: 'localhost' });
        if (!host) return;
        
        const port = await vscode.window.showInputBox({ prompt: '端口', value: '3306' });
        if (!port) return;
        
        const user = await vscode.window.showInputBox({ prompt: '用户名' });
        if (!user) return;
        
        const password = await vscode.window.showInputBox({ prompt: '密码', password: true });
        if (password === undefined) return;
        
        // 创建临时连接以获取可用的数据库列表
        const tempConnection = {
            id: 'temp_' + Date.now().toString(),
            name: 'Temporary Connection',
            host,
            port: parseInt(port),
            user,
            password
        };
        
        try {
            // 添加临时连接
            connectionManager.addConnection(tempConnection);
            
            // 连接到数据库
            await connectionManager.connect(tempConnection.id);
            
            // 获取所有数据库
            const result = await connectionManager.executeQuery(tempConnection.id, 'SHOW DATABASES');
            const databases = result.map(row => row.Database);
            
            // 断开连接并删除临时连接
            await connectionManager.disconnect(tempConnection.id);
            connectionManager.removeConnection(tempConnection.id);
            
            // 让用户选择多个数据库
            const selectedDatabases = await vscode.window.showQuickPick(databases, {
                canPickMany: true,
                placeHolder: '选择要显示的数据库（可多选）'
            });
            
            if (!selectedDatabases) {
                return; // 用户取消了选择
            }
            
            // 创建新的连接配置
            connectionManager.addConnection({
                id: Date.now().toString(),
                name,
                host,
                port: parseInt(port),
                user,
                password,
                selectedDatabases // 保存用户选择的数据库
            });
            
            databaseExplorer.refresh();
            
        } catch (error) {
            vscode.window.showErrorMessage(`获取数据库列表失败: ${error.message}`);
        }
    });
    
    const removeConnectionCommand = vscode.commands.registerCommand('nextsql.removeConnection', async (item) => {
        if (item && item.connectionId) {
            connectionManager.removeConnection(item.connectionId);
            databaseExplorer.refresh();
        }
    });

    async function handleConnect(item) {
        if (item && item.connectionId) {
            try {
                await connectionManager.connect(item.connectionId);
                vscode.window.showInformationMessage('连接成功！');
                databaseExplorer.refresh();
                // setTimeout(() => {
                    treeView.reveal(item, { expand: true, select: true, focus: true });
                // }, 100);
            } catch (error) {
                vscode.window.showErrorMessage(`连接失败: ${error.message}`);
            }
        }
    }
    
    const connectCommand = vscode.commands.registerCommand('nextsql.connect', async (item) => {
        await handleConnect(item);
    });
    
    const disconnectCommand = vscode.commands.registerCommand('nextsql.disconnect', async (item) => {
        if (item && item.connectionId) {
            await connectionManager.disconnect(item.connectionId);
            vscode.window.showInformationMessage('已断开连接');
            
            databaseExplorer.refresh();
            setTimeout(() => {
                treeView.reveal(item, { expand: false, select: false, focus: false });
            }, 1000);
        }
    });
    
    // 存储查询结果面板的引用
    let queryResultPanel = undefined;
    
    const executeQueryCommand = vscode.commands.registerCommand('nextsql.executeQuery', async (range) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('没有活动的编辑器');
            return;
        }
        
        let query;
        if (range && range instanceof vscode.Range) {
            // 如果是从CodeLens调用并传递了范围，使用该范围的文本
            query = editor.document.getText(range);
        } else {
            // 否则使用当前选择或整个文档
            const selection = editor.selection;
            query = selection.isEmpty 
                ? editor.document.getText() 
                : editor.document.getText(selection);
        }
        
        if (!query.trim()) {
            vscode.window.showWarningMessage('没有选择查询语句');
            return;
        }
        
        // 获取最近活动的连接
        const lastActiveConnection = connectionManager.getLastActiveConnection();
        
        // 检查面板是否已被销毁
        if (queryResultPanel && queryResultPanel.disposed) {
            queryResultPanel = undefined;
        }
        
        if (lastActiveConnection) {
            // 如果有最近活动的连接，直接使用它
            queryResultPanel = await showQueryResults(lastActiveConnection.id, query, '查询结果', connectionManager, queryResultPanel);
        } else {
            // 如果没有最近活动的连接，则显示连接选择对话框
            const connections = connectionManager.getConnections();
            if (connections.length === 0) {
                vscode.window.showWarningMessage('没有可用的数据库连接，请先添加连接');
                return;
            }

            const connectionItems = connections.map(conn => ({
                label: conn.name,
                id: conn.id
            }));

            const selectedConnection = await vscode.window.showQuickPick(connectionItems, {
                placeHolder: '选择数据库连接'
            });

            if (selectedConnection) {
                queryResultPanel = await showQueryResults(selectedConnection.id, query, '查询结果', connectionManager, queryResultPanel);
            }
        }
    });

    const editConnectionCommand = vscode.commands.registerCommand('nextsql.editConnection', async (item) => {
        if (!item || !item.connectionId) return;
        
        const connection = connectionManager.connections.get(item.connectionId);
        if (!connection) return;
        
        try {
            // 连接到数据库
            await connectionManager.connect(connection.id);
            
            // 获取所有数据库
            const result = await connectionManager.executeQuery(connection.id, 'SHOW DATABASES');
            const databases = result.map(row => row.Database);
            
            var quickPick = vscode.window.createQuickPick();
            // 先设置 items
            quickPick.items = databases.map(db => ({ label: db }));
            
            // 确保 selectedDatabases 存在
            if (connection.selectedDatabases && Array.isArray(connection.selectedDatabases)) {
                // 从 items 中找到匹配的项
                const selectedItems = quickPick.items.filter(item => 
                    connection.selectedDatabases.includes(item.label)
                );
                quickPick.selectedItems = selectedItems;
            }
            
            quickPick.placeholder = '选择要显示的数据库（可多选）';
            quickPick.canSelectMany = true;
            quickPick.onDidAccept(() => {
                connection.selectedDatabases = quickPick.selectedItems.map(item => item.label);
                connectionManager.saveConnections();
                databaseExplorer.refresh();
                quickPick.dispose();
            });
            quickPick.onDidHide(() => quickPick.dispose());
            quickPick.show();
        } catch (error) {
            vscode.window.showErrorMessage(`编辑连接失败: ${error.message}`);
        }
    });
    
    // 处理双击节点事件
    const onNodeDoubleClick = vscode.commands.registerCommand('nextsql.onNodeDoubleClick', async (item) => {
    // 双击表节点时，自动生成并执行 SELECT 查询
    if (item.type === 'table') {
    // 更新最近活动的连接
    connectionManager.lastActiveConnectionId = item.connectionId;
    
    // 检查面板是否已被销毁
    if (queryResultPanel && queryResultPanel.disposed) {
    queryResultPanel = undefined;
    }
    
    const query = `SELECT * FROM \`${item.tableName}\` LIMIT 50`;
    const title = `${item.tableName} - 查询结果`;
    queryResultPanel = await showQueryResults(item.connectionId, query, title, connectionManager, queryResultPanel);
    }
    });

     // 注册SQL CodeLens提供者
     const sqlCodeLensProvider = new SqlCodeLensProvider(connectionManager);
     const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
         // 修改为适用于所有文件类型
         { scheme: 'file' },
         sqlCodeLensProvider
     );
     
     context.subscriptions.push(codeLensProviderDisposable);
    
    // 将命令添加到订阅中
    context.subscriptions.push(onNodeDoubleClick);
    
    // 将 treeView 添加到订阅中
    context.subscriptions.push(treeView);
    
    // 监听节点选择事件
    treeView.onDidChangeSelection(e => {
        if (e.selection.length > 0) {
            const selectedItem = e.selection[0];
            
            // 如果选择了表节点，在状态栏显示表信息，但不触发查询
            if (selectedItem.type === 'table') {
                vscode.window.setStatusBarMessage(
                    `表: ${selectedItem.tableName} (数据库: ${selectedItem.databaseName})`, 
                    5000
                );
                // 移除这里可能存在的自动查询代码
            }
        }
    });
    
    // 创建状态栏项
    const connectionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    connectionStatusBarItem.command = 'nextsql.selectActiveConnection';
    context.subscriptions.push(connectionStatusBarItem);
    
    // 更新状态栏显示
    function updateConnectionStatusBar() {
        const lastActive = connectionManager.getLastActiveConnection();
        if (lastActive) {
            connectionStatusBarItem.text = `$(database) ${lastActive.connection.name}`;
            connectionStatusBarItem.tooltip = `当前活动的数据库连接: ${lastActive.connection.name}`;
            connectionStatusBarItem.show();
        } else {
            connectionStatusBarItem.hide();
        }
    }
    
    // 注册选择活动连接的命令
    const selectActiveConnectionCommand = vscode.commands.registerCommand('nextsql.selectActiveConnection', async () => {
        const connections = connectionManager.getConnections();
        if (connections.length === 0) {
            vscode.window.showWarningMessage('没有可用的数据库连接，请先添加连接');
            return;
        }
        
        const connectionItems = connections.map(conn => ({ 
            label: conn.name, 
            id: conn.id,
            description: connectionManager.isConnected(conn.id) ? '已连接' : '未连接'
        }));
        
        const selectedConnection = await vscode.window.showQuickPick(connectionItems, {
            placeHolder: '选择活动数据库连接'
        });
        
        if (selectedConnection) {
            if (!connectionManager.isConnected(selectedConnection.id)) {
                try {
                    await connectionManager.connect(selectedConnection.id);
                    vscode.window.showInformationMessage(`已连接到 ${selectedConnection.label}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`连接失败: ${error.message}`);
                    return;
                }
            }
            
            connectionManager.lastActiveConnectionId = selectedConnection.id;
            updateConnectionStatusBar();
        }
    });
    
    context.subscriptions.push(selectActiveConnectionCommand);

    // 注册在新窗口中执行查询的命令
    const executeQueryToNewWindowCommand = vscode.commands.registerCommand('nextsql.executeQueryToNewWindow', async (range) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('没有活动的编辑器');
            return;
        }
        
        let query;
        if (range && range instanceof vscode.Range) {
            // 如果是从CodeLens调用并传递了范围，使用该范围的文本
            query = editor.document.getText(range);
        } else {
            // 否则使用当前选择或整个文档
            const selection = editor.selection;
            query = selection.isEmpty 
                ? editor.document.getText() 
                : editor.document.getText(selection);
        }
        
        if (!query.trim()) {
            vscode.window.showWarningMessage('没有选择查询语句');
            return;
        }
        
        // 获取最近活动的连接
        const lastActiveConnection = connectionManager.getLastActiveConnection();
        
        if (lastActiveConnection) {
            // 如果有最近活动的连接，直接使用它
            // 注意这里传递 undefined 作为 existingPanel 参数，强制创建新面板
            await showQueryResults(lastActiveConnection.id, query, '查询结果', connectionManager, undefined);
        } else {
            // 如果没有最近活动的连接，则显示连接选择对话框
            const connections = connectionManager.getConnections();
            if (connections.length === 0) {
                vscode.window.showWarningMessage('没有可用的数据库连接，请先添加连接');
                return;
            }

            const connectionItems = connections.map(conn => ({
                label: conn.name,
                id: conn.id
            }));

            const selectedConnection = await vscode.window.showQuickPick(connectionItems, {
                placeHolder: '选择数据库连接'
            });

            if (selectedConnection) {
                // 注意这里传递 undefined 作为 existingPanel 参数，强制创建新面板
                await showQueryResults(selectedConnection.id, query, '查询结果', connectionManager, undefined);
            }
        }
    });
    
    // 将命令添加到订阅中
    context.subscriptions.push(executeQueryToNewWindowCommand);
    
    // 监听连接状态变化
    connectionManager.onConnectionStatusChanged = () => {
        updateConnectionStatusBar();
    };
    
    // 初始更新状态栏
    updateConnectionStatusBar();
    
}

// This method is called when your extension is deactivated
function deactivate() {}

// 创建一个统一的函数来显示查询结果
async function showQueryResults(connectionId, query, title, connectionManager, existingPanel) {
    try {
        // 修改查询选项，将 bigint 作为字符串返回
        const results = await connectionManager.executeQuery(connectionId, query, { bigIntAsString: true });
        
        // 创建或重用结果视图
        let panel = existingPanel;
        
        // 如果面板不存在或已被销毁，则创建新面板
        if (!panel || isPanelDisposed) {
            panel = vscode.window.createWebviewPanel(
                'queryResults',
                title,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            
            isPanelDisposed = false;
            
            // 当面板关闭时，将标志设为 true
            panel.onDidDispose(() => {
                isPanelDisposed = true;
                if (panel === queryResultPanel) {
                    queryResultPanel = undefined;
                }
            });
        } else {
            // 如果面板已存在，则更新标题并显示
            panel.title = title;
            panel.reveal(vscode.ViewColumn.Two);
        }
        
        // 在检查面板时使用标志
        if (queryResultPanel && isPanelDisposed) {
            queryResultPanel = undefined;
        }

        // 生成HTML表格
        let tableHtml = '<table class="data-table">';
        
        // 表头
        if (results.length > 0) {
            tableHtml += '<thead><tr>';
            for (const key in results[0]) {
                tableHtml += `<th>${key}</th>`;
            }
            tableHtml += '</tr></thead><tbody>';
            
            // 表内容
            results.forEach((row, index) => {
                tableHtml += `<tr class="${index % 2 === 0 ? 'even-row' : 'odd-row'}">`;
                for (const key in row) {
                    // 检查是否为大整数（字符串形式）或日期类型
                    let value = row[key];
                    if (value !== null) {
                        // 尝试检测是否为大整数字符串
                        if (typeof value === 'string' && /^\d{15,}$/.test(value)) {
                            // 为大整数添加特殊样式
                            value = `<span class="bigint-value">${value}</span>`;
                        } 
                        // 检测是否为日期类型
                        else if (value instanceof Date || (typeof value === 'string' && isDateString(value))) {
                            // 将日期格式化为 YYYYMMDD HH:mm:SS.ssss
                            const date = value instanceof Date ? value : new Date(value);
                            if (!isNaN(date.getTime())) {
                                const formattedDate = formatDate(date);
                                value = `<span class="date-value">${formattedDate}</span>`;
                            }
                        }
                    } else {
                        value = '<span class="null-value">NULL</span>';
                    }
                    tableHtml += `<td>${value}</td>`;
                }
                tableHtml += '</tr>';
            });
            
            tableHtml += '</tbody>';
        }
        
        tableHtml += '</table>';
        
        // 设置HTML内容
        panel.webview.html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            padding: 20px; 
            background-color: #f8f9fa;
            color: #333;
            line-height: 1.6;
        }
        h1 { 
            color: #2c3e50; 
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 20px;
            font-size: 24px;
        }
        .query-container {
            margin-bottom: 25px;
        }
        .query { 
            background-color: #e9f5ff; 
            padding: 12px; 
            border-radius: 6px; 
            margin-bottom: 10px;
            border-left: 4px solid #3498db;
            font-family: Consolas, Monaco, 'Andale Mono', monospace;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
            font-size: 14px;
        }
        .result-count {
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 16px;
        }
        .data-table { 
            border-collapse: collapse; 
            width: 100%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border-radius: 6px;
            overflow: hidden;
        }
        .data-table th { 
            background-color: #3498db; 
            color: white;
            padding: 12px 15px;
            text-align: left;
            font-weight: 600;
            position: sticky;
            top: 0;
        }
        .data-table td { 
            padding: 10px 15px; 
            border-bottom: 1px solid #e0e0e0;
        }
        .even-row { 
            background-color: #ffffff; 
        }
        .odd-row { 
            background-color: #f2f7ff; 
        }
        .data-table tr:hover { 
            background-color: #e3f2fd; 
        }
        .null-value {
            color: #999;
            font-style: italic;
        }
        .bigint-value {
            color: #0066cc;
            font-family: monospace;
        }
        .date-value {
            color: #0066cc;
            font-family: monospace;
        }
        @media (prefers-color-scheme: dark) {
            body { 
                background-color: #1e1e1e; 
                color: #e0e0e0;
            }
            h1 { 
                color: #e0e0e0; 
                border-bottom-color: #0078d4;
            }
            .query { 
                background-color: #252526; 
                border-left-color: #0078d4;
            }
            .result-count {
                color: #e0e0e0;
            }
            .data-table th { 
                background-color: #0078d4; 
            }
            .data-table td { 
                border-bottom-color: #333333;
            }
            .even-row { 
                background-color: #252526; 
            }
            .odd-row { 
                background-color: #1e1e1e; 
            }
            .data-table tr:hover { 
                background-color: #2d3748; 
            }
            .null-value {
                color: #777;
            }
            .bigint-value {
                color: #4da6ff;
            }
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="query-container">
        <div class="query">${query}</div>
        <div class="result-count">查询结果: ${results.length} 行记录</div>
    </div>
    ${tableHtml}
</body>
</html>
`;
        
        // 返回面板引用，以便在下次调用时重用
        return panel;
    } catch (error) {
        vscode.window.showErrorMessage(`查询执行失败: ${error.message}`);
        return existingPanel; // 发生错误时返回原有面板
    }
}

module.exports = {
    activate,
    deactivate
}

// 在 deactivate 函数后添加这些辅助函数

// 检查字符串是否为日期格式
function isDateString(str) {
    // 检查常见的日期格式
    if (typeof str !== 'string') return false;
    
    // 移除可能的引号
    str = str.replace(/^['"]|['"]$/g, '');
    
    // 检查 ISO 日期格式、MySQL 日期时间格式等
    const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, // YYYY-MM-DD HH:MM:SS
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 格式
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/ // 带毫秒的格式
    ];
    
    return datePatterns.some(pattern => pattern.test(str)) && !isNaN(new Date(str).getTime());
}

// 格式化日期为 YYYYMMDD HH:mm:SS.ssss
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(4, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}
