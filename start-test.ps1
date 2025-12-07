$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp.com 65001 | Out-Null } catch {}
# xPaste test environment launcher (Windows PowerShell)
$ErrorActionPreference = 'Stop'

Write-Host 'Starting xPaste test environment...'

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: pnpm is not installed. Install with: npm install -g pnpm'
  exit 1
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: Go is not installed.'
  exit 1
}

# start sync-api backend (8080)
Start-Process -FilePath 'pnpm' -ArgumentList 'dev' -WorkingDirectory "$PSScriptRoot\services\sync-api" -WindowStyle Normal
Write-Host 'Started backend (sync-api) in a new window.'

# start desktop frontend (5173)
Start-Process -FilePath 'pnpm' -ArgumentList 'dev' -WorkingDirectory "$PSScriptRoot\apps\desktop" -WindowStyle Normal
Write-Host 'Started desktop frontend in a new window.'

# start admin-web (3010)
Start-Process -FilePath 'pnpm' -ArgumentList 'dev' -WorkingDirectory "$PSScriptRoot\apps\admin-web" -WindowStyle Normal
Write-Host 'Started admin-web in a new window.'

# start electron dev (optional)
Start-Process -FilePath 'pnpm' -ArgumentList 'electron:dev' -WorkingDirectory "$PSScriptRoot\apps\desktop" -WindowStyle Normal
Write-Host 'Started Electron (dev) in a new window.'

# Open URLs (frontends)
Start-Process 'http://localhost:5173' | Out-Null
Start-Process 'http://localhost:3010' | Out-Null

Write-Host 'Done.'
