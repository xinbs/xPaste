# Admin Web Frontend Dockerfile
# 多阶段构建

# 开发阶段
FROM node:18-alpine AS dev
WORKDIR /app

# 复制 package.json
COPY package.json pnpm-lock.yaml* ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install

# 源代码将通过 volume 挂载
EXPOSE 3010
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# 构建阶段
FROM node:18-alpine AS builder
WORKDIR /app

# 复制 package.json
COPY package.json pnpm-lock.yaml* ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 构建应用
RUN pnpm build

# 生产阶段
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# 从构建阶段复制构建产物
COPY --from=builder /app/dist .

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3010
CMD ["nginx", "-g", "daemon off;"]
