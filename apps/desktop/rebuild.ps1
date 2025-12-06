 
# 设置控制台为 UTF-8，避免中文乱码
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp.com 65001 | Out-Null

Write-Host "🔧 重建桌面前端..." -ForegroundColor Cyan
cd "$PSScriptRoot\frontend"
pnpm install
pnpm build
Write-Host "✅ 重建完成" -ForegroundColor Green
