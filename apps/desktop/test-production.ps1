# 测试生产模式的 Electron 应用
# 这将显示自定义标题栏和窗口控制按钮

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp.com 65001 | Out-Null

Write-Host "🚀 启动生产模式 Electron 应用..." -ForegroundColor Green
Write-Host ""

# 设置生产环境变量
$env:NODE_ENV = "production"

# 启动 Electron
Write-Host "🎯 环境模式: 生产模式" -ForegroundColor Cyan
Write-Host "📱 特性: 自定义标题栏 + 窗口控制按钮" -ForegroundColor Cyan
Write-Host ""

try {
    pnpm electron
} catch {
    Write-Host "❌ 启动失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
