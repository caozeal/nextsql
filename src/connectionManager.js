const vscode = require('vscode');
const mysql = require('mysql2/promise');

class ConnectionManager {
    constructor() {
        this.connections = new Map();
        this.activeConnections = new Map();
        this.lastActiveConnectionId = null; // 添加这一行，用于跟踪最近活动的连接
        this.loadConnections();
        this.onConnectionStatusChanged = null; // 添加事件回调
    }

    // 加载保存的连接
    loadConnections() {
        const config = vscode.workspace.getConfiguration('nextsql');
        const savedConnections = config.get('connections') || [];
        
        savedConnections.forEach(conn => {
            this.connections.set(conn.id, conn);
        });
    }

    // 保存连接配置
    saveConnections() {
        const config = vscode.workspace.getConfiguration('nextsql');
        config.update('connections', Array.from(this.connections.values()), vscode.ConfigurationTarget.Global);
    }

    // 添加新连接
    // 修改连接配置结构，添加 selectedDatabases 字段
    // 在 addConnection 方法中，确保新的连接对象包含 selectedDatabases 数组
    addConnection(connection) {
        // 确保 selectedDatabases 字段存在
        if (!connection.selectedDatabases) {
            connection.selectedDatabases = [];
        }
        this.connections.set(connection.id, connection);
        this.saveConnections();
    }

    // 删除连接
    removeConnection(id) {
        this.connections.delete(id);
        this.saveConnections();
    }

    // 获取所有连接
    getConnections() {
        return Array.from(this.connections.values());
    }

    // 连接到数据库
    async connect(id) {
        const connConfig = this.connections.get(id);
        if (!connConfig) {
            throw new Error(`未找到ID为 ${id} 的连接`);
        }
        
        try {
            const connection = await mysql.createConnection({
                host: connConfig.host,
                port: connConfig.port,
                user: connConfig.user,
                password: connConfig.password,
                database: connConfig.database,
                supportBigNumbers: true,
                bigNumberStrings: true
            });
            
            this.activeConnections.set(id, connection);
            // 连接成功后，更新最近活动的连接
            this.lastActiveConnectionId = id;
        
            // 触发事件
            if (this.onConnectionStatusChanged) {
             this.onConnectionStatusChanged();
            }
            return connection;
        } catch (error) {
            vscode.window.showErrorMessage(`连接失败: ${error.message}`);
            throw error;
        }
    }

    // 断开连接
    async disconnect(id) {
        const connection = this.activeConnections.get(id);
        if (connection) {
            try{
                await connection.end();
            }catch(e){
                console.log(e);
            }
            this.activeConnections.delete(id);
        }
        
        // 触发事件
        if (this.onConnectionStatusChanged) {
            this.onConnectionStatusChanged();
        }
    }

    // 执行查询
    async executeQuery(connectionId, query, options = {}) {
        if (!this.isConnected(connectionId)) {
            throw new Error('数据库未连接');
        }
        
        const connection = this.activeConnections.get(connectionId);
        
        // 设置查询选项，将 bigint 作为字符串返回
        const queryOptions = {
            supportBigNumbers: true,
            bigNumberStrings: options.bigIntAsString !== undefined ? options.bigIntAsString : true
        };
        
        try {
            // 检查是否是不支持预处理语句的命令
            const isSpecialCommand = /^(SHOW|USE|DESC|DESCRIBE|EXPLAIN)/i.test(query.trim());
            
            let rows;
            if (isSpecialCommand) {
                // 对于特殊命令使用 query() 方法
                [rows] = await connection.query(query, queryOptions);
            } else {
                // 对于普通查询使用 execute() 方法
                [rows] = await connection.execute(query, [], queryOptions);
            }
            return rows;
        } catch (error) {
            throw new Error(`查询执行失败: ${error.message}`);
        }
    }

    // 检查连接是否活跃
    isConnected(id) {
        return this.activeConnections.has(id);
    }
    
    // 添加获取最近活动连接的方法
    getLastActiveConnection() {
        if (this.lastActiveConnectionId && this.isConnected(this.lastActiveConnectionId)) {
            return {
                id: this.lastActiveConnectionId,
                connection: this.connections.get(this.lastActiveConnectionId)
            };
        }
        return null;
    }
}

module.exports = ConnectionManager;