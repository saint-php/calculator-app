@echo off
echo ==========================================
echo  Premium Calculator - Server Startup
echo ==========================================
echo.

REM Set environment variables for Windows
set WOLFRAM_APP_ID=27WE8LXU98
set PORT=3000
set NODE_ENV=development

echo 🔑 Wolfram API: Configured
echo 🌐 Port: %PORT%
echo 🔧 Environment: %NODE_ENV%
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

echo 🚀 Starting server...
echo.
node server.js

pause
