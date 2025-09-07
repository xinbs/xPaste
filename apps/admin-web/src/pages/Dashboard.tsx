import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../utils/api'
import type { DashboardStats } from '../types'

const Dashboard: React.FC = () => {
  const { data: stats, isLoading, error, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/api/v1/stats')
      return response.data.data // 解析后端返回的数据结构
    },
    staleTime: 30000, // 30秒内不重新获取
    cacheTime: 300000, // 缓存5分钟
    retry: 2
  })

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="mb-8">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-gray-200 rounded-lg mr-4"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-6 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-600 text-lg">加载失败</div>
        <button 
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          重新加载
        </button>
      </div>
    )
  }

  const statCards = [
    {
      title: '总用户数',
      value: stats?.totalUsers || 0,
      icon: '👥',
      color: 'bg-blue-500'
    },
    {
      title: '活跃设备',
      value: stats?.activeDevices || 0,
      icon: '📱',
      color: 'bg-green-500'
    },
    {
      title: '总剪贴板',
      value: stats?.totalClipboards || 0,
      icon: '📋',
      color: 'bg-purple-500'
    },
    {
      title: '今日剪贴板',
      value: stats?.todayClipboards || 0,
      icon: '📊',
      color: 'bg-orange-500'
    }
  ]

  return (
    <div className="w-full">
      {/* 页面头部 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              仪表盘
            </h1>
            <p className="mt-0.5 text-gray-600 text-sm">系统概览和关键指标</p>
          </div>
          <div className="flex items-center space-x-4">
            <button className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新数据
            </button>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((card, index) => (
          <div key={index} className="bg-white/80 backdrop-blur-sm rounded-lg shadow-sm p-4 hover:shadow-md transition-all duration-300 hover:transform hover:scale-105 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{card.title}</p>
                <p className="text-lg font-bold text-gray-900 mb-0.5">{card.value.toLocaleString()}</p>
                <div className="flex items-center text-xs text-green-600">
                  <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>较上月增长</span>
                </div>
              </div>
              <div className={`${card.color} rounded-lg p-2 shadow-sm`}>
                <span className="text-white text-lg">{card.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 主要内容区域 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* 快速操作 */}
        <div className="xl:col-span-2">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">快速操作</h3>
              <div className="w-8 h-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <button className="group p-3 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-md transition-all duration-300 hover:shadow-md hover:transform hover:scale-105">
                <div className="flex items-center mb-2">
                  <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center mr-2 group-hover:scale-110 transition-transform">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-blue-900">用户管理</span>
                </div>
                <p className="text-xs text-blue-700 text-left">查看和管理系统用户</p>
              </button>
              
              <button className="group p-3 bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 rounded-md transition-all duration-300 hover:shadow-md hover:transform hover:scale-105">
                <div className="flex items-center mb-2">
                  <div className="w-6 h-6 bg-green-600 rounded-md flex items-center justify-center mr-2 group-hover:scale-110 transition-transform">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-green-900">设备监控</span>
                </div>
                <p className="text-xs text-green-700 text-left">实时监控设备状态</p>
              </button>
              
              <button className="group p-3 bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 rounded-md transition-all duration-300 hover:shadow-md hover:transform hover:scale-105">
                <div className="flex items-center mb-2">
                  <div className="w-6 h-6 bg-purple-600 rounded-md flex items-center justify-center mr-2 group-hover:scale-110 transition-transform">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-purple-900">系统日志</span>
                </div>
                <p className="text-xs text-purple-700 text-left">查看系统运行日志</p>
              </button>
            </div>
          </div>
        </div>

        {/* 系统状态 */}
        <div className="xl:col-span-1">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">系统状态</h3>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-green-50 rounded-md">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-gray-700">API 服务</span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                  正常运行
                </span>
              </div>
              
              <div className="flex items-center justify-between p-2 bg-green-50 rounded-md">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-gray-700">数据库</span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                  连接正常
                </span>
              </div>
              
              <div className="flex items-center justify-between p-2 bg-green-50 rounded-md">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-gray-700">同步服务</span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                  同步中
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard