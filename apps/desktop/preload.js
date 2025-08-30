const { contextBridge, ipcRenderer } = require('electron');

// 暴露受保护的方法给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // 文件对话框
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // 菜单事件监听
  onMenuNew: (callback) => {
    ipcRenderer.on('menu-new', callback);
    return () => ipcRenderer.removeListener('menu-new', callback);
  },
  
  onMenuImportSettings: (callback) => {
    ipcRenderer.on('menu-import-settings', (event, filePath) => callback(filePath));
    return () => ipcRenderer.removeListener('menu-import-settings', callback);
  },
  
  onMenuExportSettings: (callback) => {
    ipcRenderer.on('menu-export-settings', (event, filePath) => callback(filePath));
    return () => ipcRenderer.removeListener('menu-export-settings', callback);
  },
  
  // 深度链接
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (event, url) => callback(url));
    return () => ipcRenderer.removeListener('deep-link', callback);
  },
  
  // 剪贴板操作（如果需要原生剪贴板访问）
  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
    readText: () => ipcRenderer.invoke('clipboard-read-text'),
    writeImage: (image) => ipcRenderer.invoke('clipboard-write-image', image),
    readImage: () => ipcRenderer.invoke('clipboard-read-image'),
    clear: () => ipcRenderer.invoke('clipboard-clear')
  },
  
  // 通知
  showNotification: (title, body, options = {}) => {
    return ipcRenderer.invoke('show-notification', { title, body, ...options });
  },
  
  // 系统托盘（如果需要）
  setTrayTooltip: (tooltip) => ipcRenderer.invoke('set-tray-tooltip', tooltip),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  
  // 开发者工具
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools'),
  
  // 应用更新（如果使用自动更新）
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
    return () => ipcRenderer.removeListener('update-available', callback);
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
    return () => ipcRenderer.removeListener('update-downloaded', callback);
  },
  installUpdate: () => ipcRenderer.invoke('install-update')
});

// 类型定义（用于TypeScript支持）
if (typeof window !== 'undefined') {
  window.electronAPI = {
    getAppVersion: () => Promise.resolve(''),
    getPlatform: () => Promise.resolve(''),
    showSaveDialog: (options) => Promise.resolve({ canceled: false, filePath: '' }),
    showOpenDialog: (options) => Promise.resolve({ canceled: false, filePaths: [] }),
    onMenuNew: (callback) => () => {},
    onMenuImportSettings: (callback) => () => {},
    onMenuExportSettings: (callback) => () => {},
    onDeepLink: (callback) => () => {},
    clipboard: {
      writeText: (text) => Promise.resolve(),
      readText: () => Promise.resolve(''),
      writeImage: (image) => Promise.resolve(),
      readImage: () => Promise.resolve(null),
      clear: () => Promise.resolve()
    },
    showNotification: (title, body, options) => Promise.resolve(),
    setTrayTooltip: (tooltip) => Promise.resolve(),
    minimizeWindow: () => Promise.resolve(),
    maximizeWindow: () => Promise.resolve(),
    closeWindow: () => Promise.resolve(),
    toggleDevTools: () => Promise.resolve(),
    checkForUpdates: () => Promise.resolve(),
    onUpdateAvailable: (callback) => () => {},
    onUpdateDownloaded: (callback) => () => {},
    installUpdate: () => Promise.resolve()
  };
}