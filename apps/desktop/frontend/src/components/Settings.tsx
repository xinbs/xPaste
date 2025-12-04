import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw, Download, Upload, AlertCircle, CheckCircle, X, Server, Wifi, LogIn, Keyboard } from 'lucide-react';
import { useSettingsStore, SETTING_KEYS, SETTING_GROUPS } from '../store/settings';
import { useAuthStore } from '../store/auth';
import { useConfigStore } from '../store/config';
import { cn } from '../lib/utils';

// 设置项组件
interface SettingItemProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  error?: string;
}

const SettingItem: React.FC<SettingItemProps> = ({ title, description, children, error }) => (
  <div className="py-3 border-b border-gray-200 last:border-b-0">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-start md:justify-between gap-4 setting-item">
      <div className="flex-1 min-w-[160px] md:mr-4">
        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        {description && (
          <p className="mt-1 text-xs text-gray-500 leading-normal">{description}</p>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-600 flex items-center">
            <AlertCircle className="w-3 h-3 mr-1" />
            {error}
          </p>
        )}
      </div>
          <div className="w-full md:w-auto shrink min-w-0 max-w-full">
        {children}
      </div>
    </div>
  </div>
);

// 开关组件
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    className={cn(
      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
      checked ? 'bg-blue-600' : 'bg-gray-200',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
        checked ? 'translate-x-5' : 'translate-x-0'
      )}
    />
  </button>
);

// 选择框组件
interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

const Select: React.FC<SelectProps> = ({ value, onChange, options, disabled = false }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={cn(
      'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm',
      disabled && 'bg-gray-100 cursor-not-allowed'
    )}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

// 数字输入框组件
interface NumberInputProps {
  value: number;
  onChange?: (value: number) => void;
  onBlur?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

const NumberInput: React.FC<NumberInputProps> = ({ 
  value, 
  onChange, 
  onBlur,
  min, 
  max, 
  step = 1, 
  disabled = false 
}) => {
  const [localValue, setLocalValue] = React.useState(value);
  
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  return (
    <input
      type="number"
      value={localValue}
      onChange={(e) => {
        const newValue = Number(e.target.value);
        setLocalValue(newValue);
        onChange?.(newValue);
      }}
      onBlur={(e) => {
        const newValue = Number(e.target.value);
        onBlur?.(newValue);
      }}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn(
        'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm',
        disabled && 'bg-gray-100 cursor-not-allowed'
      )}
    />
  );
};

// 主设置组件
export const Settings: React.FC = () => {
  const { isAuthenticated, user, validateToken } = useAuthStore();
  const {
    settings,
    isLoading,
    error,
    fetchSettings,
    getSetting,
    setSetting,
    resetSetting,
    exportSettings,
    importSettings,
    clearError,
    getTheme,
    setTheme,
    getLanguage,
    setLanguage,
    getAutoSync,
    setAutoSync,
    getSyncInterval,
    setSyncInterval,
  } = useSettingsStore();
  
  const { serverConfig, setServerConfig } = useConfigStore();

  const [activeGroup, setActiveGroup] = useState<keyof typeof SETTING_GROUPS | string>('general');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const defaultHotkey = 'CmdOrCtrl+Shift+V';
  // 兼容后端将 JSON 以字符串返回的情况
  const safeParseJson = (val: any, fallback: any) => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { return JSON.parse(trimmed); } catch { return fallback; }
      }
      return fallback;
    }
    return val ?? fallback;
  };

  // 解析形如 Go 的 map 字符串: map[key:value key2:value2]
  const parseGoMapString = (str: string): Record<string, string> => {
    if (typeof str !== 'string') return {};
    const m = str.match(/^map\[(.*)\]$/);
    if (!m) return {};
    const body = m[1];
    const result: Record<string, string> = {};
    body.split(/\s+/).forEach((pair) => {
      const idx = pair.indexOf(':');
      if (idx > 0) {
        const key = pair.slice(0, idx);
        const value = pair.slice(idx + 1);
        if (key) result[key] = value;
      }
    });
    return result;
  };

  const isValidHotkey = (val: any): val is string => {
    return (
      typeof val === 'string' &&
      !val.startsWith('map[') &&
      val.trim().length > 0 &&
      /[A-Za-z0-9]/.test(val)
    );
  };

  const initialHotkeysRaw = typeof getSetting === 'function' ? getSetting(SETTING_KEYS.USER_HOTKEYS, {}) : undefined;
  const initialHotkeysObj = safeParseJson(initialHotkeysRaw, {});
  const initialGoMap = typeof initialHotkeysRaw === 'string' ? parseGoMapString(initialHotkeysRaw) : {};
  const initialCandidate = initialHotkeysObj?.show_window || initialGoMap?.show_window || initialHotkeysRaw;
  const initialShowKey = isValidHotkey(initialCandidate) ? initialCandidate : defaultHotkey;
  const [hotkeyShowWindow, setHotkeyShowWindow] = useState<string>(initialShowKey);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState<boolean>(false);

  // 监听键盘以录制快捷键
  useEffect(() => {
    if (!isRecordingHotkey) return;

    const normalizeKey = (e) => {
      const k = e.key;
      const specialMap = {
        Escape: 'Escape', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete',
        Tab: 'Tab', Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right'
      };
      if (specialMap[k]) return specialMap[k];
      if (/^F\d{1,2}$/.test(k)) return k; // F1-F12
      if (k.length === 1) return k.toUpperCase();
      // For non-character keys like 'Home', 'End'
      return k;
    };

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 按 ESC 取消录制
      if (e.key === 'Escape') {
        setIsRecordingHotkey(false);
        return;
      }

      const key = normalizeKey(e);
      const isModifierOnly = ['Shift', 'Alt', 'Control', 'Meta'].includes(key);

      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      // 仅按修饰键时，不结束录制，等待主键输入
      if (isModifierOnly) {
        return;
      }

      if (key) parts.push(key);
      const accel = parts.join('+');
      if (accel) setHotkeyShowWindow(accel);
      setIsRecordingHotkey(false);
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.removeEventListener('keydown', handler, { capture: true });
    };
  }, [isRecordingHotkey]);

  // 当设置变化时，更新本地快捷键显示，并仅在有效时同步到主进程
  useEffect(() => {
    try {
      const hotkeysRaw = getSetting(SETTING_KEYS.USER_HOTKEYS, {});
      const hotkeys = safeParseJson(hotkeysRaw, {});
      const goMap = typeof hotkeysRaw === 'string' ? parseGoMapString(hotkeysRaw) : {};
      const candidate = hotkeys?.show_window || goMap?.show_window || hotkeysRaw;
      const showKey = isValidHotkey(candidate) ? candidate : defaultHotkey;
      setHotkeyShowWindow(showKey);
      if (isValidHotkey(showKey) && window.electronAPI && typeof window.electronAPI.syncHotkeys === 'function') {
        window.electronAPI.syncHotkeys({ show_window: showKey });
      }
    } catch (_) {}
  }, [settings]);

  // 组件挂载时获取设置
  useEffect(() => {
    // 使用配置存储中的服务器地址
    setServerUrl(serverConfig.baseUrl);
    
    // 调试信息
    console.log('Settings组件初始化:', {
      isAuthenticated,
      user,
      settingsCount: Object.keys(settings).length,
      settings: settings
    });
    
    // 只有在已认证的情况下才获取设置
    if (isAuthenticated) {
      console.log('用户已认证，刷新API token并获取设置...');
      // 刷新API客户端的token
      import('../lib/api').then(({ apiClient }) => {
        apiClient.refreshToken();
        fetchSettings();
      });
    } else {
      console.log('用户未认证，跳过设置获取');
    }
  }, [fetchSettings, isAuthenticated, serverConfig.baseUrl]);

  // 保存设置的通用处理
  const handleSave = async (key: string, value: any) => {
    console.log('开始保存设置:', { key, value, isAuthenticated, user });
    setSaveStatus('saving');
    try {
      if (!isAuthenticated) {
        console.error('用户未登录，无法保存设置');
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
        return;
      }
      
      await setSetting(key, value);
      console.log('设置保存成功:', { key, value });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('设置保存失败:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 导出设置
  const handleExport = async () => {
    try {
      const settingsData = await exportSettings();
      const blob = new Blob([JSON.stringify(settingsData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xpaste-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出设置失败:', error);
    }
  };

  // 导入设置
  const handleImport = async () => {
    if (!importFile) return;
    
    try {
      const text = await importFile.text();
      const settingsData = JSON.parse(text);
      await importSettings(settingsData);
      setImportFile(null);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('导入设置失败:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 设置组
  const settingGroups = [
    { key: 'general' as const, label: '常规设置', icon: SettingsIcon },
    { key: 'appearance' as const, label: '外观设置', icon: SettingsIcon },
    { key: 'server' as const, label: '服务器配置', icon: Server },
    { key: 'sync' as const, label: '同步设置', icon: SettingsIcon },
    { key: 'advanced' as const, label: '高级设置', icon: SettingsIcon },
  ];

  // 主题选项
  const themeOptions = [
    { value: 'light', label: '浅色主题' },
    { value: 'dark', label: '深色主题' },
    { value: 'auto', label: '跟随系统' },
  ];

  // 语言选项
  const languageOptions = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ];

  // 渲染常规设置
  const renderGeneralSettings = () => (
    <div className="space-y-0">
      <SettingItem
        title="语言设置"
        description="选择应用程序的显示语言"
      >
        <Select
          value={getLanguage()}
          onChange={(value) => handleSave(SETTING_KEYS.USER_LANGUAGE, value)}
          options={languageOptions}
          disabled={isLoading}
        />
      </SettingItem>
      
      <SettingItem
        title="时区设置"
        description="设置您所在的时区"
      >
        <Select
          value={getSetting(SETTING_KEYS.USER_TIMEZONE, 'Asia/Shanghai')}
          onChange={(value) => handleSave(SETTING_KEYS.USER_TIMEZONE, value)}
          options={[
            { value: 'Asia/Shanghai', label: '北京时间 (UTC+8)' },
            { value: 'America/New_York', label: '纽约时间 (UTC-5)' },
            { value: 'Europe/London', label: '伦敦时间 (UTC+0)' },
            { value: 'Asia/Tokyo', label: '东京时间 (UTC+9)' },
          ]}
          disabled={isLoading}
        />
      </SettingItem>
      
      <SettingItem
        title="最大历史记录"
        description="设置保存的剪贴板历史记录数量"
      >
        <NumberInput
          value={getSetting(SETTING_KEYS.USER_MAX_HISTORY, 100)}
          onBlur={(value) => handleSave(SETTING_KEYS.USER_MAX_HISTORY, value)}
          min={10}
          max={1000}
          step={10}
          disabled={isLoading}
        />
      </SettingItem>
      
      <SettingItem
        title="自动清理"
        description="启用自动清理过期的剪贴板历史记录"
      >
        <Switch
          checked={getSetting(SETTING_KEYS.USER_AUTO_CLEANUP, false)}
          onChange={(checked) => handleSave(SETTING_KEYS.USER_AUTO_CLEANUP, checked)}
          disabled={isLoading}
        />
      </SettingItem>

      <SettingItem
        title="呼出主程序快捷键"
        description="记录并保存用于显示主窗口的全局快捷键"
      >
        <div className="flex flex-wrap items-center gap-2 w-full">
          <div className="flex items-center px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-800 w-full sm:w-auto sm:flex-1 sm:min-w-[140px]">
            <Keyboard className="w-4 h-4 mr-2 text-gray-600 flex-shrink-0" />
            <span className="truncate">{hotkeyShowWindow}</span>
            {isRecordingHotkey && (
              <span className="ml-2 text-xs text-blue-600 whitespace-nowrap">正在记录...</span>
            )}
          </div>
          <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsRecordingHotkey(true)}
              disabled={isLoading || isRecordingHotkey}
              className={cn('col-span-1 inline-flex items-center px-3 py-2 text-sm rounded-md justify-center whitespace-nowrap flex-1 sm:flex-none',
                isRecordingHotkey ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              记录
            </button>
            <button
              onClick={() => setHotkeyShowWindow(defaultHotkey)}
              disabled={isLoading}
              className={cn('col-span-1 inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 justify-center whitespace-nowrap flex-1 sm:flex-none')}
            >
              恢复默认
            </button>
            <button
              onClick={async () => {
                setSaveStatus('saving');
                try {
                  if (isAuthenticated) {
                    await setSetting(SETTING_KEYS.USER_HOTKEYS, { show_window: hotkeyShowWindow });
                  }
                  if (window.electronAPI && window.electronAPI.syncHotkeys) {
                    await window.electronAPI.syncHotkeys({ show_window: hotkeyShowWindow });
                  }
                  setSaveStatus('saved');
                  setTimeout(() => setSaveStatus('idle'), 2000);
                } catch (err) {
                  console.error('保存快捷键失败:', err);
                  setSaveStatus('error');
                  setTimeout(() => setSaveStatus('idle'), 3000);
                }
              }}
              disabled={isLoading || saveStatus === 'saving'}
              className={cn('col-span-1 inline-flex items-center px-3 py-2 text-sm rounded-md justify-center whitespace-nowrap flex-1 sm:flex-none',
                saveStatus === 'saving' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
              )}
            >
              <Save className="w-4 h-4 mr-2" />
              保存
            </button>
            <button
              onClick={() => window.electronAPI?.showMainWindow?.()}
              className={cn('col-span-1 inline-flex items-center px-3 py-2 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 justify-center whitespace-nowrap flex-1 sm:flex-none')}
            >
              测试
            </button>
          </div>
        </div>
      </SettingItem>
      
      {getSetting(SETTING_KEYS.USER_AUTO_CLEANUP, false) && (
        <SettingItem
          title="清理周期"
          description="设置自动清理的时间周期"
        >
          <Select
            value={getSetting(SETTING_KEYS.USER_CLEANUP_PERIOD, 'never')}
            onChange={(value) => handleSave(SETTING_KEYS.USER_CLEANUP_PERIOD, value)}
            options={[
              { value: 'never', label: '永不清理' },
              { value: '7d', label: '7天' },
              { value: '15d', label: '15天' },
              { value: '1m', label: '1个月' },
              { value: '3m', label: '3个月' },
              { value: '6m', label: '6个月' },
              { value: '1y', label: '1年' },
            ]}
            disabled={isLoading}
          />
        </SettingItem>
      )}
    </div>
  );

  // 渲染外观设置
  const renderAppearanceSettings = () => (
    <div className="space-y-0">
      <SettingItem
        title="主题设置"
        description="选择应用程序的外观主题"
      >
        <Select
          value={getTheme()}
          onChange={(value) => handleSave(SETTING_KEYS.USER_THEME, value)}
          options={themeOptions}
          disabled={isLoading}
        />
      </SettingItem>
    </div>
  );

  // 测试服务器连接
  const testServerConnection = async () => {
    if (!serverUrl.trim()) {
      setConnectionError('请输入服务器地址');
      return;
    }

    setConnectionStatus('testing');
    setConnectionError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${serverUrl}/api/v1/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        setConnectionStatus('success');
        // 保存服务器地址到配置存储
        setServerConfig({
          baseUrl: serverUrl.replace(/\/$/, ''),
          wsUrl: serverUrl.replace(/^http/, 'ws').replace(/\/$/, '')
        });
      } else {
        throw new Error(`服务器响应错误: ${response.status}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : '连接失败');
    }
  };

  // 渲染服务器设置
  const renderServerSettings = () => {
    return (
      <div className="space-y-0">
        {/* 当前使用的服务器地址 */}
        <SettingItem
          title="当前服务器地址"
          description="正在使用的服务器地址"
        >
          <div className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-md">
            {serverConfig.baseUrl}
          </div>
        </SettingItem>
        
        <SettingItem
          title="服务器地址配置"
          description="设置同步服务器的地址，例如: http://localhost:8080"
          error={connectionError || undefined}
        >
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://localhost:8080"
              className="block w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={isLoading || connectionStatus === 'testing'}
            />
            <button
              onClick={testServerConnection}
              disabled={isLoading || connectionStatus === 'testing' || !serverUrl.trim()}
              className={cn(
                'inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 w-full sm:w-auto justify-center',
                connectionStatus === 'success'
                  ? 'text-green-700 bg-green-100 hover:bg-green-200'
                  : connectionStatus === 'error'
                  ? 'text-red-700 bg-red-100 hover:bg-red-200'
                  : 'text-blue-700 bg-blue-100 hover:bg-blue-200'
              )}
            >
              {connectionStatus === 'testing' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
              ) : (
                <Wifi className="w-4 h-4 mr-2" />
              )}
              {connectionStatus === 'testing'
                ? '测试中...'
                : connectionStatus === 'success'
                ? '连接成功'
                : connectionStatus === 'error'
                ? '重新测试'
                : '测试连接'
              }
            </button>
          </div>
          
          {/* 保存按钮 */}
          {serverUrl.trim() && (
            <div className="mt-2">
              <button
                onClick={async () => {
                  setSaveStatus('saving');
                  try {
                    // 更新配置存储
                    setServerConfig({
                      baseUrl: serverUrl.replace(/\/$/, ''),
                      wsUrl: serverUrl.replace(/^http/, 'ws').replace(/\/$/, '')
                    });
                    setSaveStatus('saved');
                    setTimeout(() => setSaveStatus('idle'), 2000);
                  } catch (error) {
                    setSaveStatus('error');
                    setTimeout(() => setSaveStatus('idle'), 2000);
                  }
                }}
                disabled={saveStatus === 'saving' || serverUrl === serverConfig.baseUrl}
                className={cn(
                  'inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 w-full sm:w-auto justify-center',
                  saveStatus === 'saving' || serverUrl === serverConfig.baseUrl
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                )}
              >
                {saveStatus === 'saving' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {saveStatus === 'saving' 
                  ? '保存中...' 
                  : serverUrl === serverConfig.baseUrl 
                  ? '已保存' 
                  : '保存地址'
                }
              </button>
            </div>
          )}
        </SettingItem>
        
        {connectionStatus === 'success' && (
          <SettingItem
            title="连接状态"
            description="当前服务器连接状态"
          >
            <div className="flex items-center text-green-600">
              <CheckCircle className="w-4 h-4 mr-2" />
              已连接到服务器
            </div>
          </SettingItem>
        )}
      </div>
    );
  };

  // 渲染同步设置
  const renderSyncSettings = () => (
    <div className="space-y-0">
      <SettingItem
        title="自动同步"
        description="启用后将自动同步剪贴板内容到其他设备"
      >
        <Switch
          checked={getAutoSync()}
          onChange={(checked) => handleSave(SETTING_KEYS.USER_AUTO_SYNC, checked)}
          disabled={isLoading}
        />
      </SettingItem>
      
      <SettingItem
        title="同步间隔"
        description="设置自动同步的时间间隔（毫秒）"
      >
        <NumberInput
          value={getSyncInterval()}
          onChange={(value) => handleSave(SETTING_KEYS.USER_SYNC_INTERVAL, value)}
          min={1000}
          max={60000}
          step={1000}
          disabled={isLoading || !getAutoSync()}
        />
      </SettingItem>
      
      <SettingItem
        title="启用通知"
        description="接收到新的剪贴板内容时显示通知"
      >
        <Switch
          checked={getSetting(SETTING_KEYS.USER_NOTIFICATIONS, true)}
          onChange={(checked) => handleSave(SETTING_KEYS.USER_NOTIFICATIONS, checked)}
          disabled={isLoading}
        />
      </SettingItem>
    </div>
  );

  // 渲染高级设置
  const renderAdvancedSettings = () => (
    <div className="space-y-0">
      <SettingItem
        title="启用OCR"
        description="对图片内容进行文字识别"
      >
        <Switch
          checked={getSetting(SETTING_KEYS.USER_ENABLE_OCR, false)}
          onChange={(checked) => handleSave(SETTING_KEYS.USER_ENABLE_OCR, checked)}
          disabled={isLoading}
        />
      </SettingItem>
      
      <SettingItem
        title="OCR语言"
        description="设置OCR识别的语言"
      >
        <Select
          value={getSetting(SETTING_KEYS.USER_OCR_LANGUAGE, 'zh-CN')}
          onChange={(value) => handleSave(SETTING_KEYS.USER_OCR_LANGUAGE, value)}
          options={[
            { value: 'zh-CN', label: '简体中文' },
            { value: 'en-US', label: 'English' },
            { value: 'ja-JP', label: '日本語' },
          ]}
          disabled={isLoading || !getSetting(SETTING_KEYS.USER_ENABLE_OCR, false)}
        />
      </SettingItem>
      
      <SettingItem
        title="导出设置"
        description="将当前设置导出为JSON文件"
      >
        <button
          onClick={handleExport}
          disabled={isLoading}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" />
          导出
        </button>
      </SettingItem>
      
      <SettingItem
        title="导入设置"
        description="从JSON文件导入设置"
      >
        <div className="flex items-center space-x-2">
          <input
            type="file"
            accept=".json"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {importFile && (
            <button
              onClick={handleImport}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              导入
            </button>
          )}
        </div>
      </SettingItem>
    </div>
  );

  // 根据活动组渲染设置内容
  const renderSettingsContent = () => {
    switch (activeGroup) {
      case 'general':
        return renderGeneralSettings();
      case 'appearance':
        return renderAppearanceSettings();
      case 'server':
        return renderServerSettings();
      case 'sync':
        return renderSyncSettings();
      case 'advanced':
        return renderAdvancedSettings();
      default:
        return renderGeneralSettings();
    }
  };

  return (
    <div className="flex h-full bg-gray-50 settings-layout">
      {/* 侧边栏 */}
      <div className="w-56 bg-white shadow-sm border-r border-gray-200 settings-sidebar">
        <div className="p-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 flex items-center">
            <SettingsIcon className="w-4 h-4 mr-1.5" />
            设置
          </h2>
        </div>
        <nav className="p-1.5">
          {settingGroups.map((group) => {
            const Icon = group.icon;
            return (
              <button
                key={group.key}
                onClick={() => setActiveGroup(group.key)}
                className={cn(
                  'w-full flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                  activeGroup === group.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
                title={group.label}
              >
                <Icon className="w-3 h-3 mr-2 flex-shrink-0" />
                <span>{group.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-auto settings-content">
        <div className="max-w-4xl mx-auto p-4">
          {/* 状态栏 */}
          {(error || saveStatus !== 'idle') && (
            <div className="mb-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1.5" />
                    <span className="text-xs">{error}</span>
                  </div>
                  <button
                    onClick={clearError}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              
              {saveStatus === 'saving' && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-md flex items-center">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700 mr-1.5"></div>
                  <span className="text-xs">正在保存...</span>
                </div>
              )}
              
              {saveStatus === 'saved' && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md flex items-center">
                  <CheckCircle className="w-3 h-3 mr-1.5" />
                  <span className="text-xs">设置已保存</span>
                </div>
              )}
              
              {saveStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1.5" />
                  <span className="text-xs">保存失败，请重试</span>
                </div>
              )}
            </div>
          )}

          {/* 设置内容 */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">
                {settingGroups.find(g => g.key === activeGroup)?.label}
              </h3>
            </div>
            <div className="px-4">
              {!isAuthenticated ? (
                <div className="py-8 text-center">
                  <LogIn className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-gray-900 mb-1.5">需要登录</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    请先登录您的账户以访问设置功能
                  </p>
                  <p className="text-xs text-gray-400">
                    提示：您可以在左侧导航栏中找到登录选项
                  </p>
                </div>
              ) : isLoading ? (
                <div className="py-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-xs text-gray-500">加载设置中...</p>
                </div>
              ) : (
                renderSettingsContent()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
