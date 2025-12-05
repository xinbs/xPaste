import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

interface ClipboardItem {
  id: string
  content: string
  type: 'text' | 'image' | 'file'
  userId: string
  username: string
  deviceId: string
  deviceName: string
  size: number
  createdAt: string
  syncedAt: string
  isDeleted: boolean
  tags: string[]
}

interface ClipboardResponse {
  data: ClipboardItem[]
  pagination: {
    page: number
    limit: number
    total: number
  }
}

const ClipboardManagement: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [filterType, setFilterType] = useState<'all' | 'text' | 'image' | 'file'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'deleted'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [tempSearchTerm, setTempSearchTerm] = useState('')
  // 新增筛选状态
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [tempFilterUserId, setTempFilterUserId] = useState('')

  const [selectedItem, setSelectedItem] = useState<ClipboardItem | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // 新增：删除确认模态框状态
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [selectedDeleteId, setSelectedDeleteId] = useState<string | null>(null)
  const [deleteActionType, setDeleteActionType] = useState<'single' | 'batch' | 'clear' | null>(null)

  const queryClient = useQueryClient()

  const { data: clipboardData, isLoading, isFetching, error } = useQuery<ClipboardResponse>({
    queryKey: ['clipboard-items', currentPage, pageSize, filterType, searchTerm, startDate, endDate, filterUserId],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString()
      })
      if (filterType !== 'all') {
        params.append('type', filterType)
      }
      if (searchTerm) {
        params.append('search', searchTerm)
      }
      if (startDate) {
        params.append('start_date', new Date(startDate).toISOString())
      }
      if (endDate) {
        // 结束日期设为当天的最后一刻
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        params.append('end_date', end.toISOString())
      }
      if (filterUserId) {
        params.append('user_id', filterUserId)
      }

      const response = await api.get(`/api/v1/clipboard/?${params}`)
      return response.data
    },
    enabled: isAuthenticated,
    placeholderData: (previousData) => previousData // 保持之前的数据，避免 loading 状态导致页面闪烁
  })

  // 新增：按类型的全量计数，仅获取 total（使用 limit=1 减少开销）
  const { data: textCountData } = useQuery<ClipboardResponse>({
    queryKey: ['clipboard-count', 'text'],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '1', type: 'text' })
      const response = await api.get(`/api/v1/clipboard/?${params}`)
      return response.data
    },
    enabled: isAuthenticated
  })
  const { data: imageCountData } = useQuery<ClipboardResponse>({
    queryKey: ['clipboard-count', 'image'],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '1', type: 'image' })
      const response = await api.get(`/api/v1/clipboard/?${params}`)
      return response.data
    },
    enabled: isAuthenticated
  })
  const clipboardItems = clipboardData?.data || []
  const totalItems = clipboardData?.pagination?.total || 0
  const totalPages = Math.ceil(totalItems / pageSize)

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/api/v1/clipboard/${itemId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clipboard-items'] })
      setSelectedItems([])
    }
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      await api.post('/api/v1/clipboard/batch-delete', { clipboardIds: itemIds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clipboard-items', currentPage, pageSize, filterType] })
      setSelectedItems([])
    }
  })

  const restoreItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await api.post(`/api/v1/clipboard/${itemId}/restore`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clipboard-items'] })
    }
  })

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/clipboard/clear-all')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clipboard-items'] })
      setSelectedItems([])
    }
  })

  const handleDeleteItem = (itemId: string) => {
    // 使用自定义模态框进行确认，避免部分环境下 window.confirm 行为异常
    setSelectedDeleteId(itemId)
    setDeleteActionType('single')
    setIsDeleteConfirmOpen(true)
  }

  const handleRestoreItem = (itemId: string) => {
    restoreItemMutation.mutate(itemId)
  }

  const handleBatchDelete = () => {
    if (selectedItems.length === 0) return
    setDeleteActionType('batch')
    setIsDeleteConfirmOpen(true)
  }

  const handleClearAll = () => {
    setDeleteActionType('clear')
    setIsDeleteConfirmOpen(true)
  }

  const handleDatePreset = (days: number) => {
    const end = new Date()
    const start = new Date()
    
    if (days === 1) {
      // 24小时：从当前时间往前推24小时
      start.setTime(end.getTime() - 24 * 60 * 60 * 1000)
    } else {
      // 天数：从今天往前推N天，时间设为0点
      start.setDate(end.getDate() - days)
      start.setHours(0, 0, 0, 0)
    }

    setStartDate(start.toISOString().split('T')[0])
    setEndDate(end.toISOString().split('T')[0])
  }

  const handleSearch = () => {
    setCurrentPage(1)
    setSearchTerm(tempSearchTerm)
    setFilterUserId(tempFilterUserId)
    queryClient.invalidateQueries({ queryKey: ['clipboard-items'] })
  }

  const handleReset = () => {
    setSearchTerm('')
    setTempSearchTerm('')
    setFilterUserId('')
    setTempFilterUserId('')
    setStartDate('')
    setEndDate('')
    setFilterType('all')
    setFilterStatus('all')
    setCurrentPage(1)
  }


  const handleSelectItem = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  const handleSelectAll = () => {
    if (selectedItems.length === filteredItems?.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(filteredItems?.map(item => item.id) || [])
    }
  }

  const handleViewDetail = (item: ClipboardItem) => {
    setSelectedItem(item)
    setIsDetailModalOpen(true)
  }

  const filteredItems = clipboardItems?.filter(item => {
    // 后端已处理类型和搜索过滤，前端只处理状态过滤（如果需要）
    // 注意：如果后端不返回已删除的项，这里的 'deleted' 状态可能永远无法匹配到数据
    // 除非后端接口支持返回已删除数据
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && !item.isDeleted) ||
      (filterStatus === 'deleted' && item.isDeleted)
    
    return matchesStatus
  })

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
      case 'image': return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
      case 'file': return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
      default: return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'text': return 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-700/10'
      case 'image': return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
      case 'file': return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20'
      default: return 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/10'
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const truncateContent = (content: string, maxLength: number = 100) => {
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content
  }

  if (isLoading && !clipboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">剪贴板管理</h1>
        <p className="mt-2 text-gray-600">管理用户剪贴板内容和同步记录</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">总项目数</p>
              <p className="text-2xl font-semibold text-gray-900">{totalItems}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">文本项目</p>
              <p className="text-2xl font-semibold text-gray-900">
                {textCountData?.pagination?.total ?? 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">图片项目</p>
              <p className="text-2xl font-semibold text-gray-900">
                {imageCountData?.pagination?.total ?? 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">总存储</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatSize(clipboardItems?.reduce((sum, item) => sum + item.size, 0) || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 剪贴板列表 */}
      <div className="bg-white shadow rounded-lg relative">
        {isFetching && clipboardData && (
          <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col space-y-4">
            {/* 顶部操作栏：标题和批量操作 */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">剪贴板项目</h3>
              <div className="flex items-center space-x-2">
                 {/* 批量操作 */}
                {selectedItems.length > 0 && (
                  <button
                    onClick={handleBatchDelete}
                    disabled={batchDeleteMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    删除选中 ({selectedItems.length})
                  </button>
                )}
                
                {/* 清空所有 */}
                <button
                  onClick={handleClearAll}
                  disabled={clearAllMutation.isPending}
                  className="px-4 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  清空所有
                </button>
              </div>
            </div>

            {/* 筛选工具栏 */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* 搜索框 */}
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="搜索内容..."
                    value={tempSearchTerm}
                    onChange={(e) => setTempSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 用户ID筛选 */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="用户ID"
                    value={tempFilterUserId}
                    onChange={(e) => setTempFilterUserId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 日期范围 */}
                <div className="flex items-center space-x-2 bg-gray-50 p-1 rounded-md border border-gray-200">
                   <input 
                      type="date" 
                      value={startDate} 
                      onChange={e => setStartDate(e.target.value)} 
                      className="px-2 py-1 text-sm border-none bg-transparent focus:ring-0" 
                      title="开始日期"
                   />
                   <span className="text-gray-500">-</span>
                   <input 
                      type="date" 
                      value={endDate} 
                      onChange={e => setEndDate(e.target.value)} 
                      className="px-2 py-1 text-sm border-none bg-transparent focus:ring-0" 
                      title="结束日期"
                   />
                </div>
                
                {/* 类型筛选 */}
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">全部类型</option>
                  <option value="text">文本</option>
                  <option value="image">图片</option>
                  <option value="file">文件</option>
                </select>
                
                {/* 状态筛选 */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">全部状态</option>
                  <option value="active">正常</option>
                  <option value="deleted">已删除</option>
                </select>

                {/* 重置按钮 */}
                <button
                  onClick={handleReset}
                  className="px-3 py-2 text-gray-600 hover:text-gray-800 text-sm transition-colors"
                >
                  重置
                </button>
                
                {/* 每页显示数量 */}
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ml-auto"
                >
                  <option value={10}>10条/页</option>
                  <option value={20}>20条/页</option>
                  <option value={50}>50条/页</option>
                  <option value={100}>100条/页</option>
                </select>

                {/* 搜索按钮 - 移到最右边 */}
                <button
                  onClick={handleSearch}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                >
                  搜索
                </button>
              </div>

              {/* 快速时间筛选 */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">快速筛选：</span>
                {[
                  { label: '24小时', value: 1 },
                  { label: '3天', value: 3 },
                  { label: '7天', value: 7 },
                  { label: '30天', value: 30 },
                  { label: '60天', value: 60 },
                  { label: '90天', value: 90 },
                  { label: '半年', value: 180 },
                  { label: '一年', value: 365 },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handleDatePreset(preset.value)}
                    className="px-2 py-1 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
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
                    checked={selectedItems.length === filteredItems?.length && filteredItems.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  内容
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  设备
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  大小
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems?.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={() => handleSelectItem(item.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-xs">
                      <div className="text-sm font-medium text-gray-900 truncate" title={item.type === 'text' ? item.content : ''}>
                        {item.type === 'text' ? truncateContent(item.content) : `[${item.type?.toUpperCase() || 'UNKNOWN'}]`}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="mr-2">{getTypeIcon(item.type || 'unknown')}</span>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        getTypeColor(item.type || 'unknown')
                      }`}>
                        {item.type || 'unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.deviceName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatSize(item.size)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.isDeleted ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {item.isDeleted ? '已删除' : '正常'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleViewDetail(item)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-1 hover:bg-blue-50 rounded"
                        title="查看详情"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      {item.isDeleted ? (
                        <button
                          onClick={() => handleRestoreItem(item.id)}
                          className="text-gray-400 hover:text-green-600 transition-colors p-1 hover:bg-green-50 rounded"
                          title="恢复"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1 hover:bg-red-50 rounded"
                          title="删除"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-2">加载中...</span>
                      </div>
                    ) : error ? (
                      <div className="text-red-500">
                        加载失败，请检查网络连接或重新登录
                      </div>
                    ) : searchTerm || filterType !== 'all' || filterStatus !== 'all' ? '没有找到匹配的项目' : '暂无剪贴板数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  显示第 <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> 到{' '}
                  <span className="font-medium">{Math.min(currentPage * pageSize, totalItems)}</span> 条，
                  共 <span className="font-medium">{totalItems}</span> 条记录
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 详情模态框 */}
      {isDetailModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">剪贴板项目详情</h3>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
                  <div className="flex items-center">
                    <span className="mr-2">{getTypeIcon(selectedItem.type || 'unknown')}</span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      getTypeColor(selectedItem.type || 'unknown')
                    }`}>
                      {selectedItem.type || 'unknown'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">大小</label>
                  <p className="text-sm text-gray-900">{formatSize(selectedItem.size)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">用户</label>
                  <p className="text-sm text-gray-900">{selectedItem.username}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">设备</label>
                  <p className="text-sm text-gray-900">{selectedItem.deviceName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">创建时间</label>
                  <p className="text-sm text-gray-900">{new Date(selectedItem.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">同步时间</label>
                  <p className="text-sm text-gray-900">{new Date(selectedItem.syncedAt).toLocaleString()}</p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                <div className="border border-gray-300 rounded-md p-3 bg-gray-50 max-h-64 overflow-y-auto">
                  {selectedItem.type === 'text' ? (
                    <pre className="text-sm text-gray-900 whitespace-pre-wrap">{selectedItem.content}</pre>
                  ) : selectedItem.type === 'image' ? (
                    <div className="text-center">
                      <img 
                        src={selectedItem.content} 
                        alt="剪贴板图片" 
                        className="max-w-full max-h-48 mx-auto"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                          ;(e.target as HTMLImageElement).nextElementSibling!.textContent = '图片加载失败'
                        }}
                      />
                      <p className="text-sm text-gray-500 mt-2">图片预览</p>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      <p>文件类型: {selectedItem.type || 'unknown'}</p>
                      <p className="text-xs mt-1">无法预览此类型的内容</p>
                    </div>
                  )}
                </div>
              </div>
              
              {selectedItem.tags && selectedItem.tags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.tags.map((tag, index) => (
                      <span key={index} className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 删除确认模态框（根层） */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-600 mb-4">
              {deleteActionType === 'batch'
                ? `确定要删除选中的 ${selectedItems.length} 个项目吗？`
                : deleteActionType === 'clear'
                ? '确定要清空所有剪贴板项目吗？此操作将删除所有项目。'
                : '确定要删除此剪贴板项目吗？'}
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false)
                  setSelectedDeleteId(null)
                  setDeleteActionType(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteActionType === 'single') {
                    if (!selectedDeleteId) return
                    deleteItemMutation.mutate(selectedDeleteId)
                  } else if (deleteActionType === 'batch') {
                    if (selectedItems.length === 0) return
                    batchDeleteMutation.mutate(selectedItems)
                  } else if (deleteActionType === 'clear') {
                    clearAllMutation.mutate()
                  }
                  setIsDeleteConfirmOpen(false)
                  setSelectedDeleteId(null)
                  setDeleteActionType(null)
                }}
                disabled={
                  deleteActionType === 'single'
                    ? deleteItemMutation.isPending
                    : deleteActionType === 'batch'
                    ? batchDeleteMutation.isPending
                    : deleteActionType === 'clear'
                    ? clearAllMutation.isPending
                    : false
                }
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClipboardManagement