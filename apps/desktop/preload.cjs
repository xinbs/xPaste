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
    const validChannels = ['toggle-clipboard-monitoring', 'switch-to-tab'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },
  removeListener: (channel, callback) => {
    const validChannels = ['toggle-clipboard-monitoring', 'switch-to-tab'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  }
});