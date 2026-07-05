<#
    CollegePro Navigator - one-shot dev launcher (Windows / PowerShell)
    -------------------------------------------------------------------
    - Frees ONLY the ports this app needs (frontend 8080, backend 8000).
      It never touches any other process/port.
    - Sets up the Python backend venv + installs deps (first run only).
    - Installs frontend deps with Bun (first run only).
    - Launches the backend (FastAPI/uvicorn) and frontend (Vite) each in
      their own window, then opens the site in your browser.

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
Write-Host "===== CollegePro Navigator launcher =====" -ForegroundColor Cyan
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
    Write-Host "  ERROR: 'bun' is not installed or not on PATH." -ForegroundColor Red
    Write-Host "         Install it from https://bun.sh then re-run this script." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  bun: $($bun.Source)" -ForegroundColor DarkGray

$pyCmd = Get-PythonCmd
if (-not $pyCmd) {
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
    $pyPre  = @()
    if ($pyCmd.Length -gt 1) { $pyPre = $pyCmd[1..($pyCmd.Length - 1)] }
    Push-Location $BackendDir
    & $pyExe @pyPre -m venv .venv
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

# --- 5. Launch both servers in their own windows ----------------------------
Write-Host "[5/5] Starting servers..." -ForegroundColor Cyan

$backendCmd = "Set-Location '$BackendDir'; " +
              "Write-Host 'Backend  -> http://localhost:$BackendPort' -ForegroundColor Green; " +
              "& '$VenvPython' -m uvicorn main:app --reload --port $BackendPort"

$frontendCmd = "Set-Location '$Root'; " +
               "Write-Host 'Frontend -> http://localhost:$FrontendPort' -ForegroundColor Green; " +
               "bun run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd  | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null

Write-Host "  Backend  window opened -> http://localhost:$BackendPort  (API docs: /docs)" -ForegroundColor Green
Write-Host "  Frontend window opened -> http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host ""
Write-Host "Waiting for the frontend to boot, then opening your browser..." -ForegroundColor Cyan

# Give Vite a moment to bind the port, then open the site.
Start-Sleep -Seconds 6
Start-Process "http://localhost:$FrontendPort"

Write-Host ""
Write-Host "Done. Two server windows are running." -ForegroundColor Cyan
Write-Host "Close those windows (or press Ctrl+C in them) to stop the servers." -ForegroundColor DarkGray
Write-Host ""
