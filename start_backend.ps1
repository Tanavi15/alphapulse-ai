# ── Install & start backend ──────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
Set-Location backend
python -m pip install -r requirements.txt

Write-Host "`nStarting AlphaPulse AI backend on http://localhost:8000" -ForegroundColor Green
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
