import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../utils/api'

interface Device {
  id: string
  deviceId: string
  deviceName: string
  deviceType: string
  platform: string
  version: string
  userId: string
  username: string
  isOnline: boolean
  lastActiveAt: string
  createdAt: string
  ipAddress: string    // 原始IP地址（兼容性保留）
  publicIP: string     // 公网IP地址
  privateIP: string    // 内网IP地址
  ipType: string       // IP类型：public/private
  userAgent: string
}

const DeviceManagement: React.FC = () => {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const queryClient = useQueryClient()

  const { data: devices, isLoading, error } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: async () => {
      const response = await api.get('/api/v1/devices/')
      return response.data.data
    }
  })

  const disconnectDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      await api.post(`/api/v1/devices/${deviceId}/disconnect`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    }
  })

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      await api.delete(`/api/v1/devices/${deviceId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    }
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async (deviceIds: string[]) => {
      await api.post('/api/v1/devices/batch-delete', { deviceIds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setSelectedDevices([])
    }
  })

  const handleDisconnectDevice = (deviceId: string) => {
    if (window.confirm('确定要断开此设备连接吗？')) {
      disconnectDeviceMutation.mutate(deviceId)
    }
  }

  const handleDeleteDevice = (deviceId: string) => {
    if (window.confirm('确定要删除此设备吗？此操作不可恢复。')) {
      deleteDeviceMutation.mutate(deviceId)
    }
  }

  const handleBatchDelete = () => {
    if (selectedDevices.length === 0) return
    if (window.confirm(`确定要删除选中的 ${selectedDevices.length} 个设备吗？此操作不可恢复。`)) {
      batchDeleteMutation.mutate(selectedDevices)
    }
  }

  const handleSelectDevice = (deviceId: string) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    )
  }

  const handleSelectAll = () => {
    if (selectedDevices.length === filteredDevices?.length) {
      setSelectedDevices([])
    } else {
      setSelectedDevices(filteredDevices?.map(device => device.id) || [])
    }
  }

  const filteredDevices = devices?.filter(device => {
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'online' && device.isOnline) ||
      (filterStatus === 'offline' && !device.isOnline)
    
    const matchesSearch = searchTerm === '' ||
      device.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.platform && device.platform.toLowerCase().includes(searchTerm.toLowerCase()))
    
    return matchesStatus && matchesSearch
  })

  const getStatusColor = (isOnline: boolean) => {
    return isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  }

  const getPlatformIcon = (platform: string) => {
    if (!platform) return '💻'
    switch (platform.toLowerCase()) {
      case 'windows': return '🖥️'
      case 'macos': return '🍎'
      case 'linux': return '🐧'
      case 'android': return '📱'
      case 'ios': return '📱'
      default: return '💻'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">设备管理</h1>
        <p className="mt-2 text-gray-600">管理用户设备和连接状态</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold">📱</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">总设备数</p>
              <p className="text-2xl font-semibold text-gray-900">{devices?.length || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-semibold">🟢</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">在线设备</p>
              <p className="text-2xl font-semibold text-gray-900">
                {devices?.filter(d => d.isOnline).length || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-red-600 font-semibold">🔴</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">离线设备</p>
              <p className="text-2xl font-semibold text-gray-900">
                {devices?.filter(d => !d.isOnline).length || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-semibold">👥</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">活跃用户</p>
              <p className="text-2xl font-semibold text-gray-900">
                {new Set(devices?.map(d => d.userId)).size || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 设备列表 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">设备列表</h3>
            <div className="flex items-center space-x-4">
              {/* 搜索框 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索设备名称、用户或平台..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* 状态筛选 */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全部状态</option>
                <option value="online">在线</option>
                <option value="offline">离线</option>
              </select>
              
              {/* 批量操作 */}
              {selectedDevices.length > 0 && (
                <button
                  onClick={handleBatchDelete}
                  disabled={batchDeleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  删除选中 ({selectedDevices.length})
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedDevices.length === filteredDevices?.length && filteredDevices.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  设备信息
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  平台
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  最后活跃
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP地址
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDevices?.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedDevices.includes(device.id)}
                      onChange={() => handleSelectDevice(device.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{device.deviceName}</div>
                      <div className="text-sm text-gray-500">{device.deviceId}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {device.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="mr-2">{getPlatformIcon(device.platform)}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{device.platform}</div>
                        <div className="text-sm text-gray-500">v{device.version}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      getStatusColor(device.isOnline)
                    }`}>
                      {device.isOnline ? '在线' : '离线'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(device.lastActiveAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="space-y-1">
                      {device.publicIP && (
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            公网
                          </span>
                          <span>{device.publicIP}</span>
                        </div>
                      )}
                      {device.privateIP && (
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                            内网
                          </span>
                          <span>{device.privateIP}</span>
                        </div>
                      )}
                      {!device.publicIP && !device.privateIP && device.ipAddress && (
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                            未知
                          </span>
                          <span>{device.ipAddress}</span>
                        </div>
                      )}
                      {!device.publicIP && !device.privateIP && !device.ipAddress && (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {device.isOnline && (
                        <button
                          onClick={() => handleDisconnectDevice(device.id)}
                          className="text-orange-600 hover:text-orange-900 transition-colors"
                        >
                          断开
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteDevice(device.id)}
                        className="text-red-600 hover:text-red-900 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-2">加载中...</span>
                      </div>
                    ) : error ? (
                      <div className="text-red-500">
                        加载失败，请检查网络连接或重新登录
                      </div>
                    ) : searchTerm || filterStatus !== 'all' ? '没有找到匹配的设备' : '暂无设备数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default DeviceManagement