#!/bin/bash

# 快速打包脚本 (Fast Build Script)
# 用途：跳过 TypeScript 类型检查，仅构建当前架构，使用最低压缩比，实现最快打包速度。
# Usage: ./fast-build.sh

set -e # 遇到错误立即退出

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

echo "🚀 [1/3] 开始快速打包流程..."
echo "📍 工作目录: $PROJECT_ROOT"

# 1. 构建前端 (跳过 tsc 类型检查)
echo "📦 [2/3] 构建前端资源 (Vite)..."
cd "$PROJECT_ROOT/frontend"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "⚠️  未发现 frontend/node_modules，正在安装依赖..."
    npm install
fi

# 直接运行 vite build，跳过 tsc -b 以节省时间
# 注意：这不会检查类型错误，仅用于快速生成构建产物
../node_modules/.bin/vite build

if [ $? -ne 0 ]; then
    echo "❌ 前端构建失败！"
    exit 1
fi

cd "$PROJECT_ROOT"

# 2. 生成图标 (仅 macOS 需要，且仅当图标不存在或需要更新时)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [ ! -f "assets/icon.icns" ]; then
        echo "🎨 生成 macOS 图标..."
        node create-platform-icons.cjs
    fi
fi

# 3. Electron 打包
echo "🏗️  [3/3] 打包 Electron 应用..."

# 确定架构
ARCH=$(uname -m)
if [ "$ARCH" == "x86_64" ]; then
    BUILDER_ARCH="--x64"
elif [ "$ARCH" == "arm64" ]; then
    BUILDER_ARCH="--arm64"
else
    BUILDER_ARCH=""
fi

echo "ℹ️  当前架构: $ARCH"

# 执行打包
# -c.compression=store: 不压缩，打包速度最快
# -c.mac.identity=null: 跳过代码签名 (仅用于本地测试)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 正在构建 macOS 应用 (dir，用于本地启动测试)..."
    ./node_modules/.bin/electron-builder build --mac $BUILDER_ARCH --dir -c.compression=store -c.mac.identity=null -c.mac.target=dir
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "🐧 正在构建 Linux 应用..."
    ./node_modules/.bin/electron-builder build --linux -c.compression=store
    
else
    echo "💻 正在构建当前平台应用..."
    ./node_modules/.bin/electron-builder build --dir
fi

echo ""
echo "✅ 打包完成！"
echo "📂 输出目录: $PROJECT_ROOT/dist-electron"
