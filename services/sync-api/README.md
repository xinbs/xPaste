# xPaste 同步服务

基于 Go + Gin + SQLite 的轻量级剪贴板同步服务，适用于个人使用场景。

## 功能特性

- 🔐 用户认证与设备管理
- 📋 剪贴板数据同步
- 🔄 实时 WebSocket 通信
- 🗄️ SQLite 轻量级存储
- 🐳 Docker 容器化部署
- 📊 健康检查与监控

## 快速开始

### 本地开发

1. 安装依赖
```bash
go mod download
```

2. 初始化数据库
```bash
sqlite3 data/xpaste.db < migrations/001_init_schema.sql
```

3. 启动服务
```bash
go run cmd/server/main.go
```

### Docker 部署

1. 构建镜像
```bash
docker build -t xpaste-sync-api .
```

2. 启动服务
```bash
docker-compose up -d
```

### 生产环境部署

1. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，设置 JWT_SECRET 等配置
```

2. 启动完整服务（包含 Nginx）
```bash
docker-compose --profile production up -d
```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `GIN_MODE` | `debug` | Gin 运行模式 (debug/release) |
| `DB_TYPE` | `sqlite` | 数据库类型 |
| `DB_PATH` | `./data/xpaste.db` | SQLite 数据库文件路径 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `JWT_SECRET` | - | JWT 签名密钥（必须设置） |
| `CORS_ORIGINS` | `*` | CORS 允许的源 |
| `PORT` | `8080` | 服务端口 |

### 数据库

- 使用 SQLite 作为存储引擎
- 数据库文件默认存储在 `./data/xpaste.db`
- 支持自动迁移和初始化

## API 接口

### 认证接口

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/refresh` - 刷新令牌

### 设备管理

- `POST /api/devices/register` - 注册设备
- `GET /api/devices` - 获取设备列表
- `DELETE /api/devices/:id` - 删除设备

### 剪贴板同步

- `GET /api/clips/pull` - 拉取剪贴板数据
- `POST /api/clips/push` - 推送剪贴板数据
- `DELETE /api/clips/:id` - 删除剪贴板项

### WebSocket 事件

- 连接地址: `ws://localhost:8080/ws`
- 支持实时剪贴板数据同步
- 设备在线状态通知

## 监控与维护

### 健康检查

```bash
curl http://localhost:8080/health
```

### 日志查看

```bash
# Docker 部署
docker-compose logs -f sync-api

# 本地部署
tail -f logs/app.log
```

### 数据备份

```bash
# 备份 SQLite 数据库
cp data/xpaste.db backup/xpaste_$(date +%Y%m%d_%H%M%S).db
```

## 安全建议

1. **设置强密码**: 确保 `JWT_SECRET` 使用强随机字符串
2. **HTTPS 部署**: 生产环境建议使用 HTTPS
3. **防火墙配置**: 仅开放必要端口
4. **定期备份**: 定期备份数据库文件
5. **日志监控**: 监控异常访问和错误日志

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查数据库文件路径和权限
   - 确保 SQLite 已正确安装

2. **WebSocket 连接失败**
   - 检查防火墙设置
   - 确认端口未被占用

3. **认证失败**
   - 检查 JWT_SECRET 配置
   - 确认时间同步正确

### 调试模式

```bash
# 启用调试日志
export LOG_LEVEL=debug
export GIN_MODE=debug
```

## 许可证

MIT License