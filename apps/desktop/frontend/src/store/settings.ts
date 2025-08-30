import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { settingsApi, Setting } from '../api/settings';
import { useToastStore } from './toast';

// 预定义的设置键
export const SETTING_KEYS = {
  // 用户设置
  USER_THEME: 'user.theme',
  USER_LANGUAGE: 'user.language',
  USER_TIMEZONE: 'user.timezone',
  USER_AUTO_SYNC: 'user.auto_sync',
  USER_SYNC_INTERVAL: 'user.sync_interval',
  USER_MAX_HISTORY: 'user.max_history',
  USER_ENABLE_OCR: 'user.enable_ocr',
  USER_OCR_LANGUAGE: 'user.ocr_language',
  USER_NOTIFICATIONS: 'user.notifications',
  USER_HOTKEYS: 'user.hotkeys',
} as const;

// 设置分组
export const SETTING_GROUPS = {
  GENERAL: 'general',
  SYNC: 'sync',
  APPEARANCE: 'appearance',
  ADVANCED: 'advanced',
  SECURITY: 'security',
} as const;

// 设置状态接口
interface SettingsState {
  // 状态
  settings: Record<string, Setting>;
  isLoading: boolean;
  error: string | null;
  
  // 操作方法
  fetchSettings: (category?: string) => Promise<void>;
  getSetting: (key: string, defaultValue?: any) => any;
  setSetting: (key: string, value: any) => Promise<void>;
  batchSetSettings: (settings: Record<string, any>) => Promise<void>;
  resetSetting: (key: string) => Promise<void>;
  exportSettings: () => Promise<Record<string, any>>;
  importSettings: (settings: Record<string, any>) => Promise<void>;
  clearError: () => void;
  
  // 便捷方法
  getTheme: () => string;
  setTheme: (theme: string) => Promise<void>;
  getLanguage: () => string;
  setLanguage: (language: string) => Promise<void>;
  getAutoSync: () => boolean;
  setAutoSync: (enabled: boolean) => Promise<void>;
  getSyncInterval: () => number;
  setSyncInterval: (interval: number) => Promise<void>;
}

// 创建设置store
export const useSettingsStore = create<SettingsState>()((
  persist(
    (set, get) => ({
      // 初始状态
      settings: {},
      isLoading: false,
      error: null,
      
      // 获取设置
      fetchSettings: async (category?: string) => {
        set({ isLoading: true, error: null });
        try {
          const settings = await settingsApi.getUserSettings(category);
          const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.key] = setting;
            return acc;
          }, {} as Record<string, Setting>);
          
          set({ settings: settingsMap, isLoading: false });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '获取设置失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('获取设置失败', errorMessage);
        }
      },
      
      // 获取单个设置值
      getSetting: (key: string, defaultValue?: any) => {
        const { settings } = get();
        const setting = settings[key];
        if (!setting) return defaultValue;
        
        // 根据类型转换值
        switch (setting.type) {
          case 'boolean':
            return setting.value === 'true';
          case 'number':
            return Number(setting.value);
          case 'json':
          case 'array':
          case 'object':
            try {
              return JSON.parse(setting.value);
            } catch {
              return defaultValue;
            }
          default:
            return setting.value;
        }
      },
      
      // 设置单个设置
      setSetting: async (key: string, value: any) => {
        set({ isLoading: true, error: null });
        try {
          const setting = await settingsApi.setUserSetting(key, value);
          set(state => ({
            settings: {
              ...state.settings,
              [key]: setting
            },
            isLoading: false
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '设置失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('设置失败', errorMessage);
        }
      },
      
      // 批量设置
      batchSetSettings: async (settings: Record<string, any>) => {
        set({ isLoading: true, error: null });
        try {
          await settingsApi.batchSetUserSettings(settings);
          // 重新获取设置
          await get().fetchSettings();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '批量设置失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('批量设置失败', errorMessage);
        }
      },
      
      // 重置设置
      resetSetting: async (key: string) => {
        set({ isLoading: true, error: null });
        try {
          await settingsApi.deleteUserSetting(key);
          set(state => {
            const newSettings = { ...state.settings };
            delete newSettings[key];
            return { settings: newSettings, isLoading: false };
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '重置设置失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('重置设置失败', errorMessage);
        }
      },
      
      // 导出设置
      exportSettings: async () => {
        try {
          return await settingsApi.exportUserSettings();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '导出设置失败';
          set({ error: errorMessage });
          useToastStore.getState().showError('导出设置失败', errorMessage);
          throw error;
        }
      },
      
      // 导入设置
      importSettings: async (settings: Record<string, any>) => {
        set({ isLoading: true, error: null });
        try {
          await settingsApi.importUserSettings(settings);
          // 重新获取设置
          await get().fetchSettings();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '导入设置失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('导入设置失败', errorMessage);
        }
      },
      
      // 清除错误
      clearError: () => set({ error: null }),
      
      // 便捷方法
      getTheme: () => get().getSetting(SETTING_KEYS.USER_THEME, 'light'),
      setTheme: (theme: string) => get().setSetting(SETTING_KEYS.USER_THEME, theme),
      
      getLanguage: () => get().getSetting(SETTING_KEYS.USER_LANGUAGE, 'zh-CN'),
      setLanguage: (language: string) => get().setSetting(SETTING_KEYS.USER_LANGUAGE, language),
      
      getAutoSync: () => get().getSetting(SETTING_KEYS.USER_AUTO_SYNC, true),
      setAutoSync: (enabled: boolean) => get().setSetting(SETTING_KEYS.USER_AUTO_SYNC, enabled),
      
      getSyncInterval: () => get().getSetting(SETTING_KEYS.USER_SYNC_INTERVAL, 5000),
      setSyncInterval: (interval: number) => get().setSetting(SETTING_KEYS.USER_SYNC_INTERVAL, interval),
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
));