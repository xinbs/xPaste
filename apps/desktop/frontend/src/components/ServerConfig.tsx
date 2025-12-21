import { useState } from 'react';
import { useConfigStore } from '@/store/config';
import { useToastStore } from '@/store/toast';
import { cn } from '@/lib/utils';
import { Settings, Check, X, RefreshCw } from 'lucide-react';

interface ServerConfigProps {
  onConfigured?: () => void;
  onCancel?: () => void;
}

export default function ServerConfig({ onConfigured, onCancel }: ServerConfigProps) {
  const { serverConfig, setServerConfig } = useConfigStore();
  const { showSuccess, showError } = useToastStore();
  
  const [formData, setFormData] = useState({
    baseUrl: serverConfig.baseUrl,
    wsUrl: serverConfig.wsUrl,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setTestResult(null); // 清除之前的测试结果
  };

  const testConnection = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    try {
      // 临时创建一个API客户端来测试连接
      const testUrl = `${formData.baseUrl}/health`;
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5秒超时
      });
      
      if (response.ok) {
        setTestResult({ success: true, message: '连接成功！服务器响应正常。' });
      } else {
        setTestResult({ success: false, message: `连接失败：HTTP ${response.status}` });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '连接失败';
      setTestResult({ success: false, message: `连接失败：${errorMessage}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    // 验证URL格式
    try {
      new URL(formData.baseUrl);
      new URL(formData.wsUrl);
    } catch {
      showError('配置错误', '请输入有效的URL地址');
      return;
    }

    // 保存配置
    setServerConfig({
      baseUrl: formData.baseUrl.replace(/\/$/, ''), // 移除末尾的斜杠
      wsUrl: formData.wsUrl.replace(/\/$/, ''),
    });
    
    showSuccess('配置已保存', '服务器地址配置已更新');
    onConfigured?.();
  };

  const handleReset = () => {
    setFormData({
      baseUrl: 'http://localhost:8080',
      wsUrl: 'ws://localhost:8080',
    });
    setTestResult(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <Settings className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            服务器配置
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            请配置 xPaste 同步服务器地址
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700">
                服务器地址
              </label>
              <input
                id="baseUrl"
                name="baseUrl"
                type="url"
                required
                value={formData.baseUrl}
                onChange={handleInputChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="http://localhost:8080"
              />
              <p className="mt-1 text-xs text-gray-500">
                例如：http://localhost:8080 或 https://your-server.com
              </p>
            </div>
            
            <div>
              <label htmlFor="wsUrl" className="block text-sm font-medium text-gray-700">
                WebSocket 地址
              </label>
              <input
                id="wsUrl"
                name="wsUrl"
                type="url"
                required
                value={formData.wsUrl}
                onChange={handleInputChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="ws://localhost:8080"
              />
              <p className="mt-1 text-xs text-gray-500">
                例如：ws://localhost:8080 或 wss://your-server.com
              </p>
            </div>
          </div>

          {/* 测试连接按钮 */}
          <div>
            <button
              type="button"
              onClick={testConnection}
              disabled={isLoading || !formData.baseUrl}
              className={cn(
                "w-full flex justify-center items-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
                isLoading
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              )}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  测试连接中...
                </>
              ) : (
                '测试连接'
              )}
            </button>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div className={cn(
              "p-3 rounded-md border",
              testResult.success
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            )}>
              <div className="flex items-center">
                {testResult.success ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <X className="w-4 h-4 mr-2" />
                )}
                {testResult.message}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              重置为默认
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              保存配置
            </button>
          </div>

          {/* 取消按钮 */}
          {onCancel && (
            <div>
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-2 px-4 text-sm font-medium text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
