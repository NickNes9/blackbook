@echo off
taskkill /f /im node.exe >nul 2>&1
echo Black Book stopped.
timeout /t 2 >nul
