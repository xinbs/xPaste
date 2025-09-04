export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  isDevelopment: () => Promise<boolean>;
  showSaveDialog: (options: any) => Promise<any>;
  showOpenDialog: (options: any) => Promise<any>;
  openSettingsWindow: () => Promise<void>;
  
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}