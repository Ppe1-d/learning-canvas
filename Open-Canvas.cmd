@echo off
cd /d "%~dp0"
node open-last.mjs
if errorlevel 1 pause
