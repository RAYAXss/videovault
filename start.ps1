$root = $PSScriptRoot
$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"
$venvPath = Join-Path $backendPath ".venv"
$requirementsFile = Join-Path $backendPath "requirements.txt"

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host "                    VideoVault Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host ""

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host "[ERROR] Python not found." -ForegroundColor Red; exit 1 }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Host "[ERROR] npm not found." -ForegroundColor Red; exit 1 }

if (-not (Test-Path (Join-Path $venvPath "Scripts\Activate.ps1"))) {
    Write-Host "[SETUP] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv $venvPath
}

$pythonExe = Join-Path $venvPath "Scripts\python.exe"
& $pythonExe -m pip install --upgrade pip -q
& $pythonExe -m pip install -r $requirementsFile -q
Write-Host "[OK] Backend dependencies ready." -ForegroundColor Green

Push-Location $frontendPath
npm install --silent
Pop-Location
Write-Host "[OK] Frontend dependencies ready." -ForegroundColor Green

Write-Host ""
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

$backendProcess = Start-Process powershell -ArgumentList "-Command", @"
    Set-Location '$root'
    & '.\backend\.venv\Scripts\Activate.ps1'
    uvicorn backend.main:app --reload --port 8000
"@ -PassThru

Start-Sleep -Seconds 2

$frontendProcess = Start-Process powershell -ArgumentList "-Command", @"
    Set-Location '$frontendPath'
    npm run dev
"@ -PassThru

try {
    while (-not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
        Start-Sleep -Milliseconds 500
        $backendProcess.Refresh(); $frontendProcess.Refresh()
    }
} finally {
    if (-not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue }
    if (-not $frontendProcess.HasExited) { Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "[OK] VideoVault stopped." -ForegroundColor Green
}
