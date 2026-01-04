import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { useToastStore } from '@/store/toast';
import apiClient from '@/lib/api';
import Login from '@/components/Login';
import DeviceSetup from '@/components/DeviceSetup';
import Dashboard from '@/components/Dashboard';
import SettingsPage from '@/components/SettingsPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import ToastContainer from '@/components/ToastContainer';

export default function App() {
  const { isAuthenticated, currentDevice, user } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(window.location.hash.slice(1) || '/');
  const isFirstRun = useRef(true);

  useEffect(() => {
    // 设置API客户端的未授权回调
    apiClient.setUnauthorizedHandler(() => {
      console.log('检测到Token失效，自动登出');
      useAuthStore.getState().logout();
      useToastStore.getState().showWarning('会话已过期', '请重新登录');
    });

    const initializeApp = async () => {
      // 仅在首次加载时执行初始化检查
      if (!isFirstRun.current) return;
      isFirstRun.current = false;

      const tryGetMainToken = async (): Promise<string | null> => {
        if (!window.electronAPI?.getAuthToken) return null;
        try {
          const res = await window.electronAPI.getAuthToken();
          const token = typeof res?.token === 'string' ? res.token : null;
          return token && token.trim().length > 0 ? token.trim() : null;
        } catch {
          return null;
        }
      };

      const mainToken = await tryGetMainToken();
      const storeToken = useAuthStore.getState().token;

      if (storeToken && mainToken && storeToken !== mainToken) {
        const ok = await useAuthStore.getState().validateToken();
        if (!ok) {
          useAuthStore.setState({ token: mainToken, refreshToken: null });
        }
      } else if (!storeToken && mainToken) {
        useAuthStore.setState({ token: mainToken, refreshToken: null });
      }

      if (useAuthStore.getState().token) {
        console.log('应用启动，验证Token有效性...');
        const tokenValid = await useAuthStore.getState().validateToken();
        
        // 如果token有效且有currentDevice，验证设备是否仍然存在
        if (tokenValid && useAuthStore.getState().currentDevice) {
          try {
            await useAuthStore.getState().fetchDevices();
          } catch (error) {
            console.warn('Failed to fetch devices, clearing current device:', error);
            useAuthStore.getState().clearStorage();
          }
        }
      }
      
      // 应用初始化完成
      setIsInitialized(true);
    };
    
    initializeApp();
    
    // 监听路由变化
    const handleHashChange = () => {
      setCurrentRoute(window.location.hash.slice(1) || '/');
    };
    
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []); // 空依赖数组，确保只执行一次

  const renderContent = () => {
    if (!isInitialized) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">正在加载...</p>
          </div>
        </div>
      );
    }

    // 设置页面路由 - 独立显示，不需要检查登录状态
    if (currentRoute === '/settings') {
      // 如果未登录，显示登录页面
      if (!isAuthenticated || !user) {
        return <Login onSuccess={() => {}} />;
      }
      return <SettingsPage />;
    }

    // 主应用路由
    // 未登录状态
    if (!isAuthenticated || !user) {
      return <Login onSuccess={() => {}} />;
    }

    // 已登录但未注册设备
    if (!currentDevice) {
      return <DeviceSetup onComplete={() => {
        // 设备注册成功后，强制重新渲染
        window.location.reload();
      }} />;
    }

    // 已登录且已注册设备，显示主界面
    return <Dashboard />;
  };

  return (
    <ErrorBoundary>
      {renderContent()}
      <ToastContainer />
    </ErrorBoundary>
  );
}
