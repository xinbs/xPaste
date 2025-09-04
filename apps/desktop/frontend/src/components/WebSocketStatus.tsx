import { useEffect } from 'react';
import { useWebSocketStore } from '@/store/websocket';
import { useAuthStore } from '@/store/auth';
import { Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WebSocketStatus() {
  const { 
    isConnected, 
    isConnecting, 
    error, 
    reconnectAttempts, 
    maxReconnectAttempts,
    connect, 
    disconnect, 
    clearError,
    resetReconnectAttempts 
  } = useWebSocketStore();
  
  const { isAuthenticated, currentDevice } = useAuthStore();

  // 自动连接
  useEffect(() => {
    if (isAuthenticated && currentDevice && !isConnected && !isConnecting) {
      // 添加延迟确保认证状态稳定
      const timer = setTimeout(() => {
        connect();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, currentDevice, isConnected, isConnecting, connect]);

  // 登出时断开连接
  useEffect(() => {
    if (!isAuthenticated) {
      disconnect();
    }
  }, [isAuthenticated, disconnect]);

  const handleReconnect = () => {
    clearError();
    resetReconnectAttempts();
    connect();
  };

  const getStatusColor = () => {
    if (error) return 'text-red-500';
    if (isConnected) return 'text-green-500';
    if (isConnecting) return 'text-yellow-500';
    return 'text-gray-400';
  };

  const getStatusText = () => {
    if (error) return '连接错误';
    if (isConnected) return '实时同步';
    if (isConnecting) return '连接中...';
    return '未连接';
  };

  const getStatusIcon = () => {
    if (error) return AlertCircle;
    if (isConnected) return Wifi;
    if (isConnecting) return RefreshCw;
    return WifiOff;
  };

  const StatusIcon = getStatusIcon();

  return (
    <div className="flex items-center space-x-1 text-xs">
      <StatusIcon 
        className={cn(
          "w-3.5 h-3.5",
          getStatusColor(),
          isConnecting && "animate-spin"
        )} 
      />
      <span className={cn("hidden sm:inline", getStatusColor())}>
        {getStatusText()}
      </span>
      
      {error && (
        <button
          onClick={handleReconnect}
          className="text-xs text-blue-500 hover:text-blue-700 ml-1"
          title={`连接错误: ${error} (${reconnectAttempts}/${maxReconnectAttempts})`}
        >
          重试
        </button>
      )}
    </div>
  );
}