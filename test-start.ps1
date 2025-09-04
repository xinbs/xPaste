# xPaste Test Startup Script
# Simple version for testing

Write-Host "Starting xPaste Development Environment..." -ForegroundColor Green
Write-Host ""

# Check if pnpm is installed
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: pnpm not found. Please install pnpm first." -ForegroundColor Red
    Write-Host "Install command: npm install -g pnpm" -ForegroundColor Yellow
    exit 1
}

# Check if Go is installed
if (!(Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Go not found. Please install Go first." -ForegroundColor Red
    exit 1
}

Write-Host "Environment check passed" -ForegroundColor Green
Write-Host ""

# Function to check if port is in use
function Test-Port {
    param([int]$Port)
    $result = netstat -ano | Select-String ":$Port"
    return $result.Count -gt 0
}

# Start backend service
Write-Host "Starting backend service (sync-api)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\services\sync-api'; Write-Host 'Starting Go backend service...' -ForegroundColor Magenta; pnpm dev" -WindowStyle Normal

# Wait for backend to start
Write-Host "Waiting for backend service to start..." -ForegroundColor Gray
$timeout = 15
$elapsed = 0

while ($elapsed -lt $timeout) {
    if (Test-Port -Port 8080) {
        Write-Host "Backend service started successfully (port: 8080)" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $elapsed++
    Write-Host "." -NoNewline -ForegroundColor Gray
}

if ($elapsed -ge $timeout) {
    Write-Host ""
    Write-Host "Backend service startup timeout" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 2

# Start frontend service
Write-Host "Starting frontend service (desktop)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\desktop'; Write-Host 'Starting React frontend service...' -ForegroundColor Magenta; pnpm dev" -WindowStyle Normal

# Wait for frontend to start
Write-Host "Waiting for frontend service to start..." -ForegroundColor Gray
$timeout = 15
$elapsed = 0

while ($elapsed -lt $timeout) {
    if (Test-Port -Port 5173) {
        Write-Host "Frontend service started successfully (port: 5173)" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $elapsed++
    Write-Host "." -NoNewline -ForegroundColor Gray
}

if ($elapsed -ge $timeout) {
    Write-Host ""
    Write-Host "Frontend service startup timeout" -ForegroundColor Red
}

Write-Host ""
Write-Host "Startup Results:" -ForegroundColor White
Write-Host "  Backend API: http://localhost:8080" -ForegroundColor Cyan
Write-Host "  Frontend App: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
