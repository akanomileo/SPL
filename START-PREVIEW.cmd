@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22.13 or newer, then reopen the terminal.
 pause
 exit /b 1
)
echo Customer: http://localhost:4174/
echo Owner: http://localhost:4174/owner/
node --experimental-strip-types "server\index.mjs"
pause
