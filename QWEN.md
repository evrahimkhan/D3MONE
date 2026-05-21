# L3MON - Remote Android Management Suite

## Project Overview

L3MON is a cloud-based remote Android management suite powered by Node.js. It provides a web dashboard for managing and monitoring Android devices remotely. The project is a fork/derivative of [AhMyth](https://github.com/AhMyth/AhMyth-Android-RAT), built for educational and internal use.

**Key Features:**
- GPS Logging
- Microphone Recording
- View Contacts
- SMS Logs / Send SMS
- Call Logs
- View Installed Apps & Stub Permissions
- Live Clipboard & Notification Logging
- View WiFi Networks
- File Explorer & Downloader
- Command Queuing
- Built-in APK Builder

## Architecture

The project follows a client-server architecture:

```
Android Client (APK) <--- Socket.IO (port 22222) ---> Node.js Server <--- HTTP (port 22533) ---> Web Dashboard (EJS)
```

### Core Components

| File/Directory | Purpose |
|---|---|
| `index.js` | Main entry point. Sets up Express web server, Socket.IO control server, and wires up global managers |
| `includes/const.js` | Configuration constants (ports, paths, message keys, log types) |
| `includes/databaseGateway.js` | Database layer using LowDB (JSON file-based). Exports `maindb` (admin + client list) and `clientdb` (per-client data) |
| `includes/clientManager.js` | Manages connected Android device sessions |
| `includes/logManager.js` | Handles logging of events and device data |
| `includes/apkBuilder.js` | Builds and signs APK files using apktool.jar and sign.jar |
| `includes/expressRoutes.js` | Express route handlers for the web dashboard |
| `assets/views/` | EJS templates for the web UI |
| `assets/webpublic/` | Static assets served to the web dashboard |
| `app/factory/` | APK building toolchain (apktool.jar, sign.jar, decompiled smali, signing keys) |
| `clientData/` | Per-client JSON database files |
| `maindb.json` | Main database (admin credentials, client registry) |

### Ports

- **22533** - Web dashboard (HTTP/Express)
- **22222** - Android client control channel (Socket.IO)

## Technologies

- **Runtime:** Node.js
- **Java:** JRE 8 (required for APK building/signing)
- **Web Framework:** Express.js
- **Real-time Communication:** Socket.IO v2.2.0
- **Database:** LowDB (JSON file-based)
- **Templating:** EJS
- **GeoIP:** geoip-lite
- **Process Manager:** PM2

## Building and Running

### Prerequisites

- Java Runtime Environment 1.8.0 (Java 8) — **must be 1.8.0**
- Node.js
- PM2 (`npm install pm2 -g`)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Initialize database** (if `maindb.json` doesn't exist):
   ```bash
   cp maindb.json.back maindb.json
   ```

3. **Configure admin credentials:**
   - Stop L3MON: `pm2 stop index`
   - Edit `maindb.json` — set `username` as plaintext, `password` as lowercase MD5 hash
   - Generate MD5: `echo -n "yourpassword" | openssl md5 | awk '{print $2}'`

4. **Start with PM2:**
   ```bash
   pm2 start index.js --name L3MON
   pm2 save
   pm2 startup   # enable on boot
   ```

5. **Access dashboard:** `http://127.0.0.1:22533`

### One-Time Setup Script

Run `./setup.sh` for automated setup (installs dependencies, configures Java 8, patches EJS templates, initializes DB, sets up PM2).

### Docker

A Dockerfile is provided (`L3mon_Dockerfile`):
```bash
docker build -f L3mon_Dockerfile -t l3mon .
docker run -p 22533:22533 -p 22222:22222 l3mon
```

### Management Commands

```bash
pm2 status          # Check running processes
pm2 logs L3MON      # View logs
pm2 stop L3MON      # Stop server
pm2 restart L3MON   # Restart server
pm2 delete L3MON    # Remove from PM2
```

## Development Conventions

### EJS Template Syntax

Newer EJS versions require `<%- include('path') %>` instead of the legacy `<% include path %>`. The setup script patches this automatically.

### Database Structure

- **maindb.json** — Admin credentials, logs, IP logs, and client registry
- **clientData/{clientID}.json** — Per-client data (commands queue, SMS, calls, contacts, GPS, WiFi, clipboard, notifications, installed apps, permissions, downloads)

All clients are marked offline on server startup to prevent state drift.

### Security Notes

- Client IDs are sanitized to prevent path traversal
- Socket.IO has a 10MB buffer limit to prevent OOM attacks
- Passwords are stored as MD5 hashes
- The `trust proxy` setting is limited to loopback

### Testing

The `tests/` directory contains scaffold folders for different test types:
- `tests/scaffolds/unit/` — Unit tests
- `tests/scaffolds/api/` — API tests
- `tests/scaffolds/e2e/` — End-to-end tests
- `tests/scaffolds/fixtures/` — Test fixtures

## Key Configuration (includes/const.js)

```javascript
debug: false
web_port: 22533
control_port: 22222
```

Message keys for device communication (e.g., `0xCA` for camera, `0xSM` for SMS, etc.)

## License

ISC — Made with ❤️ by D3VL / efxtv
