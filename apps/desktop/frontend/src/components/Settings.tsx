import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw, Download, Upload, AlertCircle, CheckCircle, X } from 'lucide-react';
import { useSettingsStore, SETTING_KEYS, SETTING_GROUPS } from '../store/settings';
import { cn } from '../lib/utils';

// 设置项组件
interface SettingItemProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  error?: string;
}

const SettingItem: React.FC<SettingItemProps> = ({ title, description, children, error }) => (
  <div className="py-4 border-b border-gray-200 last:border-b-0">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0 mr-4">
        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
        {error && (
          <p className="mt-1 text-sm text-red-600 flex items-center">
            <AlertCircle className="w-4 h-4 mr-1" />
            {error}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
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
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

const NumberInput: React.FC<NumberInputProps> = ({ 
  value, 
  onChange, 
  min, 
  max, 
  step = 1, 
  disabled = false 
}) => (
  <input
    type="number"
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
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

// 主设置组件
export const Settings: React.FC = () => {
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

  const [activeGroup, setActiveGroup] = useState<keyof typeof SETTING_GROUPS | string>('general');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [importFile, setImportFile] = useState<File | null>(null);

  // 组件挂载时获取设置
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 保存设置的通用处理
  const handleSave = async (key: string, value: any) => {
    setSaveStatus('saving');
    try {
      await setSetting(key, value);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
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
          onChange={(value) => handleSave(SETTING_KEYS.USER_MAX_HISTORY, value)}
          min={10}
          max={1000}
          step={10}
          disabled={isLoading}
        />
      </SettingItem>
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
      case 'sync':
        return renderSyncSettings();
      case 'advanced':
        return renderAdvancedSettings();
      default:
        return renderGeneralSettings();
    }
  };

  return (
    <div className="flex h-full bg-gray-50">
      {/* 侧边栏 */}
      <div className="w-64 bg-white shadow-sm border-r border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <SettingsIcon className="w-5 h-5 mr-2" />
            设置
          </h2>
        </div>
        <nav className="p-2">
          {settingGroups.map((group) => {
            const Icon = group.icon;
            return (
              <button
                key={group.key}
                onClick={() => setActiveGroup(group.key)}
                className={cn(
                  'w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  activeGroup === group.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="w-4 h-4 mr-3" />
                {group.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* 状态栏 */}
          {(error || saveStatus !== 'idle') && (
            <div className="mb-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {error}
                  </div>
                  <button
                    onClick={clearError}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              {saveStatus === 'saving' && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
                  正在保存...
                </div>
              )}
              
              {saveStatus === 'saved' && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  设置已保存
                </div>
              )}
              
              {saveStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  保存失败，请重试
                </div>
              )}
            </div>
          )}

          {/* 设置内容 */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {settingGroups.find(g => g.key === activeGroup)?.label}
              </h3>
            </div>
            <div className="px-6">
              {isLoading ? (
                <div className="py-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-500">加载设置中...</p>
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