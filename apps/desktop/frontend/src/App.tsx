import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import Login from '@/components/Login';
import DeviceSetup from '@/components/DeviceSetup';
import Dashboard from '@/components/Dashboard';
import SettingsPage from '@/components/SettingsPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import ToastContainer from '@/components/ToastContainer';

export default function App() {
  const { isAuthenticated, currentDevice, user, validateToken, fetchDevices, clearStorage } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(window.location.hash.slice(1) || '/');

  useEffect(() => {
    const initializeApp = async () => {
      // 如果有token，验证其有效性
      if (isAuthenticated) {
        const tokenValid = await validateToken();
        
        // 如果token有效且有currentDevice，验证设备是否仍然存在
        if (tokenValid && currentDevice) {
          try {
            await fetchDevices();
            // fetchDevices会更新devices列表，如果currentDevice不在列表中，说明设备已被删除
            // 这种情况下需要清除currentDevice，让用户重新注册设备
          } catch (error) {
            console.warn('Failed to fetch devices, clearing current device:', error);
            // 如果获取设备列表失败，清除当前设备状态，让用户重新注册
            clearStorage();
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
  }, [validateToken]); // 移除isAuthenticated依赖，避免无限循环

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
