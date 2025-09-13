import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, syncApi } from '../utils/api'
import type { ApiResponse, SyncApiHealth, WSConnectionStats } from '../types'

const StatusDot: React.FC<{ ok: boolean; className?: string }> = ({ ok, className }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'} ${className || ''}`}></span>
)

const Card: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
  <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-100 p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {extra}
    </div>
    {children}
  </div>
)

const SystemMonitoring: React.FC = () => {
  // admin-api 健康（简单 /health，无鉴权）
  const adminHealth = useQuery<{ status: string; service: string }>({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const res = await api.get('/health')
      return res.data
    },
    staleTime: 15000,
    retry: 1
  })

  // admin-api 仪表盘统计（已存在类型与用法）
  const adminStats = useQuery<any>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stats')
      return res.data.data
    },
    staleTime: 30000,
    retry: 1
  })

  // sync-api 健康（/health，OptionalAuth 可无 token）
  const syncHealth = useQuery<SyncApiHealth>({
    queryKey: ['sync-health'],
    queryFn: async () => {
      const res = await syncApi.get('/health')
      return res.data
    },
    staleTime: 15000,
    retry: 1
  })

  // sync-api WS 连接统计（/ws/stats，返回包裹在 models.Response.data 中）
  const wsStats = useQuery<WSConnectionStats>({
    queryKey: ['ws-stats'],
    queryFn: async () => {
      const res = await syncApi.get<ApiResponse<WSConnectionStats>>('/ws/stats')
      return res.data.data as WSConnectionStats
    },
    staleTime: 15000,
    retry: 1
  })

  const onRefresh = () => {
    adminHealth.refetch()
    adminStats.refetch()
    syncHealth.refetch()
    wsStats.refetch()
  }

  const services = syncHealth.data?.services
  const wsSummary = wsStats.data

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">系统监控</h1>
          <p className="mt-1 text-gray-600 text-sm">监控系统运行状态和性能指标</p>
        </div>
        <button onClick={onRefresh} className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="服务健康">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 rounded bg-gray-50">
              <div className="flex items-center gap-2">
                <StatusDot ok={adminHealth.data?.status === 'ok'} />
                <span className="text-sm text-gray-700">Admin API</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${adminHealth.isLoading ? 'bg-gray-100 text-gray-700' : adminHealth.error ? 'bg-red-100 text-red-700' : (adminHealth.data?.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}`}>
                {adminHealth.isLoading ? '加载中' : adminHealth.error ? '错误' : (adminHealth.data?.status || 'unknown')}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-gray-50">
              <div className="flex items-center gap-2">
                <StatusDot ok={syncHealth.data?.status === 'ok'} />
                <span className="text-sm text-gray-700">Sync API</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${syncHealth.isLoading ? 'bg-gray-100 text-gray-700' : syncHealth.error ? 'bg-red-100 text-red-700' : (syncHealth.data?.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}`}>
                {syncHealth.isLoading ? '加载中' : syncHealth.error ? '错误' : (syncHealth.data?.status || 'unknown')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-white border">
                <div className="text-xs text-gray-500 mb-1">数据库</div>
                <div className="flex items-center gap-2">
                  <StatusDot ok={services?.database === 'ok'} />
                  <span className="text-sm">{services?.database || (syncHealth.isLoading ? '加载中' : syncHealth.error ? '错误' : 'unknown')}</span>
                </div>
              </div>
              <div className="p-2 rounded bg-white border">
                <div className="text-xs text-gray-500 mb-1">WebSocket</div>
                <div className="flex items-center gap-2">
                  <StatusDot ok={services?.websocket === 'ok'} />
                  <span className="text-sm">{services?.websocket || (syncHealth.isLoading ? '加载中' : syncHealth.error ? '错误' : 'unknown')}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="WebSocket 连接统计" extra={
          <span className="text-xs text-gray-500">更新时间: {wsStats.isLoading ? '加载中' : wsStats.error ? '-' : (wsSummary?.timestamp ? new Date(wsSummary.timestamp * 1000).toLocaleTimeString() : '-')}</span>
        }>
          {wsStats.isLoading ? (
            <div className="p-3 text-sm text-gray-500">加载中...</div>
          ) : wsStats.error ? (
            <div className="p-3 text-sm text-red-600">加载失败</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded bg-gray-50">
                <div className="text-xs text-gray-500">总连接数</div>
                <div className="text-xl font-bold text-gray-900">{wsSummary?.total_connections ?? 0}</div>
              </div>
              <div className="col-span-2 p-3 rounded bg-gray-50">
                <div className="text-xs text-gray-500 mb-1">按用户统计</div>
                {wsSummary && wsSummary.connections_by_user && Object.keys(wsSummary.connections_by_user).length > 0 ? (
                  <div className="max-h-32 overflow-auto space-y-1">
                    {Object.entries(wsSummary.connections_by_user).map(([userId, count]) => (
                      <div key={userId} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">用户 {userId}</span>
                        <span className="font-medium">{count as number}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">暂无连接</div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="运行时信息">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500">Sync API 版本</div>
              <div className="font-medium text-gray-900">{syncHealth.isLoading ? '加载中' : syncHealth.error ? '错误' : (syncHealth.data?.version || '-')}</div>
            </div>
            <div>
              <div className="text-gray-500">Admin API 服务</div>
              <div className="font-medium text-gray-900">{adminHealth.isLoading ? '加载中' : adminHealth.error ? '错误' : (adminHealth.data?.service || '-')}</div>
            </div>
            <div>
              <div className="text-gray-500">健康时间戳</div>
              <div className="font-medium text-gray-900">{syncHealth.isLoading ? '加载中' : syncHealth.error ? '错误' : (syncHealth.data?.timestamp ? new Date(syncHealth.data.timestamp as any).toLocaleString() : '-')}</div>
            </div>
            <div>
              <div className="text-gray-500">状态</div>
              <div className="font-medium text-gray-900">{syncHealth.isLoading ? '加载中' : syncHealth.error ? '错误' : (syncHealth.data?.status || '-')}</div>
            </div>
          </div>
        </Card>

        <Card title="快速操作">
          <div className="flex flex-wrap gap-2">
            <button onClick={onRefresh} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">立即刷新</button>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default SystemMonitoring