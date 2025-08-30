# xPaste 设计框架（全新开发 - Go方案优化版）

目标：在保持核心体验（剪贴板历史、粘贴、OCR、同步）前提下，打造"强解耦、跨平台、可逐步实现、AI 友好"的新架构。

## 1. 设计原则
- Clean/Hexagonal：以领域为中心，面向接口（Ports & Adapters）。
- 强解耦：前台（UI）、桌面宿主（App）、后端（Sync 服务）三者独立部署与演进；功能模块（Clipboard/OCR/Sync/Paste/Window/Autostart/Update）相互独立。
- 协议先行：统一类型与 API 契约（JSON Schema/OpenAPI），由"shared"包下发。
- 可替换：所有平台能力（剪贴板、OCR、窗口）均通过适配器实现，便于替换与扩展。
- 渐进式：分阶段交付，每步可运行、可验证、可回滚。

## 2. 顶层架构（Go方案优化）
- apps/desktop：Wails + React（UI 与宿主），Go后端提供所有业务逻辑；平台能力经 Adapter 暴露。
- services/sync-api：独立Go服务（Gin/Fiber + WebSocket），无状态、易水平扩展。
- packages/shared-types：领域类型、JSON Schema、OpenAPI 描述与常量（TS+Go双向映射）。
- packages/protocol：事件名、HTTP/WS 契约、错误码、版本管理。
- packages/sdk-client：前端调用 Sync 服务的 SDK（含重试/批处理/鉴权）。

关系约束：
- UI 仅依赖 Wails 暴露的Go服务方法 与 SDK；不得直接依赖平台适配层。
- Feature 仅依赖 Ports；Adapter 实现 Ports，不反向依赖。
- Sync 服务仅依赖 shared/protocol，不依赖 UI/桌面。

## 3. 模块与边界（Go方案细化）
- Core（领域与服务）：
  - EventBus、Config、Logger、Crypto（可选）。
  - Repository：ClipRepo、DeviceRepo、SettingRepo（基于 StoragePort）。
  - Services：ClipboardService、SyncService、OcrService、WindowService等。
- Features：
  - Clipboard（采集/去重/分类）、Paste（快捷键/延时）、OCR（队列/超时/回退）、Sync（增量/冲突/重试）、Autostart、Window、Update。
- Platform Adapters（Go实现）：
  - ClipboardAdapter、OcrAdapter（Tesseract/System）、WindowAdapter、TrayAdapter、UpdaterAdapter、SqliteAdapter。
- UI（React + TS）：
  - 每个 Feature 一个 slice/store 与容器组件；组件无副作用，副作用通过Wails调用Go服务。
- Sync 服务（Go + Gin/Fiber）：
  - 模块：auth、device、clip、admin、ws；中间件：鉴权、速率、审计。

## 4. 数据模型与协议（精简）
- ClipItem：{ id, type(text|image|file|html), hash, contentRef, createdAt, deviceId, deleted?, note?, favorite? }
- Device：{ id, name, platform, lastSeenAt, version }
- Setting：{ key, value, category? }
- 事件（WS）：clip.created | clip.updated | clip.deleted | device.heartbeat
- REST：
  - POST /auth/login → {token}
  - POST /devices/register → {deviceId}
  - GET /clips/pull?since=ts → ClipItem[]（含 tombstone）
  - POST /clips/push → {accepted, duplicates}
- 冲突：同 hash 视为同内容；同 id 以时间戳新者胜；删除为软删除（tombstone）。

## 5. 实现步骤（AI 执行计划 - Go方案优化）

### P0 基建与环境准备
- 初始化 Wails 应用骨架（Go + React）
- 创建 monorepo 结构：packages（shared-types/protocol/sdk-client）、services/sync-api
- 配置 Go modules、pnpm workspace、TypeScript 配置
- 建立 CI/CD 基础（GitHub Actions）
验收：项目可编译启动，显示基础UI界面

### P1 类型系统与契约
- 定义核心领域类型（Go struct + JSON tags）
- 生成对应的 TypeScript 类型定义
- 实现 OpenAPI 规范与文档生成
- 完成 sdk-client 基础框架（鉴权、重试、批处理）
验收：类型定义完整，OpenAPI 文档可访问，SDK 单测通过

### P2 存储层与核心服务
- 实现 StoragePort 接口与 SqliteAdapter
- 建立数据库迁移机制
- 实现 ClipRepo、DeviceRepo、SettingRepo
- 完成基础的 ClipboardService
验收：可写入/查询 clips、settings，数据持久化正常

### P3 剪贴板监听与本地功能
- 实现 ClipboardPort 与平台适配器（Windows/macOS/Linux）
- 添加去重、分类、历史管理逻辑
- 实现 PastePort 与自动粘贴功能
- 集成到 Wails，暴露给前端调用
验收：复制内容后500ms内出现在历史列表，点击可粘贴

### P4 UI 界面与交互
- 实现历史列表、搜索、筛选界面
- 添加收藏、备注、删除等操作
- 实现设置页面与配置管理
- 优化用户体验（快捷键、主题、多语言）
验收：UI功能完整，用户体验流畅

### P5 同步服务与联调
- 实现独立的 Go 同步服务（REST + WebSocket）
- 完成设备注册、认证、数据同步逻辑
- 实现客户端 SyncFeature（批量上/下行、离线队列、重试）
- 处理冲突解决与 tombstone 机制
验收：两台设备间5s内同步可见，断网恢复自动补偿

### P6 OCR 功能实现
- 集成 Tesseract（gosseract 绑定）
- 实现 OCR 任务队列与并发控制
- 添加超时、回退、错误处理机制
- 支持多语言识别（中英文优先）
验收：图片OCR识别成功，超时回退有效

### P7 系统集成功能
- 实现自启动（跨平台）
- 完成窗口管理与托盘集成
- 添加自动更新机制
- 优化性能与内存使用
验收：三平台功能一致，更新流程可执行

### P8 发布准备与优化
- 数据迁移工具（从旧版本）
- 日志、监控、错误上报
- 安全加固（可选E2E加密）
- 打包、签名、发布流程
验收：端到端回归通过，安装包三平台产出

## 6. 目录结构（Go方案最终）
```
/ (monorepo)
  apps/desktop/                 # Wails 应用
    backend/                    # Go 后端
      cmd/                      # 应用入口
      internal/                 # 内部包
        core/                   # 核心领域
          domain/               # 领域模型
          ports/                # 端口接口
          services/             # 领域服务
        features/               # 功能模块
          clipboard/            # 剪贴板功能
          sync/                 # 同步功能
          ocr/                  # OCR功能
          window/               # 窗口管理
        adapters/               # 适配器实现
          storage/              # 存储适配器
          platform/             # 平台适配器
        config/                 # 配置管理
      pkg/                      # 可复用包
    frontend/                   # React 前端
      src/
        components/             # UI组件
        stores/                 # 状态管理
        pages/                  # 页面
        hooks/                  # 自定义hooks
        utils/                  # 工具函数
  services/sync-api/            # 独立同步服务
    cmd/                        # 服务入口
    internal/                   # 内部实现
      handlers/                 # HTTP处理器
      middleware/               # 中间件
      models/                   # 数据模型
      services/                 # 业务服务
      websocket/                # WebSocket处理
    pkg/                        # 可复用包
  packages/                     # 共享包
    shared-types/               # 类型定义（TS+Go）
    protocol/                   # 协议定义
    sdk-client/                 # 客户端SDK
  scripts/                      # 构建脚本
  docs/                         # 文档
```

## 7. 解耦约束与最佳实践
- UI 不直接使用任一 Adapter，仅通过 Wails 暴露的服务接口。
- Feature 只依赖 Core 与 Ports，不跨 Feature 调用实现细节。
- Sync 服务只依赖 shared/protocol，禁止引用桌面或 UI 代码。
- 严禁相对路径深引用，统一从包的 index 导出。
- 使用依赖注入容器管理服务生命周期。
- 所有外部依赖通过接口抽象，便于测试和替换。

## 8. 存储与适配（Go方案优化）
- 本地 SQLite：使用 GORM 或 sqlx，支持连接池和事务
- 文件存储：图片/文件内容存储在用户数据目录，DB仅存路径和元信息
- 缓存策略：内存LRU缓存热点数据，减少DB查询
- 迁移机制：版本化数据库迁移，支持平滑升级
- 服务端：推荐 PostgreSQL + GORM，支持水平扩展

## 9. 测试与验收（Go方案）
- 单元测试：使用 testify，覆盖核心业务逻辑
- 集成测试：使用 testcontainers 进行数据库集成测试
- E2E测试：使用 Playwright 进行前端自动化测试
- 性能测试：批处理50条<100ms，首屏渲染<200ms，跨端同步<5s
- 兼容性测试：Windows 10+、macOS 10.15+、Ubuntu 20.04+

## 10. 风险与应对（Go方案）
- 平台差异：通过适配器模式隔离，提供降级方案
- OCR性能：Tesseract优化配置，考虑云端OCR备选
- 内存使用：合理的缓存策略，及时释放大文件
- 并发安全：使用 sync 包保证数据一致性
- 错误处理：统一错误处理机制，用户友好的错误提示

## 11. 时间线（参考，1人开发）
- P0-P2：3周（环境搭建+核心架构）
- P3-P5：4周（核心功能+同步）
- P6-P8：3周（高级功能+发布准备）
- 总计：10周（约2.5个月）

---

## 12. Go方案技术选型与依赖

### 12.1 核心依赖
- **Wails v2**：桌面应用框架，Go + React
- **Gin/Fiber**：HTTP框架（同步服务）
- **GORM**：ORM框架，支持SQLite/PostgreSQL
- **Zap**：高性能日志库
- **Viper**：配置管理
- **Testify**：测试框架

### 12.2 平台特定依赖
- **clipboard**：跨平台剪贴板操作
- **robotgo**：自动化操作（粘贴、快捷键）
- **gosseract**：Tesseract OCR绑定
- **systray**：系统托盘（如需要）

### 12.3 前端技术栈
- **React 18**：UI框架
- **TypeScript**：类型安全
- **Zustand**：轻量状态管理
- **TailwindCSS**：样式框架
- **React Query**：数据获取与缓存

## 13. AI实施指导与改进建议

### 13.1 架构改进建议

1. **简化依赖管理**
   - 使用Go modules管理后端依赖
   - 前端使用pnpm workspace统一管理
   - 建立依赖版本锁定机制

2. **增强错误处理**
   - 实现统一的错误类型系统
   - 添加错误码和用户友好的错误消息
   - 建立错误上报和监控机制

3. **优化性能设计**
   - 实现智能缓存策略（LRU + TTL）
   - 添加数据库连接池配置
   - 优化大文件处理（流式处理）

4. **增强安全性**
   - 实现数据加密存储（敏感信息）
   - 添加API访问频率限制
   - 支持可选的端到端加密

### 13.2 AI开发友好的改进

1. **清晰的接口定义**
   - 所有服务接口使用Go interface定义
   - 提供完整的接口文档和示例
   - 使用代码生成减少重复工作

2. **分层架构指导**
   ```go
   // 示例：清晰的分层结构
   type ClipboardService interface {
       Watch(ctx context.Context) <-chan ClipItem
       GetHistory(filter HistoryFilter) ([]ClipItem, error)
       AddItem(item ClipItem) error
       DeleteItem(id string) error
   }
   ```

3. **测试驱动开发**
   - 为每个接口提供测试用例模板
   - 使用mock生成工具（如gomock）
   - 建立CI/CD自动化测试流程

4. **渐进式实现指导**
   - 每个阶段都有明确的验收标准
   - 提供最小可行产品（MVP）的实现路径
   - 支持功能开关，便于灰度发布

### 13.3 具体实施建议

1. **P0阶段重点**
   - 先建立基础的Wails应用模板
   - 确保Go和React的通信机制正常
   - 建立基础的项目结构和构建流程

2. **P1-P2阶段重点**
   - 重点关注接口设计的合理性
   - 确保类型系统的一致性（Go ↔ TS）
   - 建立完善的错误处理机制

3. **P3-P5阶段重点**
   - 优先实现核心的剪贴板功能
   - 确保跨平台兼容性
   - 建立稳定的同步机制

4. **P6-P8阶段重点**
   - 关注性能优化和用户体验
   - 完善错误处理和日志记录
   - 准备发布和部署流程

## 14. 现有功能映射到新架构

基于当前代码库分析，以下是功能到新架构的映射关系：

### 14.1 核心功能映射

| 现有功能 | 新架构模块 | Go接口 | 实现优先级 |
|---------|-----------|--------|----------|
| 剪贴板监听 | features/clipboard | ClipboardPort | P3 |
| 历史管理 | core/services | ClipboardService | P3 |
| 搜索筛选 | core/services | SearchService | P4 |
| 自动粘贴 | features/paste | PastePort | P3 |
| OCR识别 | features/ocr | OcrPort | P6 |
| 跨设备同步 | features/sync | SyncService | P5 |
| 窗口管理 | features/window | WindowPort | P7 |
| 系统托盘 | adapters/platform | TrayAdapter | P7 |
| 自启动 | features/autostart | AutostartPort | P7 |
| 设置管理 | core/services | ConfigService | P2 |
| 数据备份 | core/services | BackupService | P8 |
| 多语言 | frontend/i18n | - | P4 |
| 主题切换 | frontend/theme | - | P4 |
| 快捷键 | adapters/platform | HotkeyAdapter | P4 |
| 更新检查 | features/update | UpdaterPort | P7 |

### 14.2 数据迁移策略

1. **现有数据兼容**
   - 分析当前SQLite数据库结构
   - 设计数据迁移脚本
   - 支持渐进式迁移，不丢失用户数据

2. **配置迁移**
   - 从现有配置文件读取用户设置
   - 转换为新的配置格式
   - 保持用户习惯和偏好

3. **文件迁移**
   - 迁移现有的图片和文件缓存
   - 更新文件路径引用
   - 清理无效的历史数据

### 14.3 用户体验保持

1. **界面一致性**
   - 保持现有的UI布局和交互逻辑
   - 渐进式改进，避免用户学习成本
   - 支持用户自定义界面配置

2. **功能完整性**
   - 确保所有现有功能在新架构中都有对应实现
   - 保持或改进现有的性能表现
   - 增强稳定性和错误处理

3. **平滑升级**
   - 提供从旧版本的无缝升级路径
   - 支持配置和数据的自动迁移
   - 提供回滚机制以防升级问题

## 15. 总结与下一步

### 15.1 架构优势
- **技术统一**：Go语言统一后端逻辑，降低维护成本
- **性能优化**：Go的并发特性适合剪贴板监听和数据处理
- **部署简单**：单文件二进制，无需复杂的运行时环境
- **扩展性强**：清晰的分层架构，便于功能扩展

### 15.2 实施建议
1. 建议从P0阶段开始，逐步实现各个功能模块
2. 重点关注接口设计和测试覆盖率
3. 保持与现有功能的兼容性
4. 建立完善的CI/CD流程

### 15.3 风险控制
- 每个阶段都有明确的回滚策略
- 保持现有版本的维护，直到新版本稳定
- 建立用户反馈机制，及时发现和解决问题

> 注：此设计文档已针对Go方案进行全面优化，提供了清晰的实施路径和AI开发指导。建议按照P0-P8的顺序逐步实现，确保每个阶段都有可验证的交付成果。