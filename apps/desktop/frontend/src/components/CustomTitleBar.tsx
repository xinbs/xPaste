import { useState, useEffect } from 'react';
import WindowControls from './WindowControls';
import { cn } from '@/lib/utils';

interface CustomTitleBarProps {
  title?: string;
  className?: string;
}

export default function CustomTitleBar({ title = "xPaste", className }: CustomTitleBarProps) {
  const [isDevelopment, setIsDevelopment] = useState(false);

  useEffect(() => {
    // 检查是否在 Electron 环境中
    if (window.electronAPI && typeof window.electronAPI.isDevelopment === 'function') {
      window.electronAPI.isDevelopment().then(setIsDevelopment);
    } else {
      // 如果不在 Electron 环境中，设置为开发模式（浏览器环境）
      setIsDevelopment(true);
    }
  }, []);

  // 生产模式下完全不显示自定义标题栏
  return null;
}
