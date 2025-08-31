const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 获取平台信息
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // 显示保存对话框
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  
  // 显示打开对话框
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // 打开设置窗口
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  
  // 关闭当前窗口
  closeWindow: () => ipcRenderer.invoke('close-current-window')
});