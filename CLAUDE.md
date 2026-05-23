# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

L3MON (DroiDrop) is a Node.js-based remote Android management suite. It consists of an Express web admin panel and a Socket.IO server that communicates with Android client devices.

## Running the Application

```bash
npm install                # Install dependencies
node index.js              # Start the server
# OR with pm2:
pm2 start index.js
```

- Web admin panel: `http://127.0.0.1:22533`
- Socket.IO client port: `22222`
- Java 1.8.0 is required for APK building (apktool + signing)
- There are no tests, linter, or CI configured. The `npm test` script just runs `node index.js`.

## Architecture

### Entry Point — `index.js`

Bootstraps everything. Creates the Express app and Socket.IO server, registers all modules as **globals** (`global.CONST`, `global.db`, `global.logManager`, `global.app`, `global.clientManager`, `global.apkBuilder`), marks all clients offline on startup, then listens for connections.

### Module Layout (`includes/`)

| Module | Purpose |
|---|---|
| `const.js` | Ports (22533 web, 22222 socket), file paths, hex message keys (`0xCA`, `0xFI`, etc.), log type definitions |
| `databaseGateway.js` | LowDB wrapper. Exports `maindb` (single `maindb.json` for admin config + client registry) and `clientdb` class (per-client JSON files in `clientData/`) |
| `clientManager.js` | Core `Clients` class. Manages socket connections, per-client socket event listeners, command queuing for offline devices, GPS polling, and data retrieval by page type |
| `expressRoutes.js` | Express router. Auth (cookie-based login token), APK builder UI, device management pages, file downloads, logs viewer |
| `apkBuilder.js` | Patches smali source with server URI/port, rebuilds and signs APK using Java tools in `app/factory/` |
| `logManager.js` | Writes timestamped logs to `maindb.json` with rotation (capped at 1000 entries) |

### Communication Pattern

The admin UI (browser) talks to Express routes over HTTP. The Android clients connect via Socket.IO on port 22222. Command flow:

1. Admin sends HTTP POST to `/manage/:deviceid/:commandID`
2. `clientManager.sendCommand()` either emits directly via socket or queues in the client's JSON file if offline
3. Client responds via socket events keyed by `CONST.messageKeys` hex codes
4. `clientManager.setupListeners()` processes responses and writes to the per-client LowDB database

### Data Storage

- **`maindb.json`** — Admin credentials (MD5-hashed password), login token, logs, and the master client list
- **`clientData/<clientID>.json`** — Per-client data: SMS, calls, contacts, GPS, clipboard, notifications, command queue, downloads, WiFi, apps, permissions

### Key Conventions

- **Globals everywhere**: Modules are attached to `global` in `index.js` and accessed directly (e.g., `let db = global.db` in `expressRoutes.js`). Not dependency injection.
- **Callbacks only**: No promises or async/await. All async operations use Node-style callbacks.
- **EJS templates**: Views are in `assets/views/`. Static assets in `assets/webpublic/`.
- **Auth**: Cookie-based. Admin logs in, gets a random 32-byte hex token stored in `maindb.json` and set as an httpOnly cookie. The `isAllowed` middleware checks this token on every request.
- **Message keys**: Socket events use hex-like string constants defined in `const.js` (e.g., `'0xCA'` for camera, `'0xSM'` for SMS).

## Critical Files for Common Tasks

- Adding a new client data type: `includes/clientManager.js` (add socket listener in `setupListeners`, add to `getClientDataByPage`), `includes/const.js` (add message key)
- Adding a new admin route: `includes/expressRoutes.js`
- Changing ports or paths: `includes/const.js`
- Modifying database schema: `includes/databaseGateway.js` (defaults in constructor)
