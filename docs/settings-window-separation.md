# 设置窗口独立化改进

## 概述

为了提供更好的用户体验，我们将设置界面从主窗口的标签页中分离出来，创建了一个独立的设置窗口。这个改进让用户可以在使用主功能的同时，方便地调整应用设置。

## 改进内容

### 1. 主进程改进

- **新增设置窗口创建函数**: 在 `main.cjs` 中添加了 `createSettingsWindow()` 函数
- **窗口管理**: 实现了设置窗口的单例模式，避免重复创建
- **IPC 通信**: 添加了 `open-settings-window` IPC 处理程序
- **菜单集成**: 在应用菜单中添加了"设置"选项，支持快捷键 `Ctrl+,` (或 `Cmd+,`)

### 2. 前端路由改进

- **路由支持**: 在 `App.tsx` 中添加了基于 hash 的简单路由系统
- **独立设置页面**: 创建了 `SettingsPage.tsx` 组件，专门用于设置窗口
- **类型定义**: 添加了 `electron.d.ts` 类型定义文件

### 3. 主界面优化

- **移除设置标签页**: 从 `Dashboard.tsx` 中移除了设置标签页
- **添加设置按钮**: 在主界面顶部添加了"设置"按钮，点击可打开独立设置窗口
- **界面简化**: 主界面现在只专注于剪贴板和设备管理功能

## 技术实现

### 窗口配置

```javascript
settingsWindow = new BrowserWindow({
  width: 800,
  height: 600,
  parent: mainWindow,
  modal: false,
  title: 'xPaste 设置'
});
```

### 路由处理

设置窗口通过 URL hash `#/settings` 来加载独立的设置页面：

```javascript
const settingsUrl = isDev 
  ? 'http://localhost:5173/#/settings' 
  : `file://${path.join(__dirname, '../frontend/dist/index.html')}#/settings`;
```

### IPC 通信

```javascript
// 主进程
ipcMain.handle('open-settings-window', () => {
  createSettingsWindow();
});

// 渲染进程
window.electronAPI.openSettingsWindow()
```

## 用户体验改进

### 优势

1. **并行操作**: 用户可以在查看剪贴板历史的同时调整设置
2. **专注性**: 主界面更加专注于核心功能
3. **便捷性**: 通过菜单快捷键或按钮快速访问设置
4. **一致性**: 设置窗口保持独立，符合桌面应用的常见模式

### 交互流程

1. 用户可以通过以下方式打开设置窗口：
   - 点击主界面顶部的"设置"按钮
   - 使用菜单：文件 → 设置
   - 快捷键：`Ctrl+,` (Windows/Linux) 或 `Cmd+,` (macOS)

2. 设置窗口打开后：
   - 如果窗口已存在，则聚焦到该窗口
   - 窗口关闭后会自动清理资源
   - 支持独立的开发者工具（开发模式下）

## 文件变更清单

### 新增文件
- `apps/desktop/preload.cjs` - Electron preload 脚本
- `apps/desktop/frontend/src/components/SettingsPage.tsx` - 独立设置页面组件
- `apps/desktop/frontend/src/types/electron.d.ts` - TypeScript 类型定义
- `docs/settings-window-separation.md` - 本文档

### 修改文件
- `apps/desktop/main.cjs` - 添加设置窗口创建和菜单项
- `apps/desktop/frontend/src/App.tsx` - 添加路由支持
- `apps/desktop/frontend/src/components/Dashboard.tsx` - 移除设置标签页，添加设置按钮
- `README.md` - 更新功能说明

## 后续优化建议

1. **窗口状态记忆**: 记住设置窗口的位置和大小
2. **主题同步**: 确保设置窗口与主窗口的主题保持一致
3. **设置实时生效**: 在设置窗口中的更改能够实时反映到主窗口
4. **键盘导航**: 为设置窗口添加更好的键盘导航支持