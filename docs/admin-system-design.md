# xPaste 后台管理系统设计文档

## 📋 项目概述

本文档描述了 xPaste 剪贴板同步系统的后台管理系统设计方案。该管理系统采用低耦合架构设计，可以独立开发和部署，同时与现有项目无缝集成。

### 设计原则

- **低耦合**：后台管理系统作为独立模块，与核心同步服务解耦
- **高内聚**：管理功能集中在独立的服务中
- **易部署**：支持与现有项目一键部署
- **可扩展**：模块化设计，便于功能扩展

## 🏗️ 架构设计

### 整体架构

```
xPaste 项目结构
├── services/
│   ├── sync-api/           # 现有同步服务
│   └── admin-api/          # 新增管理服务
├── apps/
│   ├── desktop/            # 现有桌面应用
│   └── admin-web/          # 新增管理后台
└── shared/
    ├── database/           # 共享数据库访问
    └── middleware/         # 共享中间件
```

### 服务分离策略

#### 1. 独立的管理API服务 (admin-api)
- **端口**：8081 (与同步服务 8080 分离)，并且支持通过配置 自定义端口
- **数据库**：共享同一数据库实例
- **认证**：独立的管理员认证系统
- **日志**：独立的日志文件

#### 2. 独立的管理前端 (admin-web)
- **技术栈**：React + TypeScript + Tailwind CSS
- **构建**：独立的构建流程
- **部署**：可单独部署或集成部署

### 端口与环境变量配置（开发与部署）

- Admin API 端口
  - 默认端口：8081（参考 services/admin-api/.env.example 中的 PORT）
  - 可通过环境变量或 .env 文件覆盖：services/admin-api/.env 中设置 PORT=8083（方案B）
  - 运行时临时覆盖示例（PowerShell）：$env:PORT="8083"; go run .

- Admin Web 后端地址
  - 通过 Vite 环境变量 VITE_ADMIN_API_BASE_URL 指定后端 API 基础地址
  - 本地推荐在 apps/admin-web/.env.local 中配置，例如：VITE_ADMIN_API_BASE_URL=http://localhost:8083
  - .env.local 已被 .gitignore 忽略，不会提交到仓库

- 方案B（开发环境保留 8083）操作步骤
  1) 在 services/admin-api/.env 设置 PORT=8083 并重启 Admin API；或在启动命令前设置环境变量 PORT=8083
  2) 在 apps/admin-web/.env.local 写入 VITE_ADMIN_API_BASE_URL=http://localhost:8083 并重启前端 dev server（或浏览器强刷后确认请求指向 8083）

- 生产环境说明
  - 现有 Nginx/反向代理配置仍以 8081 为默认目标；若变更生产端口，请同步调整代理与部署脚本


### 数据访问层设计

```go
// 共享数据库连接
package database

type DatabaseManager struct {
    syncDB  *gorm.DB    // 同步服务数据库连接
    adminDB *gorm.DB    // 管理服务数据库连接 (同一实例)
}

// 提供统一的数据访问接口
type Repository interface {
    Users() UserRepository
    Devices() DeviceRepository
    ClipItems() ClipItemRepository
    Logs() LogRepository
}
```

## 📁 项目结构

### 后端服务结构

```
services/admin-api/
├── cmd/
│   └── server/
│       └── main.go         # 管理服务入口
├── internal/
│   ├── config/             # 配置管理
│   ├── handlers/           # HTTP 处理器
│   │   ├── admin_auth.go   # 管理员认证
│   │   ├── user_mgmt.go    # 用户管理
│   │   ├── device_mgmt.go  # 设备管理
│   │   ├── clip_mgmt.go    # 剪贴板管理
│   │   └── system_mgmt.go  # 系统管理
│   ├── middleware/         # 中间件
│   │   ├── admin_auth.go   # 管理员认证中间件
│   │   └── audit_log.go    # 审计日志中间件
│   ├── models/             # 数据模型
│   │   ├── admin.go        # 管理员模型
│   │   └── audit_log.go    # 审计日志模型
│   └── services/           # 业务服务
│       ├── user_service.go
│       ├── device_service.go
│       └── clip_service.go
├── shared/                 # 与sync-api共享的代码
│   ├── database/           # 数据库连接
│   ├── models/             # 共享数据模型
│   └── utils/              # 工具函数
├── go.mod
└── go.sum
```

### 前端应用结构

```
apps/admin-web/
├── src/
│   ├── components/         # 通用组件
│   │   ├── Layout/         # 布局组件
│   │   ├── DataTable/      # 数据表格
│   │   └── Charts/         # 图表组件
│   ├── pages/              # 页面组件
│   │   ├── Dashboard/      # 仪表板
│   │   ├── Users/          # 用户管理
│   │   ├── Devices/        # 设备管理
│   │   ├── Clipboard/      # 剪贴板管理
│   │   ├── Security/       # 安全管理
│   │   └── Settings/       # 系统设置
│   ├── hooks/              # 自定义 Hooks
│   ├── services/           # API 服务
│   ├── store/              # 状态管理
│   └── utils/              # 工具函数
├── public/
├── package.json
└── vite.config.ts
```

## 🔧 核心功能模块

### 1. 用户管理模块

#### API 端点
```
GET    /admin/api/users              # 获取用户列表
GET    /admin/api/users/:id          # 获取用户详情
POST   /admin/api/users              # 创建用户
PUT    /admin/api/users/:id          # 更新用户
DELETE /admin/api/users/:id          # 删除用户
POST   /admin/api/users/:id/disable  # 禁用用户
POST   /admin/api/users/:id/enable   # 启用用户
```

#### 功能特性
- 用户列表展示（分页、搜索、筛选）
- 用户详情查看（基本信息、设备列表、使用统计）
- 用户创建和编辑
- 用户状态管理（启用/禁用）
- 密码重置功能

### 2. 设备管理模块

#### API 端点
```
GET    /admin/api/devices            # 获取设备列表
GET    /admin/api/devices/:id        # 获取设备详情
DELETE /admin/api/devices/:id        # 删除设备
POST   /admin/api/devices/:id/kick   # 强制设备下线
```

#### 功能特性
- 设备列表展示（在线状态、最后活跃时间）
- 设备详情查看（硬件信息、使用统计）
- 设备管理操作（删除、强制下线）
- 设备统计分析

### 3. 剪贴板管理模块

#### API 端点
```
GET    /admin/api/clips              # 获取剪贴板列表
GET    /admin/api/clips/:id          # 获取剪贴板详情
DELETE /admin/api/clips/:id          # 删除剪贴板项
POST   /admin/api/clips/batch-delete # 批量删除
GET    /admin/api/clips/stats        # 获取统计信息
GET    /admin/api/clips/export       # 导出数据
```

#### 功能特性
- 剪贴板历史记录查看
- 内容预览和详情展示
- 高级搜索和筛选
- 批量管理操作
- 数据统计和分析
- 数据导出功能

### 4. 安全管理模块

#### API 端点
```
GET    /admin/api/logs/login         # 获取登录日志
GET    /admin/api/logs/admin         # 获取管理员操作日志
GET    /admin/api/security/ips       # 获取IP统计
GET    /admin/api/security/stats     # 获取安全统计
```

#### 功能特性
- 登录日志查看（IP、时间、结果）
- 操作审计日志
- IP地址统计和分析
- 安全事件监控

### 5. 系统监控模块

#### API 端点
```
GET    /admin/api/monitor/status     # 获取系统状态
GET    /admin/api/monitor/metrics    # 获取性能指标
GET    /admin/api/monitor/errors     # 获取错误日志
```

#### 功能特性
- 系统状态监控
- 性能指标展示
- 错误日志查看
- 实时数据更新

## 🗄️ 数据库设计

### 新增表结构

```sql
-- 管理员表
CREATE TABLE admins (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    last_login_at DATETIME,
    last_login_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 管理员操作日志表
CREATE TABLE admin_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    admin_id TEXT NOT NULL REFERENCES admins(id),
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 登录日志表
CREATE TABLE login_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    user_id TEXT,
    admin_id TEXT,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    login_type TEXT NOT NULL DEFAULT 'user' CHECK (login_type IN ('user', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 系统设置表扩展
ALTER TABLE settings ADD COLUMN admin_only BOOLEAN DEFAULT FALSE;
```

### 索引优化

```sql
-- 管理员表索引
CREATE INDEX idx_admins_username ON admins(username);
CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_status ON admins(status);

-- 日志表索引
CREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX idx_admin_logs_action ON admin_logs(action);

CREATE INDEX idx_login_logs_ip_address ON login_logs(ip_address);
CREATE INDEX idx_login_logs_created_at ON login_logs(created_at DESC);
CREATE INDEX idx_login_logs_success ON login_logs(success);
```

## 🚀 部署方案

### 开发环境部署

#### 1. 统一启动脚本

```powershell
# start-admin-dev.ps1
#!/usr/bin/env pwsh

Write-Host "启动 xPaste 管理系统开发环境..." -ForegroundColor Green

# 启动同步服务
Write-Host "启动同步服务..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd services/sync-api; go run cmd/server/main.go"

# 等待同步服务启动
Start-Sleep -Seconds 3

# 启动管理服务
Write-Host "启动管理服务..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd services/admin-api; go run cmd/server/main.go"

# 等待管理服务启动
Start-Sleep -Seconds 3

# 启动管理前端
Write-Host "启动管理前端..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd apps/admin-web; npm run dev"

# 启动桌面应用前端
Write-Host "启动桌面应用前端..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd apps/desktop/frontend; npm run dev"

Write-Host "所有服务已启动完成!" -ForegroundColor Green
Write-Host "同步服务: http://localhost:8080" -ForegroundColor Cyan
Write-Host "管理服务: http://localhost:8081" -ForegroundColor Cyan
Write-Host "管理后台: http://localhost:3001" -ForegroundColor Cyan
Write-Host "桌面应用: http://localhost:3000" -ForegroundColor Cyan
```

#### 2. 停止脚本

```powershell
# stop-admin-dev.ps1
#!/usr/bin/env pwsh

Write-Host "停止 xPaste 管理系统..." -ForegroundColor Red

# 停止所有相关进程
Get-Process | Where-Object {$_.ProcessName -eq "go" -or $_.ProcessName -eq "node"} | Stop-Process -Force

Write-Host "所有服务已停止!" -ForegroundColor Green
```

### 生产环境部署

#### 1. Docker Compose 配置

```yaml
# docker-compose.admin.yml
version: '3.8'

services:
  # 现有同步服务
  sync-api:
    build:
      context: ./services/sync-api
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DB_PATH=/data/xpaste.db
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/data
      - ./uploads:/uploads
    restart: unless-stopped

  # 新增管理服务
  admin-api:
    build:
      context: ./services/admin-api
      dockerfile: Dockerfile
    ports:
      - "8081:8081"
    environment:
      - DB_PATH=/data/xpaste.db
      - JWT_SECRET=${JWT_SECRET}
      - ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
    volumes:
      - ./data:/data
    depends_on:
      - sync-api
    restart: unless-stopped

  # 管理前端
  admin-web:
    build:
      context: ./apps/admin-web
      dockerfile: Dockerfile
    ports:
      - "3001:80"
    environment:
      - REACT_APP_ADMIN_API_URL=http://localhost:8081
    depends_on:
      - admin-api
    restart: unless-stopped

  # Nginx 反向代理
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - sync-api
      - admin-api
      - admin-web
    restart: unless-stopped
```

#### 2. Nginx 配置

```nginx
# nginx/nginx.conf
server {
    listen 80;
    server_name your-domain.com;

    # 同步服务 API
    location /api/ {
        proxy_pass http://sync-api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://sync-api:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # 管理 API
    location /admin/api/ {
        proxy_pass http://admin-api:8081/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 管理后台
    location /admin/ {
        proxy_pass http://admin-web:80/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 桌面应用（如果需要Web访问）
    location / {
        proxy_pass http://desktop-web:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 🔐 安全设计

### 认证机制

#### 1. 管理员认证
```go
// 独立的管理员JWT密钥
type AdminClaims struct {
    AdminID  string `json:"admin_id"`
    Username string `json:"username"`
    Role     string `json:"role"`
    jwt.StandardClaims
}

// 管理员认证中间件
func AdminAuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := extractTokenFromHeader(c)
        claims, err := validateAdminToken(token)
        if err != nil {
            c.JSON(401, gin.H{"error": "Unauthorized"})
            c.Abort()
            return
        }
        
        c.Set("admin_id", claims.AdminID)
        c.Set("admin_role", claims.Role)
        c.Next()
    }
}
```

#### 2. 权限控制
```go
// 角色权限检查
func RequireRole(role string) gin.HandlerFunc {
    return func(c *gin.Context) {
        adminRole, exists := c.Get("admin_role")
        if !exists || adminRole != role {
            c.JSON(403, gin.H{"error": "Insufficient permissions"})
            c.Abort()
            return
        }
        c.Next()
    }
}

// 使用示例
router.DELETE("/users/:id", AdminAuthMiddleware(), RequireRole("super_admin"), deleteUser)
```

### 审计日志

```go
// 审计日志中间件
func AuditLogMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        
        // 记录请求信息
        adminID, _ := c.Get("admin_id")
        
        c.Next()
        
        // 记录操作日志
        if c.Request.Method != "GET" {
            logEntry := AdminLog{
                AdminID:   adminID.(string),
                Action:    fmt.Sprintf("%s %s", c.Request.Method, c.Request.URL.Path),
                IPAddress: c.ClientIP(),
                UserAgent: c.Request.UserAgent(),
                Duration:  time.Since(start),
                Status:    c.Writer.Status(),
            }
            
            // 异步写入日志
            go writeAuditLog(logEntry)
        }
    }
}
```

## 📊 监控和日志

### 日志配置

```go
// 管理服务日志配置
type LogConfig struct {
    Level      string `json:"level"`
    Format     string `json:"format"`
    Output     string `json:"output"`
    MaxSize    int    `json:"max_size"`
    MaxBackups int    `json:"max_backups"`
    MaxAge     int    `json:"max_age"`
}

// 初始化日志
func InitLogger(config LogConfig) {
    logger := logrus.New()
    
    // 设置日志级别
    level, _ := logrus.ParseLevel(config.Level)
    logger.SetLevel(level)
    
    // 设置日志格式
    if config.Format == "json" {
        logger.SetFormatter(&logrus.JSONFormatter{})
    }
    
    // 设置日志输出
    if config.Output != "" {
        file, err := os.OpenFile(config.Output, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
        if err == nil {
            logger.SetOutput(file)
        }
    }
}
```

### 性能监控

```go
// 性能指标收集
type Metrics struct {
    RequestCount    int64         `json:"request_count"`
    ErrorCount      int64         `json:"error_count"`
    AvgResponseTime time.Duration `json:"avg_response_time"`
    ActiveUsers     int           `json:"active_users"`
    ActiveDevices   int           `json:"active_devices"`
}

// 指标收集中间件
func MetricsMiddleware(metrics *Metrics) gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        
        c.Next()
        
        // 更新指标
        atomic.AddInt64(&metrics.RequestCount, 1)
        if c.Writer.Status() >= 400 {
            atomic.AddInt64(&metrics.ErrorCount, 1)
        }
        
        duration := time.Since(start)
        // 更新平均响应时间（简化实现）
        metrics.AvgResponseTime = (metrics.AvgResponseTime + duration) / 2
    }
}
```

## 📈 实施计划

### 第一阶段：基础架构（1-2周）

**目标**：搭建基础架构和核心认证系统

**任务清单**：
- [ ] 创建 `services/admin-api` 项目结构
- [ ] 创建 `apps/admin-web` 项目结构
- [ ] 实现管理员认证系统
- [ ] 创建基础数据库表结构
- [ ] 实现基础中间件（认证、日志、CORS）
- [ ] 搭建前端基础框架和路由

**验收标准**：
- 管理员可以登录系统
- 基础的权限控制生效
- 前后端可以正常通信

### 第二阶段：用户管理（1周）

**目标**：实现完整的用户管理功能

**任务清单**：
- [ ] 实现用户列表API和页面
- [ ] 实现用户详情查看
- [ ] 实现用户创建和编辑
- [ ] 实现用户状态管理
- [ ] 添加用户搜索和筛选功能

**验收标准**：
- 可以查看所有用户列表
- 可以创建和编辑用户
- 可以禁用/启用用户账户

### 第三阶段：设备和剪贴板管理（1-2周）

**目标**：实现设备管理和剪贴板历史管理

**任务清单**：
- [ ] 实现设备管理API和页面
- [ ] 实现剪贴板历史查看
- [ ] 实现内容预览和详情展示
- [ ] 实现批量操作功能
- [ ] 添加数据统计和分析

**验收标准**：
- 可以查看和管理所有设备
- 可以查看用户剪贴板历史
- 可以进行批量删除操作

### 第四阶段：安全和监控（1周）

**目标**：完善安全功能和系统监控

**任务清单**：
- [ ] 实现登录日志记录和查看
- [ ] 实现操作审计日志
- [ ] 实现系统监控面板
- [ ] 添加安全统计功能
- [ ] 实现数据导出功能

**验收标准**：
- 所有操作都有审计日志
- 可以查看系统运行状态
- 可以导出管理数据

### 第五阶段：部署和优化（1周）

**目标**：完善部署方案和性能优化

**任务清单**：
- [ ] 完善Docker配置
- [ ] 配置Nginx反向代理
- [ ] 编写部署文档
- [ ] 性能测试和优化
- [ ] 安全测试和加固

**验收标准**：
- 可以一键部署整个系统
- 系统性能满足要求
- 通过安全测试

## 🔧 开发指南

### 环境准备

1. **安装依赖**
```bash
# 后端依赖
cd services/admin-api
go mod init admin-api
go get github.com/gin-gonic/gin
go get gorm.io/gorm
go get github.com/golang-jwt/jwt/v4

# 前端依赖
cd apps/admin-web
npm create vite@latest . -- --template react-ts
npm install @tanstack/react-query axios react-router-dom
npm install -D tailwindcss postcss autoprefixer
```

2. **配置开发环境**
```bash
# 复制配置文件
cp services/admin-api/config/config.example.yaml services/admin-api/config/config.yaml
cp apps/admin-web/.env.example apps/admin-web/.env.local
```

### 代码规范

#### 后端代码规范
- 使用 Go 标准代码格式
- API 响应统一使用 JSON 格式
- 错误处理使用统一的错误码
- 所有 API 都要有适当的日志记录

#### 前端代码规范
- 使用 TypeScript 严格模式
- 组件使用函数式组件和 Hooks
- 状态管理使用 Zustand 或 React Query
- 样式使用 Tailwind CSS

### 测试策略

#### 单元测试
```go
// 后端单元测试示例
func TestCreateUser(t *testing.T) {
    // 测试用户创建功能
    service := NewUserService(mockDB)
    user, err := service.CreateUser(&CreateUserRequest{
        Username: "testuser",
        Email:    "test@example.com",
        Password: "password123",
    })
    
    assert.NoError(t, err)
    assert.NotEmpty(t, user.ID)
    assert.Equal(t, "testuser", user.Username)
}
```

#### 集成测试
```typescript
// 前端集成测试示例
describe('User Management', () => {
  it('should create a new user', async () => {
    render(<UserCreatePage />);
    
    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: 'testuser' }
    });
    
    fireEvent.click(screen.getByText('创建用户'));
    
    await waitFor(() => {
      expect(screen.getByText('用户创建成功')).toBeInTheDocument();
    });
  });
});
```

## 📚 参考资料

### 技术文档
- [Gin Web Framework](https://gin-gonic.com/docs/)
- [GORM ORM Library](https://gorm.io/docs/)
- [React Documentation](https://reactjs.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)

### 最佳实践
- [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- [React Best Practices](https://react.dev/learn)
- [REST API Design Guidelines](https://restfulapi.net/)

---

**文档版本**：v1.0  
**最后更新**：2024年1月  
**维护者**：xPaste 开发团队