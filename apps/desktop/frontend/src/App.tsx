import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import Login from '@/components/Login';
import DeviceSetup from '@/components/DeviceSetup';
import Dashboard from '@/components/Dashboard';
import ErrorBoundary from '@/components/ErrorBoundary';
import ToastContainer from '@/components/ToastContainer';

export default function App() {
  const { isAuthenticated, currentDevice, user } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // 应用初始化完成
    setIsInitialized(true);
  }, []);

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

    // 未登录状态
    if (!isAuthenticated || !user) {
      return <Login onSuccess={() => {}} />;
    }

    // 已登录但未注册设备
    if (!currentDevice) {
      return <DeviceSetup onComplete={() => {}} />;
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
