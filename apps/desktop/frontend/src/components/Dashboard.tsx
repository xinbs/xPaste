import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { useClipboardStore } from '@/store/clipboard';
import { useWebSocketStore } from '@/store/websocket';
import { Copy, Monitor, LogOut, Plus, Trash2, Upload, Play, Pause, X, RefreshCw, Edit2, Settings as SettingsIcon, Search, Type, Image as ImageIcon, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import FileUpload, { FilePreview } from '@/components/FileUpload';
import WebSocketStatus from '@/components/WebSocketStatus';
import WindowControls from '@/components/WindowControls';
import Settings from '@/components/Settings';

export default function Dashboard() {
  console.log('Dashboard: 组件开始渲染...');
  const [activeTab, setActiveTab] = useState<'clipboard' | 'quickadd' | 'devices' | 'settings'>('clipboard');
  const [newClipText, setNewClipText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'text' | 'image' | 'file'>('all');
  
  const { user, devices, currentDevice, logout, fetchDevices, renameDevice, deleteDevice, isAuthenticated, registerDevice } = useAuthStore();
  const { 
    items: clipItems, 
    fetchItems: fetchClipItems, 
    deleteItem: deleteClipItem,
    addItem,
    uploadFile,
    copyToClipboard,
    isLoading: clipboardLoading,
    error: clipError,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearError,
    hasMore,
    isLoadingMore,
    loadMoreItems 
  } = useClipboardStore();
  const { isConnected, connect, disconnect, onlineDevices } = useWebSocketStore();

  const clipboardScrollRef = useRef<HTMLDivElement | null>(null);
  const clipboardSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    console.log('Dashboard: useEffect 开始执行...');
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    const clipItemsController = new AbortController();
    const devicesController = new AbortController();

    // 监听来自托盘的 IPC 事件
    let handleToggleMonitoring: ((event: any, enabled: boolean) => void) | null = null;
    let handleSwitchTab: ((event: any, tab: string) => void) | null = null;
    
    if (window.electronAPI) {
      // 监听托盘的剪贴板监控切换
      handleToggleMonitoring = (event: any, enabled: boolean) => {
        if (enabled) {
          startMonitoring();
        } else {
          stopMonitoring();
        }
      };

      // 监听托盘的标签页切换
      handleSwitchTab = (event: any, tab: string) => {
        setActiveTab(tab as any);
      };

      // 添加事件监听器（如果 electronAPI 支持）
      if (typeof window.electronAPI.on === 'function') {
        window.electronAPI.on('toggle-clipboard-monitoring', handleToggleMonitoring);
        window.electronAPI.on('switch-to-tab', handleSwitchTab);
      }
    }
    
    const loadData = async () => {
      console.log('Dashboard: loadData 被调用 - isMounted:', isMounted);
      if (!isMounted) {
        console.log('Dashboard: 组件未挂载，跳过数据加载');
        return;
      }
      
      console.log('Dashboard: 开始并行加载数据...');
      // 并行加载数据，使用独立的AbortController
      const promises = [];
      
      if (isMounted && !clipItemsController.signal.aborted) {
        console.log('Dashboard: Starting to fetch clip items...');
        promises.push(
          fetchClipItems(clipItemsController.signal).then(() => {
            console.log('Dashboard: Clip items fetched successfully');
          }).catch(error => {
            if (error instanceof Error && error.name !== 'AbortError') {
              console.error('Failed to fetch clip items:', error);
            }
          })
        );
      }
      
      if (isMounted && !devicesController.signal.aborted) {
        promises.push(
          fetchDevices(devicesController.signal).catch(error => {
            if (error instanceof Error && error.name !== 'AbortError') {
              console.error('Failed to fetch devices:', error);
            }
          })
        );
      }
      
      await Promise.allSettled(promises);
    };
    
    console.log('Dashboard: 准备调用 loadData...');
    loadData();
    console.log('Dashboard: loadData 调用完成');
    
    // 默认启动剪贴板监听
    console.log('Dashboard: 检查剪贴板监听状态 - isMonitoring:', isMonitoring);
    if (!isMonitoring) {
      console.log('Dashboard: 启动剪贴板监听...');
      startMonitoring();
    } else {
      console.log('Dashboard: 剪贴板监听已启动');
    }
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      clipItemsController.abort();
      devicesController.abort();
      
      // 清理 IPC 事件监听器
      if (window.electronAPI && typeof window.electronAPI.removeListener === 'function') {
        if (handleToggleMonitoring) {
          window.electronAPI.removeListener('toggle-clipboard-monitoring', handleToggleMonitoring);
        }
        if (handleSwitchTab) {
          window.electronAPI.removeListener('switch-to-tab', handleSwitchTab);
        }
      }
    };
  }, []);

  // 无限滚动
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !clipboardLoading) {
          console.log('滚动到底部，加载更多...');
          loadMoreItems();
        }
      },
      { 
        root: clipboardScrollRef.current, // 在滚动容器内观察
        threshold: 1.0 
      }
    );

    const sentinel = clipboardSentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [hasMore, isLoadingMore, clipboardLoading, loadMoreItems]);

  const handleAddTextItem = async () => {
    if (!newClipText.trim()) return;
    
    const success = await addItem({
      type: 'text',
      content: newClipText.trim(),
      metadata: {
        source: 'manual',
      },
    });
    
    if (success) {
      setNewClipText('');
    }
  };

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    // TODO: 实现文件上传到服务器的逻辑
    // 这里需要后端支持文件上传API
    console.log('Selected file:', file);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    
    // TODO: 实现实际的文件上传
    const success = await addItem({
      type: selectedFile.type.startsWith('image/') ? 'image' : 'file',
      content: selectedFile.name,
      metadata: {
        source: 'file_upload',
        file_name: selectedFile.name,
        file_size: selectedFile.size,
        file_type: selectedFile.type,
      },
    });
    
    if (success) {
      setSelectedFile(null);
      setShowFileUpload(false);
    }
  };

  const handleCopyItem = async (content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      // 可以显示成功提示
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm('确定要删除这个剪贴板项吗？')) {
      await deleteClipItem(id);
    }
  };

  const toggleMonitoring = () => {
    if (isMonitoring) {
      stopMonitoring();
    } else {
      startMonitoring();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  // 过滤剪贴板项
  const filteredClipItems = clipItems.filter(item => {
    const matchesSearch = !searchQuery || 
      item.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.file_path?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    
    return matchesSearch && matchesType;
  });

  const renderClipboardTab = () => {
    return (
      <div className="h-full flex flex-col">
        {/* 紧凑的搜索和过滤栏 */}
        <div className="flex-shrink-0 p-2 border-b border-gray-200 bg-white">
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
              <input
                type="text"
                placeholder="搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">全部</option>
              <option value="text">文本</option>
              <option value="image">图片</option>
              <option value="file">文件</option>
            </select>
          </div>
        </div>

        {/* 错误提示 */}
        {clipError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <p className="text-red-700 text-sm">{clipError}</p>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* 主内容区域 */}
        <div ref={clipboardScrollRef} className="flex-1 overflow-y-auto p-1 scrollbar-thin">
          {clipboardLoading && filteredClipItems.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-1" />
                <p className="text-gray-500 text-xs">加载中...</p>
              </div>
            </div>
          ) : filteredClipItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm font-medium mb-1">暂无记录</p>
              <p className="text-xs text-center">{searchQuery || typeFilter !== 'all' ? '没有匹配的记录' : '开始监控或添加内容'}</p>
              {/* 调试信息 */}
              <p className="text-xs text-red-500 mt-2">
                总数: {clipItems.length}, 过滤后: {filteredClipItems.length}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
                {filteredClipItems.map((item) => (
                  <div key={item.id} className="bg-white rounded border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all duration-200 group">
                    <div className="p-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1 mb-1">
                            <div className="flex items-center space-x-1">
                              {item.type === 'text' && <Type className="w-3 h-3 text-blue-500" />}
                              {item.type === 'image' && <ImageIcon className="w-3 h-3 text-green-500" />}
                              {item.type === 'file' && <FileText className="w-3 h-3 text-purple-500" />}
                              <span className={cn(
                                "text-xs font-medium px-1.5 py-0.5 rounded-full",
                                item.type === 'text' ? "bg-blue-50 text-blue-700" :
                                item.type === 'image' ? "bg-green-50 text-green-700" :
                                "bg-purple-50 text-purple-700"
                              )}>
                                {item.type === 'text' ? '文本' : 
                                 item.type === 'image' ? '图片' : '文件'}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400 truncate">
                              {formatDate(item.created_at)}
                            </span>
                            {item.device_name && (
                              <span className="text-xs text-gray-500 truncate hidden sm:inline">
                                来自: {item.device_name}
                              </span>
                            )}
                          </div>
                          
                          {item.type === 'text' && (
                            <p className="text-xs text-gray-900 break-all line-clamp-2 leading-relaxed">
                              {item.content}
                            </p>
                          )}
                          
                          {item.type === 'image' && (
                            <div className="space-y-1">
                              {item.metadata?.size && (
                                <span className="text-xs text-gray-500">
                                  ({Math.round(item.metadata.size / 1024)}KB)
                                </span>
                              )}
                              {item.content && (
                                <div className="relative inline-block">
                                  <img 
                                    src={item.content} 
                                    alt="剪贴板图片" 
                                    className="max-w-full max-h-16 object-contain rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => {
                                      // 在新窗口中打开完整图片
                                      const newWindow = window.open();
                                      if (newWindow) {
                                        newWindow.document.write(`
                                          <html>
                                            <head><title>图片预览</title></head>
                                            <body style="margin:0;padding:20px;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh;">
                                              <img src="${item.content}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                            </body>
                                          </html>
                                        `);
                                      }
                                    }}
                                    title="点击查看完整图片"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          
                          {item.type === 'file' && (
                            <div className="flex items-center space-x-1">
                              <span className="text-xs text-gray-900 truncate italic">
                                {item.file_path || '文件内容'}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.type === 'text' && item.content && (
                            <button
                              onClick={() => handleCopyItem(item.content!)}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="复制到剪贴板"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                          {item.type === 'image' && item.content && (
                            <button
                              onClick={async () => {
                                try {
                                  // 将base64图片转换为Blob
                                  const response = await fetch(item.content!);
                                  const blob = await response.blob();
                                  
                                  // 复制图片到剪贴板
                                  await navigator.clipboard.write([
                                    new ClipboardItem({ [blob.type]: blob })
                                  ]);
                                  
                                  // 可以显示成功提示
                                  console.log('图片已复制到剪贴板');
                                } catch (error) {
                                  console.error('复制图片失败:', error);
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="复制图片"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {hasMore && <div ref={clipboardSentinelRef} style={{ height: "1px" }} />}

          {/* Loading indicator for pagination */}
          {clipboardLoading && filteredClipItems.length > 0 && (
             <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
             </div>
          )}
        </div>
      </div>
    );
  };

  const renderDevicesTab = () => {
    console.log('Rendering devices tab - devices:', devices);
    console.log('Rendering devices tab - onlineDevices:', onlineDevices);
    console.log('Current user:', user);
    console.log('Is authenticated:', isAuthenticated);
    console.log('Current device:', currentDevice);
    
    const isDeviceOnline = (deviceId: string) => {
      return onlineDevices.includes(deviceId);
    };

    const handleRefreshDevices = async () => {
      console.log('刷新设备列表被点击');
      console.log('当前设备数量:', devices.length);
      console.log('当前设备列表:', devices);
      await fetchDevices();
      console.log('刷新后设备数量:', devices.length);
    };

    const handleRegisterDevice = async () => {
      console.log('注册设备按钮被点击');
      try {
        console.log('开始导入设备相关模块...');
        const { getDeviceName, getDevicePlatform, getLocalIPAddress } = await import('../lib/device');
        const { getOrCreateDeviceId } = await import('../lib/device');
        const deviceId = getOrCreateDeviceId();
        console.log('设备ID:', deviceId);
        
        // 获取本机IP地址
        console.log('获取本机IP地址...');
        const localIP = await getLocalIPAddress();
        console.log('本机IP地址:', localIP);
        
        const deviceInfo = {
          device_id: deviceId,
          name: getDeviceName(),
          platform: getDevicePlatform(),
          version: '1.0.0',
          capabilities: {
            clipboard_read: true,
            clipboard_write: true,
            file_upload: true,
            image_ocr: false,
            notifications: true,
            websocket: true
          },
          private_ip: localIP || undefined
        };
        
        console.log('准备注册设备:', deviceInfo);
        const success = await registerDevice(deviceInfo);
        console.log('注册结果:', success);
        
        if (success) {
          console.log('注册成功，刷新设备列表...');
          await fetchDevices();
        } else {
          console.log('注册失败');
        }
      } catch (error) {
        console.error('注册设备时发生错误:', error);
      }
    };

    const handleRenameDevice = async (deviceId: string) => {
      if (!newDeviceName.trim()) return;
      
      const success = await renameDevice(deviceId, newDeviceName.trim());
      if (success) {
        setEditingDevice(null);
        setNewDeviceName('');
        await fetchDevices();
      }
    };

    const handleDeleteDevice = async (deviceId: string) => {
      if (confirm('确定要删除这个设备吗？此操作不可撤销。')) {
        const success = await deleteDevice(deviceId);
        if (success) {
          await fetchDevices();
        }
      }
    };

    const startEditDevice = (device: any) => {
      setEditingDevice(device.device_id);
      setNewDeviceName(device.name);
    };

    const cancelEditDevice = () => {
      setEditingDevice(null);
      setNewDeviceName('');
    };

    return (
      <div className="h-full flex flex-col">
        {/* 顶部控制栏 */}
        <div className="p-3 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-semibold text-gray-900">设备管理</h2>
              <div className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-xs text-gray-600">
                  {devices.length} 台设备
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleRefreshDevices}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
              >
                <RefreshCw className="w-3 h-3" />
                刷新设备
              </button>
              <button
                onClick={(e) => {
                  console.log('按钮点击事件触发', e);
                  e.preventDefault();
                  e.stopPropagation();
                  handleRegisterDevice();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
                type="button"
              >
                <Plus className="w-3 h-3" />
                注册当前设备
              </button>
            </div>
          </div>
          
          {/* 设备统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
              <div className="flex items-center">
                <div className="p-1.5 bg-blue-500 rounded-lg">
                  <Monitor className="w-4 h-4 text-white" />
                </div>
                <div className="ml-2">
                  <p className="text-xs font-medium text-blue-900">总设备数</p>
                  <p className="text-lg font-bold text-blue-700">{devices.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
              <div className="flex items-center">
                <div className="p-1.5 bg-green-500 rounded-lg">
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  </div>
                </div>
                <div className="ml-2">
                  <p className="text-xs font-medium text-green-900">在线设备</p>
                  <p className="text-lg font-bold text-green-700">{onlineDevices.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center">
                <div className="p-1.5 bg-gray-500 rounded-lg">
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full"></div>
                  </div>
                </div>
                <div className="ml-2">
                  <p className="text-xs font-medium text-gray-900">离线设备</p>
                  <p className="text-lg font-bold text-gray-700">{devices.length - onlineDevices.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 设备列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <div className="text-4xl mb-3">💻</div>
              <p className="text-base font-medium mb-1.5">暂无设备</p>
              <p className="text-xs">请先注册设备以开始使用</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {devices.map((device) => {
                const online = isDeviceOnline(device.device_id);
                return (
                  <div key={device.id} className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 group">
                    <div className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <div className={cn(
                              "p-2 rounded-lg",
                              online ? "bg-green-100" : "bg-gray-100"
                            )}>
                              <Monitor className={cn(
                                "w-4 h-4",
                                online ? "text-green-600" : "text-gray-400"
                              )} />
                            </div>
                            <div className={cn(
                              "absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white flex items-center justify-center",
                              online ? "bg-green-500" : "bg-gray-400"
                            )}>
                              <div className="w-1 h-1 bg-white rounded-full"></div>
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              {editingDevice === device.device_id ? (
                                <div className="flex items-center space-x-1.5">
                                  <input
                                    type="text"
                                    value={newDeviceName}
                                    onChange={(e) => setNewDeviceName(e.target.value)}
                                    className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        handleRenameDevice(device.device_id);
                                      } else if (e.key === 'Escape') {
                                        cancelEditDevice();
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleRenameDevice(device.device_id)}
                                    className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                                    title="确认"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={cancelEditDevice}
                                    className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                    title="取消"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <h4 className="text-sm font-semibold text-gray-900">{device.name}</h4>
                                  {device.is_current && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      当前设备
                                    </span>
                                  )}
                                  <span className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                    online 
                                      ? "bg-green-100 text-green-800" 
                                      : "bg-gray-100 text-gray-800"
                                  )}>
                                    {online ? '在线' : '离线'}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
                              <span>{device.platform}</span>
                              <span>•</span>
                              <span>{device.version}</span>
                              <span>•</span>
                              <span>最后活跃: {formatDate(device.last_seen)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(device.capabilities)
                                .filter(([_, enabled]) => enabled)
                                .map(([cap, _]) => (
                                <span
                                  key={cap}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                                >
                                  {cap.replace('_', ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!device.is_current && editingDevice !== device.device_id && (
                            <>
                              <button
                                onClick={() => startEditDevice(device)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="重命名设备"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteDevice(device.device_id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="删除设备"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQuickAddTab = () => {
    return (
      <div className="p-3">
        <div className="border-b border-gray-200 pb-2 mb-3">
          <h2 className="text-lg font-bold text-gray-900">快速添加</h2>
          <p className="text-gray-600 mt-0.5 text-sm">手动添加文本和文件到剪贴板</p>
        </div>

        {/* 错误提示 */}
        {clipError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between">
              <p className="text-red-700 text-sm">{clipError}</p>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* 文本添加区域 */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
          <h3 className="text-base font-semibold text-gray-900 mb-2 flex items-center">
            <Type className="w-4 h-4 mr-1.5" />
            添加文本
          </h3>
          <div className="space-y-3">
            <textarea
              value={newClipText}
              onChange={(e) => setNewClipText(e.target.value)}
              placeholder="输入要添加到剪贴板的文本内容..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
              rows={4}
            />
            <div className="flex justify-end">
              <button
                onClick={handleAddTextItem}
                disabled={!newClipText.trim()}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
              >
                添加到剪贴板
              </button>
            </div>
          </div>
        </div>

        {/* 文件上传区域 */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <h3 className="text-base font-semibold text-gray-900 mb-2 flex items-center">
            <Upload className="w-4 h-4 mr-1.5" />
            上传文件
          </h3>
          <div className="space-y-3">
            {!selectedFile ? (
              <FileUpload onFileSelect={handleFileSelect} />
            ) : (
              <div className="space-y-2">
                <FilePreview 
                  file={selectedFile} 
                  onRemove={() => setSelectedFile(null)} 
                />
                <div className="flex space-x-2">
                  <button
                    onClick={handleFileUpload}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                  >
                    确认上传
                  </button>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="px-4 py-1.5 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSettingsTab = () => {
    return <Settings />;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 紧凑的顶部标签导航 - 整个区域可拖动 */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-2 py-1 app-region-drag pt-7">
        <div className="flex items-center justify-between">
          {/* 左侧：标签导航 + 监控状态 - 禁用拖动以便交互 */}
          <div className="flex items-center space-x-3 flex-1 min-w-0 app-region-no-drag">
            <nav className="flex space-x-1 overflow-x-auto scrollbar-hide">
              {[
                { key: 'clipboard', label: '历史', icon: Copy, shortLabel: '历史' },
                { key: 'quickadd', label: '添加', icon: Plus, shortLabel: '添加' },
                { key: 'devices', label: '设备', icon: Monitor, shortLabel: '设备' },
                { key: 'settings', label: '设置', icon: SettingsIcon, shortLabel: '设置' },
              ].map(({ key, label, icon: Icon, shortLabel }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as any)}
                  className={cn(
                    "flex items-center space-x-1 py-1.5 px-2 rounded-md font-medium text-xs transition-all duration-200 whitespace-nowrap flex-shrink-0",
                    activeTab === key
                      ? "bg-blue-100 text-blue-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                  title={label}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{shortLabel}</span>
                </button>
              ))}
            </nav>
            
            {/* 监控状态 - 只在剪贴板标签页显示，紧凑设计 */}
            {activeTab === 'clipboard' && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={toggleMonitoring}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-medium flex items-center space-x-1 transition-colors",
                    isMonitoring 
                      ? "bg-green-100 text-green-700 hover:bg-green-200" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                  title={isMonitoring ? '点击停止监控' : '点击开始监控'}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isMonitoring ? "bg-green-500" : "bg-gray-400"
                  )} />
                  <span className="hidden sm:inline">{isMonitoring ? '监控' : '停止'}</span>
                  {isMonitoring ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              </div>
            )}
          </div>
          
          {/* 右侧状态和用户信息 + 窗口控制 - 禁用拖动以便交互 */}
          <div className="flex items-center space-x-2 ml-2 flex-shrink-0 app-region-no-drag">
            <WebSocketStatus />
            <div className="hidden md:flex items-center space-x-2">
              <span className="text-xs text-gray-600 truncate max-w-20" title={user?.username}>
                {user?.username}
              </span>
              <button
                onClick={logout}
                className="inline-flex items-center px-1.5 py-1 text-xs font-medium rounded text-red-600 hover:bg-red-50 transition-colors"
                title="退出登录"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
            {/* 移动端简化版 */}
            <div className="md:hidden">
              <button
                onClick={logout}
                className="inline-flex items-center p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            
            {/* 窗口控制按钮 - 仅在生产模式显示 */}
            <WindowControls className="ml-2 pl-2 border-l border-gray-200" />
          </div>
        </div>
      </div>

      {/* 主内容区域 - 占满剩余空间 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'clipboard' && renderClipboardTab()}
        {activeTab === 'quickadd' && renderQuickAddTab()}
        {activeTab === 'devices' && renderDevicesTab()}
        {activeTab === 'settings' && (
          <div className="h-full overflow-y-auto scrollbar-thin">
            {renderSettingsTab()}
          </div>
        )}
      </div>
    </div>
  );
}