import { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WindowControlsProps {
  className?: string;
}

export default function WindowControls({ className }: WindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    // 检查是否在 Electron 环境中
    if (window.electronAPI && typeof window.electronAPI.isDevelopment === 'function') {
      window.electronAPI.isDevelopment().then(setIsDevelopment);
      window.electronAPI.getPlatform().then(setPlatform);
      
      // 检查窗口是否已最大化
      window.electronAPI.isWindowMaximized().then(setIsMaximized);
      
      // 监听窗口状态变化
      window.electronAPI.onWindowMaximized(() => setIsMaximized(true));
      window.electronAPI.onWindowUnmaximized(() => setIsMaximized(false));
      
      return () => {
        window.electronAPI.removeAllListeners('window-maximized');
        window.electronAPI.removeAllListeners('window-unmaximized');
      };
    } else {
      // 如果不在 Electron 环境中，设置为开发模式（浏览器环境）
      setIsDevelopment(true);
    }
  }, []);

  // 如果是开发模式或者是 Windows 生产模式（使用 titleBarOverlay），不显示自定义控制按钮
  if (isDevelopment || (!isDevelopment && platform === 'win32')) {
    return null;
  }

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    if (isMaximized) {
      window.electronAPI?.unmaximizeWindow();
    } else {
      window.electronAPI?.maximizeWindow();
    }
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  return (
    <div className={cn(
      "flex items-center space-x-0.5 app-region-no-drag",
      className
    )}>
      {/* 最小化按钮 */}
      <button
        onClick={handleMinimize}
        className="w-6 h-5 flex items-center justify-center hover:bg-gray-200 transition-colors rounded-sm group"
        title="最小化"
      >
        <Minus className="w-3 h-3 text-gray-600 group-hover:text-gray-800" />
      </button>
      
      {/* 最大化/还原按钮 */}
      <button
        onClick={handleMaximize}
        className="w-6 h-5 flex items-center justify-center hover:bg-gray-200 transition-colors rounded-sm group"
        title={isMaximized ? "还原" : "最大化"}
      >
        {isMaximized ? (
          <Minimize2 className="w-3 h-3 text-gray-600 group-hover:text-gray-800" />
        ) : (
          <Maximize2 className="w-3 h-3 text-gray-600 group-hover:text-gray-800" />
        )}
      </button>
      
      {/* 关闭按钮 */}
      <button
        onClick={handleClose}
        className="w-6 h-5 flex items-center justify-center hover:bg-red-500 transition-colors rounded-sm group"
        title="关闭"
      >
        <X className="w-3 h-3 text-gray-600 group-hover:text-white" />
      </button>
    </div>
  );
}
