@echo off
REM ============================================================
REM  VivAI launcher
REM  Double-click this file, or drag it into a terminal + Enter.
REM  It runs start-app.ps1 with the execution policy bypassed so
REM  you never get a "scripts are disabled" error.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1"

echo.
echo Launcher finished. The two server windows keep running.
pause
