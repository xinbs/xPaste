 # 设置控制台为 UTF-8，避免中文乱�? [Console]::InputEncoding = [System.Text.Encoding]::UTF8
 [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
 $OutputEncoding = [System.Text.Encoding]::UTF8
 chcp.com 65001 | Out-Null

Write-Host "Start Windows fast build..." -ForegroundColor Green

# 检查依�?function Assert-Command {
  param([string]$cmd, [string]$hint)
  if (!(Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "�?未找到命�? $cmd" -ForegroundColor Red
    if ($hint) { Write-Host "   安装提示: $hint" -ForegroundColor Yellow }
    exit 1
  }
}

Assert-Command node "请安�?Node.js"
Assert-Command pnpm "npm install -g pnpm"

# 进入项目根与前端目录
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptRoot
Write-Host "📍 工作目录: $scriptRoot" -ForegroundColor Cyan

Write-Host "[1/4] Stop running Electron/xPaste processes..." -ForegroundColor Cyan
$procNames = @('xPaste','electron')
foreach ($n in $procNames) {
  Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
}
Start-Sleep -Milliseconds 800
$outDir = Join-Path $scriptRoot 'dist-electron'
if (Test-Path $outDir) {
  try {
    Remove-Item -LiteralPath $outDir -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Host "Warning: cannot clean output dir, continue" -ForegroundColor Yellow
  }
}

# 构建前端资源（跳�?tsc 类型检查以加快速度�?Write-Host "[2/4] Build frontend (Vite)..." -ForegroundColor Cyan
pushd "$scriptRoot\frontend" | Out-Null
if (-not (Test-Path node_modules)) {
  Write-Host "frontend/node_modules not found, installing deps..." -ForegroundColor Yellow
  pnpm install
}
../node_modules/.bin/vite build
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed" -ForegroundColor Red; exit 1 }
popd | Out-Null

# 预处�?winCodeSign 缓存，规�?7zip 创建符号链接权限问题
Write-Host "[3/4] Prepare winCodeSign cache..." -ForegroundColor Cyan
$cacheDir = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
$zipPath = Join-Path $cacheDir 'winCodeSign-2.6.0.7z'
if (-not (Test-Path $zipPath)) {
  Write-Host "   Downloading winCodeSign package..." -ForegroundColor Gray
  Invoke-WebRequest -Uri 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z' -OutFile $zipPath
}
$extractDir = Join-Path $cacheDir 'winCodeSign-2.6.0'
if (-not (Test-Path $extractDir)) {
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  & "$scriptRoot\..\..\node_modules\.pnpm\7zip-bin@5.2.0\node_modules\7zip-bin\win\ia32\7za.exe" x -bd -y -xr!darwin* -xr!linux* -o"$extractDir" "$zipPath"
}

# 执行 Electron Windows 打包（NSIS + Portable），使用最快压�?Write-Host "[4/4] Build Electron Windows app..." -ForegroundColor Cyan
$env:NODE_ENV = "production"
./node_modules/.bin/electron-builder --win
if ($LASTEXITCODE -ne 0) { Write-Host "Windows build failed" -ForegroundColor Red; exit 1 }

Write-Host ""; Write-Host "Build completed" -ForegroundColor Green
Write-Host "Output dir: $outDir" -ForegroundColor Cyan

