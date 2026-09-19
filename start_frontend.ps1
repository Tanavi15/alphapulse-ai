# ── Install & start frontend ─────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
Set-Location frontend
npm install

Write-Host "`nStarting AlphaPulse AI frontend on http://localhost:5173" -ForegroundColor Green
npm run dev
