# xPaste 同步服务 Dockerfile
# 多阶段构建，优化镜像大小

# 构建阶段
FROM golang:1.21-alpine AS builder

# 安装必要的工具
RUN apk add --no-cache git ca-certificates tzdata

# 设置工作目录
WORKDIR /app

# 复制 go mod 文件
COPY go.mod go.sum ./

# 复制源代码
COPY . .

# 设置 GOPROXY
ENV GOPROXY=https://goproxy.cn,direct

# 重新生成 go.sum (需要源代码)
RUN go mod tidy

# 下载依赖
RUN go mod download

# 构建应用 (CGO_ENABLED=0 使用纯 Go 实现)
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main ./cmd/server

# 开发阶段
FROM golang:1.21-alpine AS dev
WORKDIR /app
# 安装 air
RUN go install github.com/cosmtrek/air@v1.49.0
# 复制 go mod 文件
COPY go.mod go.sum ./
ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download
# 源代码将通过 volume 挂载
CMD ["air", "-c", ".air.toml"]

# 运行阶段
FROM alpine:latest

# 安装必要的运行时依赖
RUN apk --no-cache add ca-certificates sqlite curl

# 创建非 root 用户
RUN addgroup -g 1001 -S xpaste && \
    adduser -S xpaste -u 1001 -G xpaste

# 设置工作目录
WORKDIR /app

# 从构建阶段复制二进制文件
COPY --from=builder /app/main .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# 创建数据和日志目录
RUN mkdir -p /data /app/logs && \
    chown -R xpaste:xpaste /app /data

ENV DB_DRIVER=sqlite
ENV DB_DSN=/data/xpaste.db
ENV UPLOAD_PATH=/data/uploads

# 切换到非 root 用户
USER xpaste

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# 启动应用
CMD ["./main"]
