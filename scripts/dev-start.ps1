# xPaste 开发环境启动脚本
# 用于同时启动所有开发服务

Write-Host "启动 xPaste 开发环境..." -ForegroundColor Green

# 检查必要的工具
Write-Host "检查开发环境..." -ForegroundColor Yellow

# 检查 Go
if (!(Get-Command "go" -ErrorAction SilentlyContinue)) {
    Write-Host "错误: 未找到 Go，请先安装 Go" -ForegroundColor Red
    exit 1
}

# 检查 Node.js
if (!(Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "错误: 未找到 Node.js，请先安装 Node.js" -ForegroundColor Red
    exit 1
}

# 检查 pnpm
if (!(Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Write-Host "错误: 未找到 pnpm，请先安装 pnpm" -ForegroundColor Red
    exit 1
}

# 获取脚本所在目录的父目录（项目根目录）
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "项目根目录: $ProjectRoot" -ForegroundColor Cyan

# 启动函数
function Start-Service {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Command,
        [int]$Port
    )
    
    Write-Host "启动 $Name (端口: $Port)..." -ForegroundColor Yellow
    
    # 检查端口是否被占用
    $PortInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($PortInUse) {
        Write-Host "警告: 端口 $Port 已被占用，$Name 可能无法启动" -ForegroundColor Red
    }
    
    # 启动服务
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd '$Path'; $Command" -WindowStyle Normal
    
    Write-Host "$Name 启动完成" -ForegroundColor Green
    Start-Sleep -Seconds 2
}

# 启动各个服务
Write-Host "开始启动各个服务..." -ForegroundColor Green

# 1. 启动 Admin API (后端管理API)
Start-Service -Name "Admin API" -Path "$ProjectRoot\services\admin-api" -Command "go run main.go" -Port 8081

# 2. 启动 Admin Web (管理后台前端)
Start-Service -Name "Admin Web" -Path "$ProjectRoot\apps\admin-web" -Command "pnpm dev" -Port 3001

# 3. 启动 Sync API (同步服务API)
Start-Service -Name "Sync API" -Path "$ProjectRoot\services\sync-api" -Command "go run main.go" -Port 8080

# 4. 启动 Desktop Frontend (桌面端前端)
Start-Service -Name "Desktop Frontend" -Path "$ProjectRoot\apps\desktop\frontend" -Command "pnpm dev" -Port 3000

Write-Host "\n所有服务启动完成！" -ForegroundColor Green
Write-Host "服务访问地址:" -ForegroundColor Cyan
Write-Host "  - Admin Web (管理后台): http://localhost:3001" -ForegroundColor White
Write-Host "  - Desktop Frontend (桌面端): http://localhost:3000" -ForegroundColor White
Write-Host "  - Admin API: http://localhost:8081" -ForegroundColor White
Write-Host "  - Sync API: http://localhost:8080" -ForegroundColor White

Write-Host "\n按任意键退出..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")