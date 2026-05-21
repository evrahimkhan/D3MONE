const db = require('./databaseGateway');

module.exports = {
    log: (type, message) => {
        if (!type || typeof type.name !== 'string') return;
        let logs = db.maindb.get('admin.logs');
        logs.push({
            "time": new Date(),
            type: type.name,
            message
        }).write();
        
        // Patch: Log Rotation (cap at 1000)
        if (logs.value().length > 1000) {
            db.maindb.set('admin.logs', logs.value().slice(-1000)).write();
        }

        console.log(type.name, message);
    },
    getLogs: () => {
        return db.maindb.get('admin.logs').sortBy('time').reverse().value();
    }
}