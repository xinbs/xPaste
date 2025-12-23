export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  isDevelopment: () => Promise<boolean>;
  showSaveDialog: (options: Record<string, unknown>) => Promise<{ canceled?: boolean; filePath?: string }>;
  showOpenDialog: (options: Record<string, unknown>) => Promise<{ canceled?: boolean; filePaths?: string[] }>;
  openSettingsWindow: () => Promise<void>;
  showMainWindow: () => Promise<{ success: boolean; error?: string }>;
  quitApp: () => Promise<{ success: boolean; error?: string }>;
  
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
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
  
  // 日志
  log: (message: string, data?: unknown) => void;
  syncToken: (token: string) => void;
  onRequestToken: (callback: () => void) => void;

  // 服务器配置同步
  syncServerConfig: (config: { apiBaseUrl?: string; baseUrl?: string }) => void;
  onRequestServerConfig: (callback: () => void) => void;

  // 快捷键同步
  syncHotkeys: (hotkeys: { show_window?: string }) => Promise<{ success: boolean; error?: string }>;
  // 关闭行为同步
  syncCloseBehavior: (behavior: { close_action: 'minimize' | 'hide' | 'quit' }) => Promise<{ success: boolean; error?: string }>;
  readTextFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  writeTextFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  appendTextFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  ensureDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
  listDir: (dirPath: string) => Promise<{ success: boolean; data?: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>; error?: string }>;
  deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  renamePath: (fromPath: string, toPath: string) => Promise<{ success: boolean; error?: string }>;
  saveBase64File: (filePath: string, base64DataUrl: string) => Promise<{ success: boolean; error?: string }>;
  saveBytesFile: (filePath: string, bytes: Uint8Array) => Promise<{ success: boolean; error?: string }>;
  readBytesFile: (filePath: string) => Promise<{ success: boolean; data?: Uint8Array; error?: string }>;
  readDataUrlFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  statPath: (targetPath: string) => Promise<{ success: boolean; data?: { isFile: boolean; isDirectory: boolean; sizeBytes: number; mtimeMs: number; ctimeMs: number; atimeMs: number }; error?: string }>;
  existsPath: (targetPath: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
