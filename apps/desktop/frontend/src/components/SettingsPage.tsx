import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import SettingsComponent from './Settings';
import { LogOut } from 'lucide-react';

export default function SettingsPage() {
  const { user, logout } = useAuthStore();

  useEffect(() => {
    // 设置页面标题
    document.title = 'xPaste 设置';
    
    return () => {
      // 恢复默认标题
      document.title = 'xPaste';
    };
  }, []);

  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) {
      logout();
      // 关闭设置窗口
      window.close();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">xPaste 设置</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">当前用户: {user?.username}</span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 设置内容 */}
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <SettingsComponent />
        </div>
      </div>
    </div>
  );
}