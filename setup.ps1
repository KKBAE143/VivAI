<#
    VivAI - one-time setup (Windows / PowerShell)
    ------------------------------------------------------------
    Run this ONCE on a fresh Windows machine. It will:

      1. Install Bun (if missing) and put it on PATH.
      2. Install Python 3.10+ (if missing, via winget).
      3. Create the backend virtual environment and install ALL
         Python packages (runtime + dev/test).
      4. Install ALL frontend packages (bun install).
      5. Create the env files with placeholder values:
           - backend\.env   (Supabase / Gemini keys - fill these in)
           - .env.local     (frontend API URL - works out of the box)

    After it finishes, edit backend\.env with your real keys, then run
    start-app.bat (or start-app.ps1) to launch the app.

    HOW TO RUN
      * Easiest: double-click  setup.bat  (recommended).
      * Or from a terminal:  powershell -ExecutionPolicy Bypass -File .\setup.ps1

    Safe to re-run: every step is skipped if already done.
#>

$ErrorActionPreference = "Stop"

# --- Config -----------------------------------------------------------------
$Root       = $PSScriptRoot # repo root = folder this script lives in
$BackendDir = Join-Path $Root "backend"
$BunBinDir  = Join-Path $env:USERPROFILE ".bun\bin"

Write-Host ""
Write-Host "===== VivAI - first-time setup =====" -ForegroundColor Cyan
Write-Host "Project: $Root"
Write-Host ""

# --- Helpers ----------------------------------------------------------------
function Add-ToSessionPath {
    param([string]$Dir)
    if (($env:Path -split ";") -notcontains $Dir) {
        $env:Path = "$Dir;$env:Path"
    }
}

function Add-ToUserPath {
    param([string]$Dir)
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $userPath) { $userPath = "" }
    if (($userPath -split ";") -notcontains $Dir) {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$Dir".Trim(";"), "User")
        return $true
    }
    return $false
}

function Update-SessionPathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

# Resolve a working Python 3.10+ launcher, or $null.
function Get-PythonCmd {
    # 1) Launchers on PATH
    foreach ($cand in @("py", "python", "python3")) {
        try {
            $v = & $cand --version 2>&1
            if ($LASTEXITCODE -eq 0 -and "$v" -match "Python (\d+)\.(\d+)") {
                $major = [int]$Matches[1]
                $minor = [int]$Matches[2]
                if ($major -eq 3 -and $minor -ge 10) {
                    if ($cand -eq "py") { return @("py", "-3") }
                    return @($cand)
                }
            }
        } catch { }
    }
    # 2) Standard per-user install dirs (installed but not on PATH)
    $progDir = Join-Path $env:LOCALAPPDATA "Programs\Python"
    if (Test-Path $progDir) {
        $dirs = Get-ChildItem $progDir -Directory -Filter "Python3*" | Sort-Object Name -Descending
        foreach ($d in $dirs) {
            $exe = Join-Path $d.FullName "python.exe"
            if (Test-Path $exe) {
                try {
                    $v = & $exe --version 2>&1
                    if ($LASTEXITCODE -eq 0 -and "$v" -match "Python (\d+)\.(\d+)") {
                        if ([int]$Matches[1] -eq 3 -and [int]$Matches[2] -ge 10) { return @($exe) }
                    }
                } catch { }
            }
        }
    }
    return $null
}

# --- 1. Bun -----------------------------------------------------------------
Write-Host "[1/5] Checking Bun..." -ForegroundColor Cyan

$bun = Get-Command bun -ErrorAction SilentlyContinue

# Not on PATH? Maybe already installed at the default location.
if (-not $bun -and (Test-Path (Join-Path $BunBinDir "bun.exe"))) {
    Add-ToSessionPath $BunBinDir
    $bun = Get-Command bun -ErrorAction SilentlyContinue
}

# Still nothing? Install it (official installer, no admin needed).
if (-not $bun) {
    Write-Host "  Bun not found - installing via https://bun.sh ..." -ForegroundColor Yellow
    try {
        Invoke-RestMethod "https://bun.sh/install.ps1" | Invoke-Expression
    } catch {
        Write-Host "  ERROR: Bun installation failed ($($_.Exception.Message))." -ForegroundColor Red
        Write-Host "         Install manually from https://bun.sh then re-run this script." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Add-ToSessionPath $BunBinDir
    $bun = Get-Command bun -ErrorAction SilentlyContinue
}

if (-not $bun) {
    Write-Host "  ERROR: Bun was installed but could not be found." -ForegroundColor Red
    Write-Host "         Close this window, open a NEW terminal, and re-run this script." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Persist to the user PATH so future terminals see bun too.
if (Add-ToUserPath $BunBinDir) {
    Write-Host "  Added $BunBinDir to your user PATH (new terminals will see bun)." -ForegroundColor DarkGray
}
Write-Host "  bun: $($bun.Source)  ($(bun --version))" -ForegroundColor DarkGray
Write-Host ""

# --- 2. Python 3.10+ ---------------------------------------------------------
Write-Host "[2/5] Checking Python 3.10+..." -ForegroundColor Cyan

$VenvDir    = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

# A working existing venv means we don't need a system Python at all.
$venvWorks = $false
if (Test-Path $VenvPython) {
    try {
        $vv = & $VenvPython --version 2>&1
        if ($LASTEXITCODE -eq 0 -and "$vv" -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge 10) {
            $venvWorks = $true
        }
    } catch { $venvWorks = $false }
}

if ($venvWorks) {
    Write-Host "  Existing backend\.venv works ($((& $VenvPython --version) -join '')) - system Python not required." -ForegroundColor DarkGray
} else {
    $pyCmd = @(Get-PythonCmd)

    if (-not $pyCmd -or $pyCmd.Count -eq 0) {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Host "  Python not found - installing Python 3.12 via winget (this can take a few minutes)..." -ForegroundColor Yellow
            winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
            Update-SessionPathFromRegistry
            $pyCmd = @(Get-PythonCmd)
        }
    }

    if (-not $pyCmd -or $pyCmd.Count -eq 0) {
        Write-Host "  ERROR: Python 3.10+ was not found and could not be installed automatically." -ForegroundColor Red
        Write-Host "         Install it from https://python.org (tick 'Add python.exe to PATH')" -ForegroundColor Red
        Write-Host "         then re-run this script." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  python: $($pyCmd -join ' ')" -ForegroundColor DarkGray
}
Write-Host ""

# --- 3. Backend: venv + all Python packages ----------------------------------
Write-Host "[3/5] Setting up backend (venv + packages)..." -ForegroundColor Cyan

if (-not $venvWorks) {
    Write-Host "  Creating virtual environment (backend\.venv)..."
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
} else {
    Write-Host "  Virtual environment ready." -ForegroundColor DarkGray
}

Write-Host "  Installing runtime dependencies (requirements.txt)..."
& $VenvPython -m pip install --quiet --disable-pip-version-check --upgrade pip
& $VenvPython -m pip install --quiet --disable-pip-version-check -r (Join-Path $BackendDir "requirements.txt")

$ReqDev = Join-Path $BackendDir "requirements-dev.txt"
if (Test-Path $ReqDev) {
    Write-Host "  Installing dev/test dependencies (requirements-dev.txt)..."
    & $VenvPython -m pip install --quiet --disable-pip-version-check -r $ReqDev
}
Write-Host "  Backend packages installed." -ForegroundColor DarkGray
Write-Host ""

# --- 4. Frontend: all packages ------------------------------------------------
Write-Host "[4/5] Installing frontend packages (bun install)..." -ForegroundColor Cyan
Push-Location $Root
bun install
Pop-Location
Write-Host "  Frontend packages installed." -ForegroundColor DarkGray
Write-Host ""

# --- 5. Env files with placeholders -------------------------------------------
Write-Host "[5/5] Creating env files (placeholders)..." -ForegroundColor Cyan

# backend/.env  <- from .env.example if present, else write the template.
$BackendEnv        = Join-Path $BackendDir ".env"
$BackendEnvExample = Join-Path $BackendDir ".env.example"

if (Test-Path $BackendEnv) {
    Write-Host "  backend\.env already exists - leaving it untouched." -ForegroundColor DarkGray
} else {
    if (Test-Path $BackendEnvExample) {
        Copy-Item $BackendEnvExample $BackendEnv
    } else {
        @"
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
STORAGE_BUCKET=uploads

# Gemini (free tier)
GEMINI_API_KEY=your-gemini-api-key

# CORS
CORS_ORIGINS=http://localhost:8080,http://localhost:5173
"@ | Out-File -FilePath $BackendEnv -Encoding utf8
    }
    Write-Host "  Created backend\.env (placeholder values - fill in your real keys)." -ForegroundColor Yellow
}

# .env.local  <- frontend (Vite) env. Safe defaults, works out of the box.
$FrontendEnv = Join-Path $Root ".env.local"
if (Test-Path $FrontendEnv) {
    Write-Host "  .env.local already exists - leaving it untouched." -ForegroundColor DarkGray
} else {
    @"
# Frontend env (Vite). VITE_* vars are exposed to the browser - no secrets here.
# URL of the FastAPI backend started by start-app.ps1
VITE_API_URL=http://localhost:8000
"@ | Out-File -FilePath $FrontendEnv -Encoding utf8
    Write-Host "  Created .env.local (VITE_API_URL=http://localhost:8000)." -ForegroundColor DarkGray
}
Write-Host ""

# --- Done ---------------------------------------------------------------------
Write-Host "===== Setup complete! =====" -ForegroundColor Green
Write-Host ""
Write-Host "ONE manual step remains:" -ForegroundColor Yellow
Write-Host "  1. Open  backend\.env  and replace the placeholders with your real keys:"
Write-Host "       - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY"
Write-Host "         (Supabase project > Settings > API)"
Write-Host "       - GEMINI_API_KEY  (https://aistudio.google.com/apikey)"
Write-Host ""
Write-Host "Then start the app:" -ForegroundColor Cyan
Write-Host "  - Double-click  start-app.bat   (or run  .\start-app.ps1)"
Write-Host "  - Frontend: http://localhost:8080   Backend API docs: http://localhost:8000/docs"
Write-Host ""
Write-Host "Optional: run the DB schema + migrations (backend\supabase_schema.sql," -ForegroundColor DarkGray
Write-Host "backend\migrations\001-009) in your Supabase SQL editor." -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to exit"
