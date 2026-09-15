```powershell
$root = $PSScriptRoot

# ============================================================
# Configuration
# ============================================================

$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"
$venvPath = Join-Path $backendPath "env"
$requirementsFile = Join-Path $backendPath "requirements.txt"
$packageFile = Join-Path $frontendPath "package.json"

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host "                    VideoVault Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host ""

# ============================================================
# Check required commands
# ============================================================

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python was not found in PATH." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] npm was not found in PATH." -ForegroundColor Red
    exit 1
}

# ============================================================
# Check backend
# ============================================================

if (-not (Test-Path $backendPath)) {
    Write-Host "[ERROR] Backend folder not found: $backendPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $requirementsFile)) {
    Write-Host "[ERROR] requirements.txt not found: $requirementsFile" -ForegroundColor Red
    exit 1
}

# ============================================================
# Create Python virtual environment if needed
# ============================================================

if (-not (Test-Path (Join-Path $venvPath "Scripts\Activate.ps1"))) {
    Write-Host "[SETUP] Python virtual environment not found." -ForegroundColor Yellow
    Write-Host "[SETUP] Creating backend environment..." -ForegroundColor Yellow

    python -m venv $venvPath

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create the Python virtual environment." -ForegroundColor Red
        exit 1
    }

    Write-Host "[OK] Python virtual environment created." -ForegroundColor Green
}
else {
    Write-Host "[OK] Existing Python virtual environment detected." -ForegroundColor Green
}

# ============================================================
# Update backend dependencies
# ============================================================

Write-Host "[SETUP] Updating backend dependencies..." -ForegroundColor Yellow

$pythonExe = Join-Path $venvPath "Scripts\python.exe"

& $pythonExe -m pip install --upgrade pip

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to update pip." -ForegroundColor Red
    exit 1
}

& $pythonExe -m pip install -r $requirementsFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install backend dependencies." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Backend dependencies are up to date." -ForegroundColor Green

# ============================================================
# Check frontend
# ============================================================

if (-not (Test-Path $frontendPath)) {
    Write-Host "[ERROR] Frontend folder not found: $frontendPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $packageFile)) {
    Write-Host "[ERROR] package.json not found: $packageFile" -ForegroundColor Red
    exit 1
}

# ============================================================
# Install frontend dependencies
# ============================================================

$nodeModulesPath = Join-Path $frontendPath "node_modules"

if (-not (Test-Path $nodeModulesPath)) {
    Write-Host "[SETUP] node_modules not found." -ForegroundColor Yellow
    Write-Host "[SETUP] Installing frontend dependencies..." -ForegroundColor Yellow
}
else {
    Write-Host "[OK] Existing node_modules detected." -ForegroundColor Green
    Write-Host "[SETUP] Checking frontend dependencies..." -ForegroundColor Yellow
}

Push-Location $frontendPath

npm install

if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "[ERROR] Failed to install frontend dependencies." -ForegroundColor Red
    exit 1
}

Pop-Location

Write-Host "[OK] Frontend dependencies are up to date." -ForegroundColor Green


# ============================================================
# Start backend and frontend
# ============================================================

$backendProcess = Start-Process powershell `
    -ArgumentList "-Command", @"
        `$Host.UI.RawUI.WindowTitle = 'VideoVault — Backend'
        Set-Location '$root'
        & '.\backend\env\Scripts\Activate.ps1'

        Write-Host ''
        Write-Host 'Backend running on http://localhost:8000' -ForegroundColor Green
        Write-Host ''

        uvicorn backend.main:app --reload --port 8000

        exit
"@ `
    -PassThru

Start-Sleep -Seconds 2

$frontendProcess = Start-Process powershell `
    -ArgumentList "-Command", @"
        `$Host.UI.RawUI.WindowTitle = 'VideoVault — Frontend'
        Set-Location '$frontendPath'

        Write-Host ''
        Write-Host 'Frontend running on http://localhost:5173' -ForegroundColor Green
        Write-Host ''

        npm run dev

        exit
"@ `
    -PassThru

# ============================================================
# Monitor both processes
# ============================================================

try {
    while (
        -not $backendProcess.HasExited -and
        -not $frontendProcess.HasExited
    ) {
        Start-Sleep -Milliseconds 500

        # Refresh process state
        $backendProcess.Refresh()
        $frontendProcess.Refresh()
    }
}
catch {
    Write-Host ''
    Write-Host '[STOP] Shutdown requested.' -ForegroundColor Yellow
}
finally {
    # ========================================================
    # Stop both processes
    # ========================================================

    if (-not $backendProcess.HasExited) {
        Write-Host '[STOP] Stopping backend...' -ForegroundColor Yellow

        Stop-Process `
            -Id $backendProcess.Id `
            -Force `
            -ErrorAction SilentlyContinue
    }

    if (-not $frontendProcess.HasExited) {
        Write-Host '[STOP] Stopping frontend...' -ForegroundColor Yellow

        Stop-Process `
            -Id $frontendProcess.Id `
            -Force `
            -ErrorAction SilentlyContinue
    }

    Write-Host ''
    Write-Host '[OK] VideoVault has been stopped.' -ForegroundColor Green
}
# ============================================================
# Startup summary
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host "                 VideoVault is starting" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend environment : $venvPath" -ForegroundColor DarkGray
Write-Host "  Backend requirements: $requirementsFile" -ForegroundColor DarkGray
Write-Host "  Frontend packages   : $nodeModulesPath" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Close both PowerShell windows to stop the application." -ForegroundColor DarkGray
Write-Host ""
```
