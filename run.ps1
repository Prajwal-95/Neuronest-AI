# NeuroNest AI - one-command startup for the online prototype
#
# Starts BOTH servers (two windows), seeds demo data if the database is empty,
# and gives you the URLs + demo logins to open.
#
#   .\run.ps1
#
# Close the two new windows (or press Ctrl+C in them) to stop the stack.

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Python = Join-Path $Root 'venv\Scripts\python.exe'

if (-not (Test-Path $Python)) {
    Write-Host "ERROR: virtualenv not found at $Python" -ForegroundColor Red
    Write-Host "Create it first:  python -m venv venv" -ForegroundColor Yellow
    exit 1
}

# --- Seed demo data only when the CONFIGURED database has no users yet -------
# This asks the app's own database layer instead of opening neuronest.db with
# sqlite3. Once USE_SUPABASE=true the local file is irrelevant, and probing it
# either skipped the seed on an empty Supabase project (leaving no demo logins)
# or re-seeded - which DELETES everything - on a populated one.
$Probe = @'
import app.models.models as m
from app.database.db import SessionLocal
try:
    session = SessionLocal()
    print(session.query(m.User).count())
    session.close()
except Exception:
    print(-1)
'@

Push-Location $Backend
$DbCount = & $Python -c $Probe 2>$null
$DbLabel = & $Python -c "from app.database.db import DATABASE_INFO as d; print('{0} -> {1}'.format(d.get('backend'), d.get('host') or d.get('database')))" 2>$null
Pop-Location

Write-Host "Database: $DbLabel" -ForegroundColor Cyan

if ((-not $DbCount) -or ("$DbCount".Trim() -eq '-1')) {
    Write-Host "WARNING: could not read the database, so the demo seed was skipped." -ForegroundColor Yellow
    Write-Host "         Diagnose it with:" -ForegroundColor Yellow
    Write-Host "           cd backend; ..\venv\Scripts\python.exe scripts\supabase_setup.py --check" -ForegroundColor Yellow
} elseif ([int]$DbCount -gt 0) {
    Write-Host "Existing data found ($DbCount users) - keeping it, not seeding." -ForegroundColor DarkGray
} else {
    Write-Host "Seeding demo accounts and 3 weeks of sample sessions..." -ForegroundColor Cyan
    Push-Location $Backend
    & $Python seed.py
    Pop-Location
}

# --- Terminal 1: FastAPI on :8000 ---
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$Backend'; `$env:PYTHONUNBUFFERED='1'; & '$Python' -m uvicorn app.main:app --reload --port 8000"
) -WindowStyle Normal

# --- Terminal 2: Vite on :5173 ---
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$Frontend'; npm run dev"
) -WindowStyle Normal

Start-Sleep -Seconds 6

# --- Wait until the API actually answers, so failures are visible here and not
#     as a confusing "Request failed" in the browser -------------------------
$ApiUp = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2 -UseBasicParsing
        if ($resp.StatusCode -eq 200) { $ApiUp = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}

Write-Host ""
if ($ApiUp) {
    Write-Host "  NeuroNest AI is running." -ForegroundColor Green
} else {
    Write-Host "  WARNING: the API did not come up on port 8000." -ForegroundColor Red
    Write-Host "  The site will show 'Cannot reach the NeuroNest API' until it does." -ForegroundColor Red
    Write-Host "  Check the backend window for the real error (e.g. run the pytest suite)." -ForegroundColor Yellow
}
Write-Host "  Frontend ....... http://localhost:5173" -ForegroundColor White
Write-Host "  API health ..... http://127.0.0.1:8000/health" -ForegroundColor White
Write-Host "  Swagger docs ... http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Demo logins (password: demo1234)" -ForegroundColor Cyan
Write-Host "    Caregiver ... caregiver@neuronest.demo" -ForegroundColor White
Write-Host "    Patient EN .. patient@neuronest.demo" -ForegroundColor White
Write-Host "    Patient HI .. meena@neuronest.demo" -ForegroundColor White
Write-Host ""
Write-Host "  Full guide: LOGIN_DETAILS.md" -ForegroundColor DarkGray
