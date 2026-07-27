# Build a shareable diagnostics report from whatever the app captured.
#
# Usage:
#   .\diagnose.bat              # everything captured, top 12 problems
#   .\diagnose.bat -Hours 2     # only the last 2 hours
#   .\diagnose.bat -Top 25      # detail more problems
#   .\diagnose.bat -Clear       # wipe the sink and start fresh
#   .\diagnose.bat -Open        # open the report when it is done
#
# The report is written to diagnostics\REPORT.md. Hand that one file over.

param(
    [double]$Hours = 0,
    [int]$Top = 12,
    [switch]$Clear,
    [switch]$Open
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Backend = Join-Path $Root "backend"
$DiagDir = Join-Path $Root "diagnostics"

# Prefer the project venv; fall back to whatever python is on PATH so this
# still works before setup.ps1 has been run.
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $Python) {
        Write-Host "Python not found. Run setup.bat first." -ForegroundColor Red
        exit 1
    }
    Write-Host "Note: using system Python (backend\.venv not found)." -ForegroundColor Yellow
}

Push-Location $Backend
try {
    if ($Clear) {
        & $Python -m core.diagnostics clear
        Write-Host ""
    }

    $diagArgs = @("-m", "core.diagnostics", "report", "--top", "$Top")
    if ($Hours -gt 0) { $diagArgs += @("--hours", "$Hours") }

    Write-Host "Building diagnostics report..." -ForegroundColor Cyan
    & $Python @diagArgs
    $scanFailed = ($LASTEXITCODE -ne 0)
}
finally {
    Pop-Location
}

$Report = Join-Path $DiagDir "REPORT.md"
Write-Host ""

if ($scanFailed) {
    # The leak scanner found a credential shape in the captured data. Redaction
    # is supposed to make this impossible, so treat it as a real problem rather
    # than a warning to scroll past.
    Write-Host "=======================================================" -ForegroundColor Red
    Write-Host " LEAK SCAN FAILED - do NOT share these files as-is." -ForegroundColor Red
    Write-Host " See the matches listed above, then run:" -ForegroundColor Red
    Write-Host "   .\diagnose.bat -Clear" -ForegroundColor Red
    Write-Host "=======================================================" -ForegroundColor Red
}
elseif (Test-Path $Report) {
    Write-Host "Report ready:" -ForegroundColor Green
    Write-Host "  $Report" -ForegroundColor White
    Write-Host ""
    Write-Host "Hand that file to Claude, or paste its contents into the chat." -ForegroundColor Gray
    if ($Open) { Start-Process $Report }
}
else {
    Write-Host "No report was produced. Has the app been run since diagnostics were enabled?" -ForegroundColor Yellow
}

if ($scanFailed) { exit 1 }
