const vscode = require('vscode');
const MySQLTreeItem = require('./mysqlTreeItem');

class DatabaseExplorer {
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.savedConnections = [];
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            // 根节点，显示所有连接
            const connections = this.connectionManager.getConnections();
            return connections.map(conn => this.createConnectionNode(conn));
        }
    
        // 连接节点，显示数据库
        if (element.type === 'connection' && element.connectionId) {
            try {
                // const isConnected = this.connectionManager.isConnected(element.connectionId);
                // if(!isConnected){
                //     return [];
                // }
                const connection = this.connectionManager.connections.get(element.connectionId);
                
                // 如果用户选择了特定的数据库，则只显示这些数据库
                if (connection && connection.selectedDatabases && connection.selectedDatabases.length > 0) {
                    return connection.selectedDatabases.map(dbName => 
                        this.createDatabaseNode(dbName, element.connectionId)
                    );
                } else {
                    // 否则显示所有数据库
                    const result = await this.connectionManager.executeQuery(
                        element.connectionId,
                        'SHOW DATABASES'
                    );
                    
                    return result.map(row => this.createDatabaseNode(row.Database, element.connectionId));
                }
            } catch (error) {
                vscode.window.showErrorMessage(`获取数据库列表失败: ${error.message}`);
                return [];
            }
        }

        // 数据库节点，显示表和视图
        if (element.type === 'database' && element.connectionId && element.databaseName) {
            try {
                // 切换到选定的数据库
                await this.connectionManager.executeQuery(
                    element.connectionId,
                    `USE \`${element.databaseName}\``
                );
                
                // 获取表
                const tables = await this.connectionManager.executeQuery(
                    element.connectionId,
                    'SHOW TABLES'
                );
                
                return tables.map(row => {
                    const tableName = row[`Tables_in_${element.databaseName}`];
                    return this.createTableNode(tableName, element.connectionId, element.databaseName);
                });
            } catch (error) {
                vscode.window.showErrorMessage(`获取表列表失败: ${error.message}`);
                return [];
            }
        }

        // 表节点，显示列
        if (element.type === 'table' && element.connectionId && element.databaseName && element.tableName) {
            try {
                const columns = await this.connectionManager.executeQuery(
                    element.connectionId,
                    `SHOW COLUMNS FROM \`${element.tableName}\``
                );
                
                return columns.map(column => {
                    const label = `${column.Field} (${column.Type})`;
                    return this.createColumnNode(label);
                });
            } catch (error) {
                vscode.window.showErrorMessage(`获取列信息失败: ${error.message}`);
                return [];
            }
        }
        
        return [];
    }

    // 创建连接节点
    createConnectionNode(connection) {
        const isConnected = this.connectionManager.isConnected(connection.id);
        
        // 根据连接状态设置不同的标签
        const label = isConnected 
            ? `${connection.name} (已连接)` 
            : connection.name;
        const id = `connection-${connection.name}`
        
        const savedConnection = this.savedConnections.find(conn => conn.id === connection.id);
        let treeItem;
        if(savedConnection){
            treeItem = savedConnection;
        }else{
            treeItem = new MySQLTreeItem(id, label, vscode.TreeItemCollapsibleState.Collapsed);
            this.savedConnections.push(treeItem);
        }
        treeItem.contextValue = isConnected ? 'connectedConnection' : 'connection';
        
        // 根据连接状态设置不同的图标
        treeItem.iconPath = isConnected 
            ? new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green')) 
            : new vscode.ThemeIcon('database', new vscode.ThemeColor('disabledForeground'));
        
        treeItem.connectionId = connection.id;
        treeItem.type = 'connection';
        return treeItem;
    }

    // 创建数据库节点
    createDatabaseNode(databaseName, connectionId) {
        const id = `database-${databaseName}`
        const treeItem = new MySQLTreeItem(id, databaseName, vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.contextValue = 'database';
        treeItem.iconPath = new vscode.ThemeIcon('package');
        treeItem.connectionId = connectionId;
        treeItem.databaseName = databaseName;
        treeItem.type = 'database';
        return treeItem;
    }

    // 创建表节点
    createTableNode(tableName, connectionId, databaseName) {
        const id = `table-${tableName}`
        const treeItem = new MySQLTreeItem(id, tableName, vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.contextValue = 'table';
        treeItem.iconPath = new vscode.ThemeIcon('list-tree');
        treeItem.connectionId = connectionId;
        treeItem.databaseName = databaseName;
        treeItem.tableName = tableName;
        treeItem.type = 'table';
        return treeItem;
    }

    // 创建列节点
    createColumnNode(label) {
        const id = `column-${label}`
        const treeItem = new MySQLTreeItem(id, label, vscode.TreeItemCollapsibleState.None);
        treeItem.contextValue = 'column';
        treeItem.iconPath = new vscode.ThemeIcon('symbol-field');
        treeItem.type = 'column';
        return treeItem;
    }

    // 添加 getParent 方法
    getParent(element) {
        // 如果是根节点（连接节点），返回 null
        if (element.type === 'connection') {
            return null;
        }
        
        // 如果是数据库节点，返回其所属的连接节点
        if (element.type === 'database' && element.connectionId) {
            const connections = this.connectionManager.getConnections();
            const parentConnection = connections.find(conn => conn.id === element.connectionId);
            if (parentConnection) {
                return this.createConnectionNode(parentConnection);
            }
        }
        
        // 如果是表节点，返回其所属的数据库节点
        if (element.type === 'table' && element.connectionId && element.databaseName) {
            return this.createDatabaseNode(element.databaseName, element.connectionId);
        }
        
        // 如果是列节点，返回其所属的表节点
        if (element.type === 'column' && element.connectionId && element.databaseName && element.tableName) {
            return this.createTableNode(element.tableName, element.connectionId, element.databaseName);
        }
        
        return null;
    }
}

module.exports = DatabaseExplorer;