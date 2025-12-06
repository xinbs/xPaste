# 设置控制台为 UTF-8，避免中文乱码
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp.com 65001 | Out-Null

# xPaste 开发环境一键启动脚本
# 适用于 Windows PowerShell

Write-Host "🚀 启动 xPaste 开发环境..." -ForegroundColor Green
Write-Host ""

# 检查 pnpm 是否安装
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: pnpm 未安装，请先安装 pnpm" -ForegroundColor Red
    Write-Host "   安装命令: npm install -g pnpm" -ForegroundColor Yellow
    exit 1
}

# 检查 Go 是否安装
if (!(Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: Go 未安装，请先安装 Go" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 环境检查通过" -ForegroundColor Green
Write-Host ""

# 函数：检查端口是否被占用
function Test-Port {
    param([int]$Port)
    $result = netstat -ano | Select-String ":$Port"
    return $result.Count -gt 0
}

# 函数：启动后台服务
function Start-Backend {
    Write-Host "📡 启动后台服务 (sync-api)..." -ForegroundColor Cyan
    
    # 检查端口 8080 是否被占用
    if (Test-Port -Port 8080) {
        Write-Host "⚠️  端口 8080 已被占用，尝试终止现有进程..." -ForegroundColor Yellow
        $processes = netstat -ano | Select-String ":8080" | ForEach-Object { 
            ($_ -split '\s+')[-1] 
        } | Sort-Object -Unique
        
        foreach ($processId in $processes) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Write-Host "   已终止进程 PID: $processId" -ForegroundColor Yellow
            } catch {
                # 忽略错误
            }
        }
        Start-Sleep -Seconds 2
    }
    
    # 启动后台服务
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\services\sync-api'; Write-Host '🔧 启动 Go 后台服务...' -ForegroundColor Magenta; pnpm dev" -WindowStyle Normal
    
    # 等待服务启动
    Write-Host "   等待后台服务启动..." -ForegroundColor Gray
    $timeout = 30
    $elapsed = 0
    
    while ($elapsed -lt $timeout) {
        if (Test-Port -Port 8080) {
            Write-Host "✅ 后台服务启动成功 (端口: 8080)" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
        $elapsed++
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "❌ 后台服务启动超时" -ForegroundColor Red
    return $false
}

# 函数：启动前端服务
function Start-Frontend {
    Write-Host "🎨 启动前端服务 (desktop)..." -ForegroundColor Cyan
    
    # 检查端口 5173 是否被占用
    if (Test-Port -Port 5173) {
        Write-Host "⚠️  端口 5173 已被占用，尝试终止现有进程..." -ForegroundColor Yellow
        $processes = netstat -ano | Select-String ":5173" | ForEach-Object { 
            ($_ -split '\s+')[-1] 
        } | Sort-Object -Unique
        
        foreach ($processId in $processes) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Write-Host "   已终止进程 PID: $processId" -ForegroundColor Yellow
            } catch {
                # 忽略错误
            }
        }
        Start-Sleep -Seconds 2
    }
    
    # 启动前端服务
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\desktop'; Write-Host '🎯 启动 React 前端服务...' -ForegroundColor Magenta; pnpm dev" -WindowStyle Normal
    
    # 等待服务启动
    Write-Host "   等待前端服务启动..." -ForegroundColor Gray
    $timeout = 30
    $elapsed = 0
    
    while ($elapsed -lt $timeout) {
        if (Test-Port -Port 5173) {
            Write-Host "✅ 前端服务启动成功 (端口: 5173)" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
        $elapsed++
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "❌ 前端服务启动超时" -ForegroundColor Red
    return $false
}

# 主启动流程
try {
    # 启动后台服务
    $backendSuccess = Start-Backend
    Start-Sleep -Seconds 2
    
    # 启动前端服务
    $frontendSuccess = Start-Frontend
    Start-Sleep -Seconds 2
    
    Write-Host ""
    Write-Host "📊 启动结果:" -ForegroundColor White
    if ($backendSuccess) {
        Write-Host "   后台服务 (sync-api): ✅ 运行中" -ForegroundColor Green
    } else {
        Write-Host "   后台服务 (sync-api): ❌ 失败" -ForegroundColor Red
    }
    
    if ($frontendSuccess) {
        Write-Host "   前端服务 (desktop): ✅ 运行中" -ForegroundColor Green
    } else {
        Write-Host "   前端服务 (desktop): ❌ 失败" -ForegroundColor Red
    }
    
    if ($backendSuccess -and $frontendSuccess) {
        Write-Host ""
        Write-Host "🎉 所有服务启动成功！" -ForegroundColor Green
        Write-Host ""
        Write-Host "📱 访问地址:" -ForegroundColor White
        Write-Host "   前端应用: http://localhost:5173" -ForegroundColor Cyan
        Write-Host "   后台 API: http://localhost:8080" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "💡 提示:" -ForegroundColor Yellow
        Write-Host "   - 修改代码后会自动重新加载" -ForegroundColor Gray
        Write-Host "   - 使用 Ctrl+C 停止服务" -ForegroundColor Gray
        Write-Host "   - 关闭终端窗口也会停止对应服务" -ForegroundColor Gray
        
        # 自动打开浏览器
        Write-Host ""
        Write-Host "🌐 正在打开浏览器..." -ForegroundColor Cyan
        Start-Process "http://localhost:5173"
        
    } else {
        Write-Host ""
        Write-Host "⚠️  部分服务启动失败，请检查错误信息" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "🔍 故障排除:" -ForegroundColor White
        Write-Host "   1. 检查是否安装了所有依赖: pnpm install" -ForegroundColor Gray
        Write-Host "   2. 检查端口是否被占用" -ForegroundColor Gray
        Write-Host "   3. 查看服务窗口的错误信息" -ForegroundColor Gray
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ 启动过程中发生错误: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
