# xPaste 开发环境停止脚本
# 适用于 Windows PowerShell

Write-Host "🛑 停止 xPaste 开发服务..." -ForegroundColor Red
Write-Host ""

# 函数：终止指定端口的进程
function Stop-ProcessByPort {
    param([int]$Port, [string]$ServiceName)
    
    Write-Host "🔍 检查端口 $Port ($ServiceName)..." -ForegroundColor Cyan
    
    $connections = netstat -ano | Select-String ":$Port"
    if ($connections.Count -eq 0) {
        Write-Host "   端口 $Port 没有活动连接" -ForegroundColor Gray
        return
    }
    
    # 提取进程 ID
    $processes = $connections | ForEach-Object { 
        ($_ -split '\s+')[-1] 
    } | Sort-Object -Unique
    
    foreach ($processId in $processes) {
        if ($processId -match '^\d+$') {
            try {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "   终止进程: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
                    Stop-Process -Id $processId -Force
                    Write-Host "   ✅ 已终止 PID: $processId" -ForegroundColor Green
                }
            } catch {
                Write-Host "   ⚠️  无法终止 PID: $processId - $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

# 函数：终止包含特定关键词的进程
function Stop-ProcessByName {
    param([string[]]$Keywords)
    
    foreach ($keyword in $Keywords) {
        Write-Host "🔍 查找包含 '$keyword' 的进程..." -ForegroundColor Cyan
        
        $processes = Get-Process | Where-Object { 
            $_.ProcessName -like "*$keyword*" -or 
            $_.MainWindowTitle -like "*$keyword*"
        }
        
        foreach ($process in $processes) {
            try {
                Write-Host "   终止进程: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Yellow
                Stop-Process -Id $process.Id -Force
                Write-Host "   ✅ 已终止: $($process.ProcessName)" -ForegroundColor Green
            } catch {
                Write-Host "   ⚠️  无法终止: $($process.ProcessName) - $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

try {
    # 停止端口相关的服务
    Stop-ProcessByPort -Port 8080 -ServiceName "后台 API 服务"
    Stop-ProcessByPort -Port 5173 -ServiceName "前端开发服务器"
    
    # 停止可能的相关进程
    Write-Host ""
    Stop-ProcessByName -Keywords @("vite", "go", "pnpm", "node")
    
    # 额外检查：终止标题包含 xPaste 的窗口
    Write-Host ""
    Write-Host "🔍 查找 xPaste 相关窗口..." -ForegroundColor Cyan
    
    $xpasteProcesses = Get-Process | Where-Object { 
        $_.MainWindowTitle -like "*xPaste*" -or
        $_.MainWindowTitle -like "*sync-api*" -or
        $_.MainWindowTitle -like "*desktop*"
    }
    
    foreach ($process in $xpasteProcesses) {
        try {
            Write-Host "   终止窗口: $($process.MainWindowTitle) (PID: $($process.Id))" -ForegroundColor Yellow
            Stop-Process -Id $process.Id -Force
            Write-Host "   ✅ 已终止窗口进程" -ForegroundColor Green
        } catch {
            Write-Host "   ⚠️  无法终止窗口进程 - $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "🎉 停止操作完成！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 最终状态检查:" -ForegroundColor White
    
    # 检查端口状态
    $port8080 = netstat -ano | Select-String ":8080"
    $port5173 = netstat -ano | Select-String ":5173"
    
    if ($port8080.Count -eq 0) {
        Write-Host "   端口 8080: ✅ 已释放" -ForegroundColor Green
    } else {
        Write-Host "   端口 8080: ❌ 仍被占用" -ForegroundColor Red
    }
    
    if ($port5173.Count -eq 0) {
        Write-Host "   端口 5173: ✅ 已释放" -ForegroundColor Green
    } else {
        Write-Host "   端口 5173: ❌ 仍被占用" -ForegroundColor Red
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ 停止过程中发生错误: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
