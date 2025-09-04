# xPaste Test Stop Script
# Simple version for testing

Write-Host "Stopping xPaste Development Services..." -ForegroundColor Red
Write-Host ""

# Function to stop processes by port
function Stop-ProcessByPort {
    param([int]$Port, [string]$ServiceName)
    
    Write-Host "Checking port $Port ($ServiceName)..." -ForegroundColor Cyan
    
    $connections = netstat -ano | Select-String ":$Port"
    if ($connections.Count -eq 0) {
        Write-Host "  No active connections on port $Port" -ForegroundColor Gray
        return
    }
    
    # Extract process IDs
    $processes = $connections | ForEach-Object { 
        ($_ -split '\s+')[-1] 
    } | Sort-Object -Unique
    
    foreach ($processId in $processes) {
        if ($processId -match '^\d+$') {
            try {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "  Stopping process: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
                    Stop-Process -Id $processId -Force
                    Write-Host "  Successfully stopped PID: $processId" -ForegroundColor Green
                }
            } catch {
                Write-Host "  Could not stop PID: $processId - $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

try {
    # Stop port-related services
    Stop-ProcessByPort -Port 8080 -ServiceName "Backend API Service"
    Stop-ProcessByPort -Port 5173 -ServiceName "Frontend Dev Server"
    
    Write-Host ""
    Write-Host "Stop operation completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Final status check:" -ForegroundColor White
    
    # Check port status
    $port8080 = netstat -ano | Select-String ":8080"
    $port5173 = netstat -ano | Select-String ":5173"
    
    if ($port8080.Count -eq 0) {
        Write-Host "  Port 8080: Released" -ForegroundColor Green
    } else {
        Write-Host "  Port 8080: Still in use" -ForegroundColor Red
    }
    
    if ($port5173.Count -eq 0) {
        Write-Host "  Port 5173: Released" -ForegroundColor Green
    } else {
        Write-Host "  Port 5173: Still in use" -ForegroundColor Red
    }
    
} catch {
    Write-Host ""
    Write-Host "Error during stop operation: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
