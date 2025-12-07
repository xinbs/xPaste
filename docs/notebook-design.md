# 记事本功能设计方案

## 背景与目标
- 在桌面客户端新增「记事本」Tab，实现文字与图片的快速记录、Markdown 渲染、与剪贴板历史的便捷联动。
- 面向“快速捕捉 + 结构化管理 + 轻量同步”，兼顾离线可用与在线同步。

## 信息架构
- 导航结构：与「历史 / 添加 / 设备 / 设置」并列新增「记事本」。
- 三栏布局（桌面）：
  - 左侧列表区：显示“记事本列表”（工作/个人/临时/收藏），支持新建、重命名、删除、置顶与排序。
  - 中间笔记区：当前列表的笔记卡片，支持搜索、标签筛选、类型筛选（文本/图片/混合），分页/无限滚动。
  - 右侧详情区：Markdown 编辑/预览切换，支持粘贴图片、拖拽上传图片，附件管理与自动保存。
- 移动端（两步视图）：顶部 Tab 切换“列表/笔记”，详情页独立编辑与预览。

## 核心交互
- 手动输入文字：
  - 顶部“快速捕捉栏”：输入框支持 Markdown，Enter 快速保存到当前列表。
  - 详情区编辑器：完整 Markdown 编辑体验，支持快捷键保存（Ctrl+S）。
- 上传/粘贴图片：
  - 复用现有 FileUpload 组件，支持拖拽/点击选择；编辑器捕获 paste 事件，自动将剪贴板图片插入为附件并在正文插图。
- 从剪贴板一键保存到记事本：
  - 在剪贴板卡片操作区新增“保存到记事本”按钮，弹出选择目标列表快速菜单；默认保存到最近使用的列表。
 - 本地目录与默认 MD：
   - 可选择本地目录作为记事本根目录；支持设置一个“默认.md”，用于快速保存（如从剪贴板一键保存时追加/创建）。
- Markdown 渲染：
  - 详情区支持“编辑/预览”切换；预览安全渲染（链接白名单、代码高亮可选、图片展示）。
- 列表管理：新建、重命名、删除、排序、置顶；显示笔记数与最近更新时间。

## 数据模型
- Note：`id`, `list_id`, `user_id`, `title`, `content_md`, `attachments[]`, `tags[]`, `source`, `created_at`, `updated_at`
- List：`id`, `user_id`, `name`, `order_index`, `pinned`, `created_at`, `updated_at`
- Attachment：`id`, `note_id`, `type(image|file)`, `url`, `base64`, `file_name`, `size_bytes`, `created_at`
- 可选拓展：`tags` 多对多表、`revisions` 版本表。

## 文件存储结构设计（MD 方案）
- 不新增数据库表；记事本以文件系统为中心：目录=列表、`.md` 文件=笔记、附件为同目录/子目录内的文件。
- 根目录：用户可在客户端选择任意本地目录作为“记事本根目录”。
- 列表（文件夹）：每个列表对应根目录下的一个文件夹；排序/置顶由客户端维护，不写入数据库。
- 笔记（Markdown 文件）：
  - 命名建议：`YYYYMMDD-HHmmss-title.md` 或 `title-uuid.md`，避免重名冲突。
  - 元数据：采用可选 Front Matter（YAML）存储 `title/tags/source/created_at/updated_at`，正文为 Markdown 内容。
  - 默认笔记：支持在某列表内设置 `default.md` 用于快速追加。
- 附件（文件）：与笔记同目录或位于 `attachments/` 子目录，正文通过相对路径引用。
- 树结构示例：
```
/NotesRoot
  /Work
    2025-12-06-100532-meeting.md
    /attachments
      2025-12-06-100532-meeting-img-1.png
  /Personal
    default.md
```

## 无数据库依赖与持久化
- 记事本完全采用文件系统存储：目录即列表、`.md` 文件即笔记、附件为普通文件；不新增任何数据库表。
- 后端按用户隔离根目录并提供文件读写接口；服务端仅持久化文件，不记录笔记内容到数据库。
- 配置持久化：
  - 客户端保存“记事本根目录”和“默认.md 路径”等偏好至本地应用配置（不走后端数据库）。
  - 若需要跨设备共享偏好，可选择后端设置接口保存这些路径字符串，但不保存笔记内容。
- 现有数据库继续用于现有功能（用户、设备、剪贴板、设置等），与记事本文件方案互不干扰。

## 服务端存储结构（保留同步能力）
- 存储位置：`/storage/note-files/{user_id}/` 作为每个用户的隔离根目录。
- 结构保持：服务端按原始目录树保存 `.md` 与附件文件，路径与本地一致。
- 可选清单：为提升列表性能，可维护 `manifest.json`（包含相对路径、大小、哈希、修改时间），由客户端推送或服务端扫描生成。

## 最小化方案（简单 Markdown 阅读编辑器）
- 目标：提供一个简洁的 Markdown 阅读/编辑器，并支持从剪贴板历史一键保存到“设定的记事本（默认.md）”。
- 配置：仅需设置一个“默认记事本文件路径”（如 `.../Personal/default.md`）。
- 编辑/预览：在同一详情区支持编辑与预览切换，支持 `Ctrl+S` 保存与 1–2 秒防抖自动保存。
- 快速保存（历史→记事本）：
  - 文本项：将纯文本以 Markdown 段落形式追加到 `default.md`，在顶部或底部追加，附带时间戳可选。
  - 图片项：将图片保存到 `attachments/` 子目录，并在 `default.md` 中以 `![alt](attachments/xxx.png)` 插图追加。
  - URL/文件项：以 Markdown 链接或代码块形式追加。
- 打开/切换：允许通过文件选择器切换当前编辑的 `.md` 文件；默认仍指向 `default.md`。
- 错误提示：不可写/不存在路径时在 UI 显示明确错误与修复建议。

### 图片粘贴支持（详细）
- 事件监听：编辑器监听 `paste`，从 `clipboardData.items` 检测 `image/*` 与文件条目；文本同时保留常规粘贴行为。
- 保存位置：将图片保存到当前默认.md 所在目录的 `attachments/` 子目录；若不存在则自动创建。
- 文件命名：`paste-YYYYMMDD-HHmmss-{rand}.png` 或保留原扩展（`png/jpg/webp/gif`），避免重名冲突。
- 插入语法：在光标处或文末插入 `![alt](attachments/filename.ext)`；`alt` 可用剪贴板来源或时间戳。
- 体积与类型限制：遵循上传配置（最大体积、允许类型、宽高与质量），见 `services/sync-api/internal/config/config.go:149-168`。
- 压缩与转换：超过限制时按 `ImageMaxWidth/Height/ImageQuality` 自动压缩；可选将大图转换为 `webp`，保留原扩展映射。
- 去重策略：计算 `sha256`（内存或临时文件），若同目录已有同哈希文件则复用并仅插入引用，减少重复。
- 同步联动：启用目录同步时，保存后立即将文件事件入队（create），批量上传到服务端保持相对路径一致；失败自动重试。
- 回退方案：目录不可写或空间不足时，提供小图 `data:image/png;base64,...` 内联插入的临时选项，并提示尽快转存为附件文件。
- 错误处理：不支持的类型或超限体积，界面弹出明确提示并给出压缩/取消选择；记录失败事件日志。

## 同步策略（文件为中心）
- 模式选择：可配置“仅本地”或“同步到服务器”。同步时，选择一个“默认同步目录”映射到服务端用户根下的对应路径。
- 离线优先：以本地目录为主；监听文件变更（创建/修改/重命名/删除），形成同步事件队列。
- 增量同步：按事件批量上传（含 `path/type/size/hash/mtime`）；服务端返回接受/冲突/错误；支持断点续传与指数退避重试。
- 远端存储：后端按用户维护文件树（同 MD 与附件），路径保持与本地一致；不入库，仅文件持久化；可选 `manifest.json` 加速列表。
- 冲突解决：last-write-wins；产生冲突时保留副本，如 `file.md` 与 `file (conflict from device-XYZ).md`；客户端提示用户处理。
- 选择性同步：支持忽略规则（如 `.gitignore` 风格：`*.tmp`, `attachments/cache/`）。
- 快速保存：从剪贴板保存可选择写入“默认.md”（追加）或在目标列表新建 `.md`；同步开启时自动入队上传。
- 安全：Markdown 预览做 XSS 过滤，外链白名单；网络失败自动重试与指数退避。

## 后端接口（文件与目录同步）
- 基础：
  - `GET /api/v1/note-files/tree`（返回用户根目录的文件树或指定子路径）
  - `GET /api/v1/note-files/file?path=/Work/meeting.md`（下载 MD 文本）
  - `PUT /api/v1/note-files/file`（创建/更新：`path` + `content`）
  - `PATCH /api/v1/note-files/file`（重命名/移动：`path` + `new_path`）
  - `DELETE /api/v1/note-files/file?path=...`（删除）
- 附件：
  - `POST /api/v1/note-files/upload?path=/Work/attachments/`（上传文件）
- 同步：
  - `POST /api/v1/note-files/sync`（客户端批量事件：create/update/rename/delete，含元数据与哈希）
  - `GET /api/v1/note-files/manifest`（获取服务器端清单）
  - `PUT /api/v1/note-files/manifest`（更新服务器端清单，用于快速比对与校验）
- 权限与隔离：所有路径均在用户隔离空间下（按用户ID划分根目录），鉴权基于现有 JWT。

## 前端实现计划
- Store（Zustand）新增 `noteFiles` 模块：
  - 配置：`getDefaultDir / setDefaultDir`，`getDefaultFile / setDefaultFile`，`toggleSync`，`syncRules`
  - 本地文件：`readFile / writeFile / appendToFile / renameFile / deleteFile`
  - 目录树：`listTree / createDir / renameDir / deleteDir`
  - 附件：`saveImageToAttachments(dir) -> relativePath`
  - 快速保存：`saveClipboardItemToDefaultMd(item)`（文本/图片/URL/文件）；同步开启时写入事件队列
  - 同步：`enqueueEvent / flushQueue / resolveConflict / fetchManifest / diffWithManifest`
- 组件：
  - `NotebookTab`（编辑/预览切换）
  - `MarkdownEditor`（编辑器，支持粘贴与快捷键）
  - `MarkdownPreview`（安全渲染）
  - `FileTreeSidebar`（默认目录的文件/文件夹树，支持管理与搜索）
- 与剪贴板融合：卡片操作区提供“保存到记事本（默认.md）”。

### 粘贴图片实现（前端）
- 工具函数：`ensureAttachmentsDir()`、`makeSafeFileName(name, ext)`、`computeHash(blob)`、`saveBlobToFile(dir, filename, blob)`、`insertMarkdownImage(relativePath, alt)`。
- 事件处理：`handlePaste(event)`
  - 提取 `image/*` 项并转 `Blob`；校验体积与类型；必要时压缩或转换。
  - `ensureAttachmentsDir` 并生成文件名；`computeHash` 去重；`saveBlobToFile` 保存；在编辑器插入 Markdown 图片语法。
  - 若同步开启：`enqueueEvent({ type: 'create', path, hash, size, mtime })`。

## 体验优化
- 模板：新建笔记支持模板（会议纪要/思维笔记/任务）。
- 标签与看板视图：除分列表外，以标签维度建立看板视图。
- 快捷键：`Ctrl+N` 新建、`Ctrl+S` 保存、`Ctrl+Shift+P` 预览、`Ctrl+Shift+I` 插图。
- 自动保存：编辑时 1–2 秒防抖保存，保存状态提示。
- 草稿恢复：异常退出后自动恢复未保存内容。
- 导出与共享：导出为 Markdown/HTML/PNG（预览快照）、生成分享链接。

## 落地步骤（建议）
0. 设置默认目录与默认.md：文件选择器与校验，保存到本地配置。
1. 前端本地实现：编辑/预览、`default.md` 读写与附件追加，历史一键保存。
2. 目录管理视图：文件树侧栏与基本增删改；搜索与筛选。
3. 后端基础接口：文件读写/上传/删除与树查询；按用户隔离根目录。
4. 增量同步：事件队列与批量上传；`manifest` 比对与冲突保留；UI 冲突提示与解决。
5. 体验与安全：XSS 过滤、快捷键、错误提示与恢复；忽略规则与资源限制。

## 备注
- 不新增数据库表；后端以文件存储为主，按用户隔离目录。
- 前端采用与现有剪贴板历史一致的分页与滚动方案，确保切换 Tab 后观察器重新初始化。
