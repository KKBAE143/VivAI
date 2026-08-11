@echo off
REM ============================================================
REM  VivAI diagnostics report
REM  Double-click this file after reproducing a bug, or run it
REM  from a terminal with options:
REM     diagnose.bat -Hours 2      only the last 2 hours
REM     diagnose.bat -Top 25       detail more problems
REM     diagnose.bat -Clear        wipe the sink and start fresh
REM     diagnose.bat -Open         open the report when done
REM  Produces diagnostics\REPORT.md — hand that one file over.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose.ps1" %*

echo.
pause
