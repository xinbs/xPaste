const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 获取平台信息
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // 检查是否为开发模式
  isDevelopment: () => ipcRenderer.invoke('is-development'),
  
  // 调试环境信息
  debugEnv: () => ipcRenderer.invoke('debug-env'),
  
  // 显示保存对话框
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  
  // 显示打开对话框
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // 打开设置窗口
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  
  // 显示主窗口
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  unmaximizeWindow: () => ipcRenderer.invoke('unmaximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-current-window'),
  isWindowMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  
  // 监听窗口状态变化
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // 监听托盘事件
  on: (channel, callback) => {
    const validChannels = ['toggle-clipboard-monitoring', 'switch-to-tab', 'clipboard-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },
  removeListener: (channel, callback) => {
    const validChannels = ['toggle-clipboard-monitoring', 'switch-to-tab', 'clipboard-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  
  // 发送日志到主进程
  log: (message, data) => ipcRenderer.send('renderer-log', message, data),
  syncToken: (token) => ipcRenderer.send('sync-token', token),
  onRequestToken: (callback) => {
    // 先移除所有监听器，确保只注册一个
    ipcRenderer.removeAllListeners('request-token');
    ipcRenderer.on('request-token', callback);
  },
  // 同步服务器配置（例如 API 基地址）
  syncServerConfig: (config) => ipcRenderer.send('sync-server-config', config),
  // 监听主进程请求服务器配置
  onRequestServerConfig: (callback) => {
    ipcRenderer.removeAllListeners('request-server-config');
    ipcRenderer.on('request-server-config', callback);
  },
  
  // 同步用户快捷键到主进程（注册全局快捷键）
  syncHotkeys: (hotkeys) => ipcRenderer.invoke('update-hotkeys', hotkeys),
  // 同步关闭行为到主进程
  syncCloseBehavior: (behavior) => ipcRenderer.invoke('update-close-behavior', behavior),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  readTextFile: (filePath) => ipcRenderer.invoke('fs-read-text', filePath),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('fs-write-text', filePath, content),
  appendTextFile: (filePath, content) => ipcRenderer.invoke('fs-append-text', filePath, content),
  ensureDir: (dirPath) => ipcRenderer.invoke('fs-ensure-dir', dirPath),
  listDir: (dirPath) => ipcRenderer.invoke('fs-list', dirPath),
  deletePath: (targetPath) => ipcRenderer.invoke('fs-delete', targetPath),
  renamePath: (fromPath, toPath) => ipcRenderer.invoke('fs-rename', fromPath, toPath),
  saveBase64File: (filePath, base64DataUrl) => ipcRenderer.invoke('fs-save-base64', filePath, base64DataUrl),
  saveBytesFile: (filePath, bytes) => ipcRenderer.invoke('fs-save-bytes', filePath, bytes),
  readBytesFile: (filePath) => ipcRenderer.invoke('fs-read-bytes', filePath),
  readDataUrlFile: (filePath) => ipcRenderer.invoke('fs-read-dataurl', filePath),
  existsPath: (targetPath) => ipcRenderer.invoke('fs-exists', targetPath),
});
