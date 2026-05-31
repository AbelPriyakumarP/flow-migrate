@echo off
title FlowMigrate Dev Server
echo ============================================
echo   FlowMigrate - Starting Development Server
echo ============================================
echo.
echo  Make sure your GEMINI_API_KEY is set in .env.local
echo  App will open at: http://localhost:3000
echo.
set PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev
pause
