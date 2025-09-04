@echo off
chcp 65001 >nul
title xPaste 开发环境启动器

echo.
echo 🚀 启动 xPaste 开发环境...
echo.

REM 检查 pnpm 是否安装
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: pnpm 未安装，请先安装 pnpm
    echo    安装命令: npm install -g pnpm
    pause
    exit /b 1
)

REM 检查 Go 是否安装
go version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: Go 未安装，请先安装 Go
    pause
    exit /b 1
)

echo ✅ 环境检查通过
echo.

echo 📡 启动后台服务 (sync-api)...
start "xPaste 后台服务" cmd /k "cd /d %~dp0services\sync-api && echo 🔧 启动 Go 后台服务... && pnpm dev"

REM 等待 3 秒让后台服务先启动
timeout /t 3 /nobreak >nul

echo 🎨 启动前端服务 (desktop)...
start "xPaste 前端服务" cmd /k "cd /d %~dp0apps\desktop && echo 🎯 启动 React 前端服务... && pnpm dev"

echo.
echo 🎉 正在启动服务...
echo.
echo 📱 访问地址:
echo    前端应用: http://localhost:5173
echo    后台 API: http://localhost:8080
echo.
echo 💡 提示:
echo    - 修改代码后会自动重新加载
echo    - 使用 Ctrl+C 停止服务
echo    - 关闭终端窗口也会停止对应服务
echo.

REM 等待 5 秒后自动打开浏览器
echo 🌐 5秒后自动打开浏览器...
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo 按任意键退出...
pause >nul
