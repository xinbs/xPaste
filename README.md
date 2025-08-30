# xPaste

基于 Go + React 的跨平台剪贴板管理工具，支持历史记录、OCR 识别、跨设备同步等功能。

## 架构设计

本项目采用 Clean Architecture + Hexagonal Architecture 设计，实现强解耦、跨平台、可逐步实现的架构。

### 目录结构

```
/ (monorepo)
├── apps/desktop/                 # Wails 桌面应用
│   ├── backend/                  # Go 后端
│   │   ├── cmd/                  # 应用入口
│   │   ├── internal/             # 内部包
│   │   │   ├── core/             # 核心领域
│   │   │   ├── features/         # 功能模块
│   │   │   └── adapters/         # 适配器实现
│   │   └── pkg/                  # 可复用包
│   └── frontend/                 # React 前端
├── services/sync-api/            # 独立同步服务
├── packages/                     # 共享包
│   ├── shared-types/             # 类型定义
│   ├── protocol/                 # 协议定义
│   └── sdk-client/               # 客户端SDK
├── scripts/                      # 构建脚本
└── docs/                         # 文档
```

## 技术栈

### 桌面应用 (apps/desktop)
- **后端**: Go + Wails v2
- **前端**: React 18 + TypeScript + TailwindCSS + Zustand
- **数据库**: SQLite (GORM)
- **平台能力**: clipboard, robotgo, gosseract

### 同步服务 (services/sync-api)
- **框架**: Go + Gin
- **数据库**: PostgreSQL/SQLite (GORM)
- **实时通信**: WebSocket
- **日志**: Zap
- **配置**: Viper

### 共享包 (packages)
- **类型定义**: TypeScript
- **协议**: HTTP/WebSocket 契约
- **SDK**: 客户端同步 SDK

## 开发指南

### 环境要求

- Node.js 18+
- Go 1.21+
- pnpm 8+

### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

### 开发命令

```bash
# 启动桌面应用开发服务器
pnpm dev

# 启动同步服务
pnpm dev:sync

# 构建所有项目
pnpm build:all

# 代码检查
pnpm lint:all
```

### 单独开发

```bash
# 桌面应用
cd apps/desktop
pnpm dev

# 同步服务
cd services/sync-api
go run cmd/main.go

# 共享包
cd packages/shared-types
pnpm build
```

## 功能特性

### 核心功能
- ✅ 剪贴板历史记录
- ✅ 智能去重和分类
- ✅ 快速搜索和筛选
- ✅ 自动粘贴功能
- ✅ 收藏和备注

### 高级功能
- 🚧 OCR 文字识别
- 🚧 跨设备同步
- 🚧 系统托盘集成
- 🚧 自启动管理
- 🚧 自动更新

### 用户体验
- ✅ 多主题支持
- ✅ 多语言支持
- ✅ 快捷键配置
- ✅ 响应式界面

## 实现阶段

### P0 基建与环境准备 ✅
- [x] 初始化 Wails 应用骨架
- [x] 创建 monorepo 结构
- [x] 配置 Go modules、pnpm workspace
- [x] TypeScript 配置

### P1 类型系统与契约 ✅
- [x] 定义核心领域类型
- [x] 生成 TypeScript 类型定义
- [x] 实现协议规范
- [x] 完成 sdk-client 基础框架

### P2 存储层与核心服务 🚧
- [ ] 实现 StoragePort 接口与 SqliteAdapter
- [ ] 建立数据库迁移机制
- [ ] 实现 Repository 层
- [ ] 完成基础的 ClipboardService

### P3-P8 功能实现 🚧
- [ ] 剪贴板监听与本地功能
- [ ] UI 界面与交互
- [ ] 同步服务与联调
- [ ] OCR 功能实现
- [ ] 系统集成功能
- [ ] 发布准备与优化

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。

## 相关链接

- [设计文档](new-architecture-design.md)
- [API 文档](docs/api.md)
- [开发指南](docs/development.md)
