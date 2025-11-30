#!/bin/bash
# 为两个服务生成 go.sum 文件

echo "正在为 sync-api 生成 go.sum..."
cd services/sync-api
docker run --rm -v "$(pwd):/app" -w /app golang:1.21-alpine sh -c "apk add --no-cache git && GOPROXY=https://goproxy.cn,direct go mod tidy"

echo "正在为 admin-api 生成 go.sum..."
cd ../admin-api
docker run --rm -v "$(pwd):/app" -w /app golang:1.21-alpine sh -c "apk add --no-cache git && GOPROXY=https://goproxy.cn,direct go mod tidy"

cd ../..
echo "go.sum 文件生成完成！"
echo "现在可以运行: docker-compose up -d --build"
