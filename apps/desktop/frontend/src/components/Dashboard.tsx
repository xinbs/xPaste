import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useClipboardStore } from '@/store/clipboard';
import { useWebSocketStore } from '@/store/websocket';
import { Copy, Monitor, LogOut, Plus, Trash2, Upload, Play, Pause, X, RefreshCw, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import FileUpload, { FilePreview } from '@/components/FileUpload';
import WebSocketStatus from '@/components/WebSocketStatus';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'clipboard' | 'devices'>('clipboard');
  const [newClipText, setNewClipText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  
  const { user, devices, currentDevice, logout, fetchDevices, renameDevice, deleteDevice } = useAuthStore();
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
    clearError 
  } = useClipboardStore();
  const { isConnected, connect, disconnect, onlineDevices } = useWebSocketStore();

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    const clipItemsController = new AbortController();
    const devicesController = new AbortController();
    
    const loadData = async () => {
      // 添加小延迟避免与App.tsx中的初始化请求冲突
      await new Promise(resolve => {
        timeoutId = setTimeout(resolve, 100);
      });
      
      if (!isMounted) return;
      
      // 并行加载数据，使用独立的AbortController
      const promises = [];
      
      if (isMounted && !clipItemsController.signal.aborted) {
        promises.push(
          fetchClipItems(clipItemsController.signal).catch(error => {
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
    
    loadData();
    
    // 默认启动剪贴板监听
    if (!isMonitoring) {
      startMonitoring();
    }
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      clipItemsController.abort();
      devicesController.abort();
    };
  }, []);

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
      content_type: selectedFile.type.startsWith('image/') ? 'image' : 'file',
      file_path: selectedFile.name,
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

  const renderClipboardTab = () => (
    <div className="space-y-4">
      {/* 剪贴板监控控制 */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isMonitoring ? "bg-green-500" : "bg-gray-400"
            )} />
            <span className="text-sm text-gray-600">
              剪贴板监控: {isMonitoring ? '运行中' : '已停止'}
            </span>
          </div>
          <button
            onClick={toggleMonitoring}
            className={cn(
              "px-3 py-1 rounded-md text-sm flex items-center space-x-2",
              isMonitoring 
                ? "bg-red-100 text-red-700 hover:bg-red-200" 
                : "bg-green-100 text-green-700 hover:bg-green-200"
            )}
          >
            {isMonitoring ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isMonitoring ? '停止' : '开始'}
          </button>
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

      {/* 添加新项 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">添加剪贴板项</h3>
        <div className="space-y-3">
          <div className="flex space-x-2">
            <textarea
              value={newClipText}
              onChange={(e) => setNewClipText(e.target.value)}
              placeholder="输入要同步的文本内容..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
            <button
              onClick={handleAddTextItem}
              disabled={!newClipText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>添加文本</span>
            </button>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFileUpload(!showFileUpload)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>上传文件</span>
            </button>
          </div>
          
          {/* 文件上传区域 */}
          {showFileUpload && (
            <div className="border-t pt-3">
              {!selectedFile ? (
                <FileUpload onFileSelect={handleFileSelect} />
              ) : (
                <div className="space-y-3">
                  <FilePreview 
                    file={selectedFile} 
                    onRemove={() => setSelectedFile(null)} 
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleFileUpload}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      确认上传
                    </button>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setShowFileUpload(false);
                      }}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 剪贴板历史 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">剪贴板历史</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {clipboardLoading ? (
            <div className="p-4 text-center text-gray-500">加载中...</div>
          ) : clipItems.length === 0 ? (
            <div className="p-4 text-center text-gray-500">暂无剪贴板历史</div>
          ) : (
            clipItems.map((item) => (
              <div key={item.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {item.type}
                      </span>
                      {item.device_name && (
                        <span className="text-xs text-gray-500">
                          来自: {item.device_name}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-900 break-words">
                      {item.type === 'text' ? (
                        <p>{item.content}</p>
                      ) : item.type === 'image' ? (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-600">图片预览:</span>
                            {item.metadata?.size && (
                              <span className="text-xs text-gray-500">
                                ({Math.round(item.metadata.size / 1024)}KB)
                              </span>
                            )}
                          </div>
                          {item.content && (
                            <div className="relative inline-block">
                              <img 
                                src={item.content} 
                                alt="剪贴板图片" 
                                className="max-w-xs max-h-32 rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
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
                      ) : (
                        <p className="italic text-gray-500">
                          {item.file_path || '文件内容'}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {item.type === 'text' && item.content && (
                      <button
                        onClick={() => handleCopyItem(item.content!)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="复制文本"
                      >
                        <Copy className="w-4 h-4" />
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
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="复制图片"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderDevicesTab = () => {
    const { onlineDevices } = useWebSocketStore();
    
    const isDeviceOnline = (deviceId: string) => {
      return onlineDevices.includes(deviceId);
    };

    const handleRefreshDevices = async () => {
      await fetchDevices();
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
      setEditingDevice(device.id);
      setNewDeviceName(device.name);
    };

    const cancelEditDevice = () => {
      setEditingDevice(null);
      setNewDeviceName('');
    };

    return (
      <div className="space-y-6">
        {/* 设备统计 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">设备管理</h3>
              <button
                onClick={handleRefreshDevices}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                刷新
              </button>
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-center">
                  <Monitor className="w-5 h-5 text-blue-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-blue-900">总设备数</p>
                    <p className="text-lg font-semibold text-blue-600">{devices.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-green-900">在线设备</p>
                    <p className="text-lg font-semibold text-green-600">{onlineDevices.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 bg-gray-400 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">离线设备</p>
                    <p className="text-lg font-semibold text-gray-600">{devices.length - onlineDevices.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 设备列表 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200">
            <h4 className="text-md font-medium text-gray-900">设备列表</h4>
          </div>
          <div className="divide-y divide-gray-200">
            {devices.length === 0 ? (
              <div className="p-8 text-center">
                <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-sm">暂无设备</p>
                <p className="text-gray-400 text-xs mt-1">请先注册设备以开始使用</p>
              </div>
            ) : (
              devices.map((device) => {
                const online = isDeviceOnline(device.id);
                return (
                  <div key={device.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <Monitor className={cn(
                            "w-8 h-8",
                            online ? "text-green-500" : "text-gray-400"
                          )} />
                          <div className={cn(
                            "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                            online ? "bg-green-500" : "bg-gray-400"
                          )}></div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            {editingDevice === device.id ? (
                              <div className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={newDeviceName}
                                  onChange={(e) => setNewDeviceName(e.target.value)}
                                  className="text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      handleRenameDevice(device.id);
                                    } else if (e.key === 'Escape') {
                                      cancelEditDevice();
                                    }
                                  }}
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleRenameDevice(device.id)}
                                  className="text-green-600 hover:text-green-800"
                                  title="确认"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={cancelEditDevice}
                                  className="text-gray-600 hover:text-gray-800"
                                  title="取消"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <p className="text-sm font-medium text-gray-900">
                                {device.name}
                              </p>
                            )}
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
                              {online ? "在线" : "离线"}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>{device.platform}</span>
                            <span>•</span>
                            <span>{device.version}</span>
                            <span>•</span>
                            <span>最后活跃: {formatDate(device.last_seen)}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
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
                      <div className="flex items-center space-x-2">
                        {!device.is_current && editingDevice !== device.id && (
                          <>
                            <button
                              onClick={() => startEditDevice(device)}
                              className="inline-flex items-center px-2 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                              title="重命名设备"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteDevice(device.id)}
                              className="inline-flex items-center px-2 py-1 border border-red-300 shadow-sm text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              title="删除设备"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };



  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">xPaste</h1>
            </div>
            <div className="flex items-center space-x-4">
              <WebSocketStatus />
              <span className="text-sm text-gray-700">欢迎, {user?.username}</span>
              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* 标签页导航 */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {[
                { key: 'clipboard', label: '剪贴板', icon: Copy },
                { key: 'devices', label: '设备', icon: Monitor },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as any)}
                  className={cn(
                    "flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm",
                    activeTab === key
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* 标签页内容 */}
          {activeTab === 'clipboard' && renderClipboardTab()}
          {activeTab === 'devices' && renderDevicesTab()}
        </div>
      </div>
    </div>
  );
}