# Test script to simulate a second device connecting to WebSocket

# First, register a new device
$registerUrl = "http://localhost:8080/api/v1/auth/register"
$loginUrl = "http://localhost:8080/api/v1/auth/login"

# Use existing user credentials to create a second device
$loginBody = @{
    username = "xinbs"
    password = "123456"
    device_name = "test-device-2"
    platform = "windows"
} | ConvertTo-Json

try {
    Write-Host "Logging in with existing user to create second device..."
    $loginResponse = Invoke-RestMethod -Uri $loginUrl -Method POST -Body $loginBody -ContentType "application/json"
    Write-Host "Login successful: $($loginResponse.message)"
    
    $deviceId = $loginResponse.data.device.device_id
    $token = $loginResponse.data.access_token
    
    Write-Host "Device ID: $deviceId"
    Write-Host "Token: $($token.Substring(0, 50))..."
    
} catch {
    Write-Host "Login failed: $($_.Exception.Message)"
    exit 1
}

# Now connect to WebSocket
$wsUrl = "ws://localhost:8080/ws?device_id=$deviceId&token=$token"
Write-Host "WebSocket URL: $wsUrl"

try {
    Write-Host "Attempting to connect to WebSocket..."
    
    # Create WebSocket client
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $uri = [System.Uri]::new($wsUrl)
    
    # Connect
    $connectTask = $ws.ConnectAsync($uri, [System.Threading.CancellationToken]::None)
    $connectTask.Wait(10000) # 10 second timeout
    
    if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        Write-Host "✅ WebSocket connection successful!"
        Write-Host "Connection state: $($ws.State)"
        
        # Keep connection open for 30 seconds to test
        Write-Host "Keeping connection open for 30 seconds..."
        Start-Sleep -Seconds 30
        
        # Close connection
        $closeTask = $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test completed", [System.Threading.CancellationToken]::None)
        $closeTask.Wait(5000)
        
        Write-Host "✅ Connection closed successfully"
        
    } else {
        Write-Host "❌ WebSocket connection failed. State: $($ws.State)"
    }
    
} catch {
    Write-Host "❌ WebSocket connection error: $($_.Exception.Message)"
    Write-Host "Full error: $($_.Exception)"
}

Write-Host "Test completed."