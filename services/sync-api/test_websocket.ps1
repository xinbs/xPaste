# WebSocket 连接测试脚本

# 首先登录获取token
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"xinbs","password":"123456","device_id":"js8uj1"}'

if ($loginResponse.success) {
    $token = $loginResponse.data.access_token
    $deviceId = "js8uj1"
    
    Write-Host "Login successful, token obtained: $($token.Substring(0, 50))..."
    
    # 构建WebSocket URL
    $wsUrl = "ws://localhost:8080/ws?device_id=$deviceId&token=$token"
    Write-Host "WebSocket URL: $wsUrl"
    
    # 使用.NET WebSocket客户端测试连接
    Add-Type -AssemblyName System.Net.WebSockets
    Add-Type -AssemblyName System.Threading.Tasks
    
    try {
        $ws = New-Object System.Net.WebSockets.ClientWebSocket
        $uri = New-Object System.Uri($wsUrl)
        
        Write-Host "Attempting to connect to WebSocket..."
        
        # 设置连接超时
        $cts = New-Object System.Threading.CancellationTokenSource
        $cts.CancelAfter(10000) # 10秒超时
        
        # 尝试连接
        $connectTask = $ws.ConnectAsync($uri, $cts.Token)
        $connectTask.Wait()
        
        if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            Write-Host "✅ WebSocket connection successful!" -ForegroundColor Green
            Write-Host "Connection state: $($ws.State)"
            
            # 发送ping消息
            $pingMessage = '{"type":"ping","timestamp":"' + (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ") + '"}'
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($pingMessage)
            $segment = New-Object System.ArraySegment[byte]($buffer)
            
            Write-Host "Sending ping message: $pingMessage"
            $sendTask = $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token)
            $sendTask.Wait()
            
            Write-Host "✅ Ping message sent successfully!" -ForegroundColor Green
            
            # 等待响应
            $receiveBuffer = New-Object byte[] 1024
            $receiveSegment = New-Object System.ArraySegment[byte]($receiveBuffer)
            
            Write-Host "Waiting for response..."
            $receiveTask = $ws.ReceiveAsync($receiveSegment, $cts.Token)
            
            if ($receiveTask.Wait(5000)) { # 等待5秒
                $result = $receiveTask.Result
                $receivedMessage = [System.Text.Encoding]::UTF8.GetString($receiveBuffer, 0, $result.Count)
                Write-Host "✅ Received response: $receivedMessage" -ForegroundColor Green
            } else {
                Write-Host "⚠️ No response received within 5 seconds" -ForegroundColor Yellow
            }
            
            # 关闭连接
            $closeTask = $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test completed", $cts.Token)
            $closeTask.Wait()
            Write-Host "Connection closed"
            
        } else {
            Write-Host "❌ WebSocket connection failed!" -ForegroundColor Red
            Write-Host "Connection state: $($ws.State)"
        }
        
    } catch {
        Write-Host "❌ WebSocket connection error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Full error: $($_.Exception.ToString())"
    } finally {
        if ($ws) {
            $ws.Dispose()
        }
        if ($cts) {
            $cts.Dispose()
        }
    }
    
} else {
    Write-Host "❌ Login failed: $($loginResponse.message)" -ForegroundColor Red
}

Write-Host "Test completed."