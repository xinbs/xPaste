# 设置生产模式环境变量并启动 Electron
Write-Host "=== 启动生产模式 Electron 应用 ===" -ForegroundColor Green
Write-Host "设置环境变量 NODE_ENV=production" -ForegroundColor Yellow

# 设置环境变量
$env:NODE_ENV = "production"

# 显示当前环境变量
Write-Host "当前 NODE_ENV: $env:NODE_ENV" -ForegroundColor Cyan

# 构建前端（如果需要）
Write-Host "构建前端应用..." -ForegroundColor Yellow
pnpm build

# 启动 Electron
Write-Host "启动 Electron 应用..." -ForegroundColor Yellow
pnpm electron
