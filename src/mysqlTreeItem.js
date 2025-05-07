const vscode = require('vscode');

class MySQLTreeItem extends vscode.TreeItem {
    constructor(id, label, collapsibleState) {
        super(label, collapsibleState);
        this.id = id; // 关键：给个固定的 id
        this.connectionId = null;
        this.databaseName = null;
        this.tableName = null;
        this.type = null;
        
        // 添加双击支持
        this.command = {
            command: 'nextsql.onNodeDoubleClick',
            title: '查看表数据',
            arguments: [this]
        };
    }
}

module.exports = MySQLTreeItem;