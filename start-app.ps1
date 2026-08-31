<#
    VivAI - one-shot dev launcher (Windows / PowerShell)
    -------------------------------------------------------------------
    - Frees ONLY the ports this app needs (frontend 8080, backend 8000).
      It never touches any other process/port.
    - Sets up the Python backend venv + installs dependencies.
    - Installs frontend deps with Bun (first run only).
    - Launches the backend and frontend in their own windows, then opens the
      site in your browser. The backend handles presentation extraction.

    HOW TO RUN
      * Easiest: double-click  start-app.bat  (recommended).
      * Or in a PowerShell window:  right-click this file > "Run with PowerShell".
      * Or from a terminal:  powershell -ExecutionPolicy Bypass -File .\start-app.ps1
#>

$ErrorActionPreference = "Stop"

# --- Config -----------------------------------------------------------------
$FrontendPort = 8080          # Vite dev server (see vite.config.ts)
$BackendPort  = 8000          # FastAPI / uvicorn (frontend's default VITE_API_URL)
$Root         = $PSScriptRoot # repo root = folder this script lives in
$BackendDir   = Join-Path $Root "backend"

Write-Host ""
Write-Host "===== VivAI launcher =====" -ForegroundColor Cyan
Write-Host "Project: $Root"
Write-Host ""

# --- Helper: free a single port (only the PID bound to THAT port) -----------
function Clear-Port {
    param([int]$Port)

    $stopped = $false

    # Preferred modern API
    $conns = $null
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop |
                 Where-Object { $_.State -eq "Listen" -or $_.OwningProcess }
    } catch {
        $conns = $null
    }

    if ($conns) {
        $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $procIds) {
            if ($procId -and $procId -ne 0) {
                $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
                $name = if ($p) { $p.ProcessName } else { "unknown" }
                Write-Host ("  Port {0}: stopping {1} (PID {2})" -f $Port, $name, $procId) -ForegroundColor Yellow
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                $stopped = $true
            }
        }
    }
    else {
        # Fallback for systems without Get-NetTCPConnection: parse netstat.
        $lines = netstat -ano | Select-String -Pattern (":{0}\s" -f $Port)
        foreach ($line in $lines) {
            $cols = ($line.ToString() -split "\s+") | Where-Object { $_ -ne "" }
            $procId = $cols[-1]
            # Only act on LISTENING sockets so we don't kill unrelated clients.
            if ($line -match "LISTENING" -and $procId -match '^\d+$' -and $procId -ne "0") {
                $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
                $name = if ($p) { $p.ProcessName } else { "unknown" }
                Write-Host ("  Port {0}: stopping {1} (PID {2})" -f $Port, $name, $procId) -ForegroundColor Yellow
                Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
                $stopped = $true
            }
        }
    }

    if (-not $stopped) {
        Write-Host ("  Port {0}: already free" -f $Port) -ForegroundColor DarkGray
    }
}

# --- Helper: resolve a working Python launcher ------------------------------
function Get-PythonCmd {
    foreach ($cand in @("py", "python", "python3")) {
        try {
            $v = & $cand --version 2>&1
            if ($LASTEXITCODE -eq 0 -and $v -match "Python 3") {
                if ($cand -eq "py") { return @("py", "-3") }
                return @($cand)
            }
        } catch { }
    }
    return $null
}

# --- 1. Free the two ports we own ------------------------------------------
Write-Host "[1/5] Freeing app ports ($BackendPort, $FrontendPort)..." -ForegroundColor Cyan
Clear-Port -Port $BackendPort
Clear-Port -Port $FrontendPort
Write-Host ""

# --- 2. Verify tooling ------------------------------------------------------
Write-Host "[2/5] Checking tools..." -ForegroundColor Cyan

$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
    # Bun not on PATH - try common install locations and add to this
    # session's PATH (child server windows inherit it automatically).
    $bunCandidates = @()
    if ($env:BUN_INSTALL) { $bunCandidates += Join-Path $env:BUN_INSTALL "bin\bun.exe" }
    $bunCandidates += Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
    foreach ($cand in $bunCandidates) {
        if (Test-Path $cand) {
            $env:Path = "$(Split-Path $cand -Parent);$env:Path"
            $bun = Get-Command bun -ErrorAction SilentlyContinue
            break
        }
    }
}
if (-not $bun) {
    Write-Host "  ERROR: 'bun' is not installed or not on PATH." -ForegroundColor Red
    Write-Host "         Install it from https://bun.sh then re-run this script." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  bun: $($bun.Source)" -ForegroundColor DarkGray

# Wrap in @() so a single-element result (e.g. @("python")) is not unwrapped
# by PowerShell into a scalar string (which would make $pyCmd[0] == "p").
$pyCmd = @(Get-PythonCmd)
if (-not $pyCmd -or $pyCmd.Count -eq 0) {
    Write-Host "  ERROR: Python 3 was not found (tried py, python, python3)." -ForegroundColor Red
    Write-Host "         Install Python 3.10+ from https://python.org then re-run." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  python: $($pyCmd -join ' ')" -ForegroundColor DarkGray
Write-Host ""

# --- 3. Backend setup (venv + deps + .env) ----------------------------------
Write-Host "[3/5] Preparing backend..." -ForegroundColor Cyan

$VenvDir    = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "  Creating virtual environment (.venv)..."
    $pyExe  = $pyCmd[0]
    $pyArgs = @()
    if ($pyCmd.Count -gt 1) { $pyArgs += $pyCmd[1..($pyCmd.Count - 1)] }
    $pyArgs += @("-m", "venv", ".venv")
    Push-Location $BackendDir
    & $pyExe @pyArgs
    Pop-Location
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "  ERROR: failed to create the backend virtual environment." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Install/refresh Python deps (fast no-op once satisfied).
Write-Host "  Installing backend dependencies..."
& $VenvPython -m pip install --quiet --disable-pip-version-check --upgrade pip
& $VenvPython -m pip install --quiet --disable-pip-version-check -r (Join-Path $BackendDir "requirements.txt")

# Ensure backend/.env exists (copy the example the first time).
$BackendEnv        = Join-Path $BackendDir ".env"
$BackendEnvExample = Join-Path $BackendDir ".env.example"
if ((-not (Test-Path $BackendEnv)) -and (Test-Path $BackendEnvExample)) {
    Copy-Item $BackendEnvExample $BackendEnv
    Write-Host "  Created backend\.env from .env.example." -ForegroundColor Yellow
    Write-Host "  >>> Fill in SUPABASE_* and GEMINI_API_KEY in backend\.env for full features." -ForegroundColor Yellow
}
Write-Host ""

# --- 4. Frontend setup (deps) ----------------------------------------------
Write-Host "[4/5] Preparing frontend..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "  Installing frontend dependencies (bun install)..."
    Push-Location $Root
    bun install
    Pop-Location
} else {
    Write-Host "  node_modules present - skipping install." -ForegroundColor DarkGray
}
Write-Host ""

# --- 5. Launch the API and frontend -----------------------------------------
Write-Host "[5/5] Starting servers..." -ForegroundColor Cyan

# One id per launch, shared by both windows, so related errors can be tied to
# the same run in the diagnostics report.
$RunId = "run-" + (Get-Date -Format "yyyyMMdd-HHmmss")

$backendCmd = "Set-Location '$BackendDir'; " +
              "`$env:HORUX_RUN_ID='$RunId'; " +
              "Write-Host 'Backend  -> http://localhost:$BackendPort' -ForegroundColor Green; " +
              "& '$VenvPython' -m uvicorn main:app --reload --port $BackendPort"

$frontendCmd = "Set-Location '$Root'; " +
               "`$env:HORUX_RUN_ID='$RunId'; " +
               "Write-Host 'Frontend -> http://localhost:$FrontendPort' -ForegroundColor Green; " +
               "bun run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd  | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null

Write-Host "  Backend  window opened -> http://localhost:$BackendPort  (API docs: /docs)" -ForegroundColor Green
Write-Host "  Frontend window opened -> http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "  Errors are captured to diagnostics\  ->  run diagnose.bat to build a report" -ForegroundColor Gray
Write-Host ""
Write-Host "Waiting for the frontend to boot, then opening your browser..." -ForegroundColor Cyan

# Give Vite a moment to bind the port, then open the site.
Start-Sleep -Seconds 6
Start-Process "http://localhost:$FrontendPort"

Write-Host ""
Write-Host "Done. Two app windows are running." -ForegroundColor Cyan
Write-Host "Close those windows (or press Ctrl+C in them) to stop the app." -ForegroundColor DarkGray
Write-Host ""
