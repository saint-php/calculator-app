@echo off
echo ==========================================
echo  Calculator Diagnostic Tool
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/4] Checking server.js for AppID...
findstr /C:"27WE8LXU98" server.js >nul
if %errorlevel% == 0 (
    echo     ✅ AppID found in server.js
) else (
    echo     ❌ AppID NOT found in server.js
    echo     🔧 Fixing now...
    powershell -Command "(Get-Content server.js) -replace 'HARDCODED_APP_ID = .*', 'HARDCODED_APP_ID = ''27WE8LXU98'';' | Set-Content server.js"
    echo     ✅ Fixed!
)

echo.
echo [2/4] Checking config.json...
if exist config.json (
    echo     ✅ config.json exists
    type config.json
) else (
    echo     ❌ config.json missing
)

echo.
echo [3/4] Testing API health...
curl -s http://localhost:3000/api/health > temp_response.json 2>nul
if exist temp_response.json (
    type temp_response.json
    echo.
) else (
    echo     ❌ Server not running or curl not available
    echo     💡 Start server first: node server.js
)

echo.
echo [4/4] Testing Wolfram API directly...
curl -s "https://api.wolframalpha.com/v2/query?appid=27WE8LXU98^&input=2%%2B2^&output=json" > temp_wolfram.json 2>nul
if exist temp_wolfram.json (
    findstr /C:"success" temp_wolfram.json >nul
    if %errorlevel% == 0 (
        echo     ✅ Wolfram API is responding
    ) else (
        echo     ❌ Wolfram API returned error
        type temp_wolfram.json
    )
) else (
    echo     ⚠️  Could not test Wolfram API (no internet or curl issue)
)

if exist temp_response.json del temp_response.json
if exist temp_wolfram.json del temp_wolfram.json

echo.
echo ==========================================
echo  Diagnostic Complete
echo ==========================================
pause