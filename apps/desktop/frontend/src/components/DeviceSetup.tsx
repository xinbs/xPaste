import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useToastStore } from '@/store/toast';
import { getOrCreateDeviceId } from '@/lib/device';
import { cn } from '@/lib/utils';

interface DeviceSetupProps {
  onComplete?: () => void;
}

export default function DeviceSetup({ onComplete }: DeviceSetupProps) {
  const [deviceName, setDeviceName] = useState('');
  const [platform, setPlatform] = useState('');
  const { registerDevice, isLoading, error, clearError } = useAuthStore();
  const { showSuccess, showError } = useToastStore();

  useEffect(() => {
    // 自动检测平台信息
    const userAgent = navigator.userAgent;
    let detectedPlatform = 'unknown';
    
    if (userAgent.includes('Windows')) {
      detectedPlatform = 'windows';
    } else if (userAgent.includes('Mac')) {
      detectedPlatform = 'macos';
    } else if (userAgent.includes('Linux')) {
      detectedPlatform = 'linux';
    }
    
    setPlatform(detectedPlatform);
    
    // 生成默认设备名称
    const hostname = window.location.hostname || 'localhost';
    setDeviceName(`${detectedPlatform}-${hostname}`);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!deviceName.trim()) {
      showError('输入错误', '请输入设备名称');
      return;
    }

    const deviceInfo = {
      device_id: getOrCreateDeviceId(),
      name: deviceName.trim(),
      platform,
      version: '1.0.0',
      capabilities: {
        clipboard_read: true,
        clipboard_write: true,
        file_upload: true,
        image_ocr: false,
        notifications: true,
        websocket: true
      },
    };

    const success = await registerDevice(deviceInfo);
    if (success) {
      showSuccess('注册成功', '设备注册成功！');
      onComplete?.();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            设备设置
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            为了使用剪贴板同步功能，请先注册当前设备
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700">
                设备名称
              </label>
              <input
                id="deviceName"
                name="deviceName"
                type="text"
                required
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="请输入设备名称"
              />
              <p className="mt-1 text-xs text-gray-500">
                建议使用易于识别的名称，如 "我的笔记本" 或 "办公电脑"
              </p>
            </div>
            
            <div>
              <label htmlFor="platform" className="block text-sm font-medium text-gray-700">
                平台
              </label>
              <select
                id="platform"
                name="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
                <option value="unknown">其他</option>
              </select>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-blue-800 mb-2">设备功能</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• 剪贴板读取和写入</li>
                <li>• 文件传输</li>
                <li>• 文本同步</li>
                <li>• 图片同步</li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
                isLoading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  注册中...
                </div>
              ) : (
                '注册设备'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}