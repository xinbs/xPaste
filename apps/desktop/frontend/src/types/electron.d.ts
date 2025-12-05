export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  isDevelopment: () => Promise<boolean>;
  showSaveDialog: (options: any) => Promise<any>;
  showOpenDialog: (options: any) => Promise<any>;
  openSettingsWindow: () => Promise<void>;
  showMainWindow: () => Promise<{ success: boolean; error?: string }>;
  
  // 窗口控制
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  unmaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  
  // 事件监听
  onWindowMaximized: (callback: () => void) => void;
  onWindowUnmaximized: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
  
  // 调试功能
  debugEnv: () => Promise<{
    NODE_ENV?: string;
    isDev?: boolean;
    platform?: string;
    allEnvKeys?: string[];
  }>;
  
  // 托盘事件监听
  on: (channel: string, callback: (...args: any[]) => void) => void;
  removeListener: (channel: string, callback: (...args: any[]) => void) => void;
  
  // 日志
  log: (message: string, data?: any) => void;
  syncToken: (token: string) => void;
  onRequestToken: (callback: () => void) => void;

  // 服务器配置同步
  syncServerConfig: (config: { apiBaseUrl?: string; baseUrl?: string }) => void;
  onRequestServerConfig: (callback: () => void) => void;

  // 快捷键同步
  syncHotkeys: (hotkeys: { show_window?: string }) => Promise<{ success: boolean; error?: string }>;
  // 关闭行为同步
  syncCloseBehavior: (behavior: { close_action: 'minimize' | 'hide' | 'quit' }) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
