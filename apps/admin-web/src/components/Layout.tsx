import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()

  const menuItems = [
    { path: '/dashboard', label: '仪表盘', icon: '📊' },
    { path: '/users', label: '用户管理', icon: '👥' },
    { path: '/devices', label: '设备管理', icon: '📱' },
    { path: '/clipboard', label: '剪贴板管理', icon: '📋' },
    { path: '/monitoring', label: '系统监控', icon: '📈' }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* 顶部导航栏 */}
      <nav className="bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200/50 sticky top-0 z-50">
        <div className="w-full px-2 sm:px-4">
          <div className="flex justify-between h-12">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  xPaste 管理后台
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-medium">{user?.username?.charAt(0).toUpperCase()}</span>
                </div>
                <div className="hidden md:block">
                  <p className="text-xs font-medium text-gray-900">欢迎回来</p>
                  <p className="text-xs text-gray-500">{user?.username}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all duration-200 hover:scale-105"
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* 侧边栏 */}
        <aside className="w-48 lg:w-56 xl:w-64 bg-white/80 backdrop-blur-sm shadow-xl border-r border-gray-200/50 flex-shrink-0">
          <div className="p-4">
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">导航菜单</h2>
              <div className="w-8 h-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"></div>
            </div>
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group flex items-center px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                    location.pathname === item.path
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md transform scale-105'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:transform hover:scale-102'
                  }`}
                >
                  <span className={`text-sm mr-3 transition-transform duration-200 ${
                    location.pathname === item.path ? 'transform scale-110' : 'group-hover:transform group-hover:scale-110'
                  }`}>
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.label}</span>
                  {location.pathname === item.path && (
                    <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* 主内容区域 */}
        <main className="flex-1 p-2 sm:p-4 overflow-auto min-w-0">
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout