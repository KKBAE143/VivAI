@echo off
REM ============================================================
REM  CollegePro Navigator - first-time setup
REM  Double-click this file on a fresh Windows machine.
REM  It runs setup.ps1 with the execution policy bypassed so
REM  you never get a "scripts are disabled" error.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

echo.
echo Setup finished.
pause
