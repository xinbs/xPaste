import { create } from 'zustand';
import apiClient from '@/lib/api';
import { useWebSocketStore } from './websocket';
import { useToastStore } from './toast';

export interface ClipItem {
  id: string;
  type: string;
  content?: string;
  file_path?: string;
  metadata?: unknown;
  created_at: string;
  updated_at: string;
  device_id: string;
  device_name?: string;
}

interface ClipboardState {
  items: ClipItem[];
  isLoading: boolean;
  error: string | null;
  isMonitoring: boolean;
  
  // Pagination
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoadingMore: boolean;

  // Actions
  fetchItems: (signal?: AbortSignal) => Promise<void>;
  loadMoreItems: () => Promise<void>;
  addItem: (item: Omit<ClipItem, 'id' | 'created_at' | 'updated_at' | 'device_id'>) => Promise<boolean>;
  deleteItem: (id: string) => Promise<boolean>;
  copyToClipboard: (content: string) => Promise<boolean>;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  clearError: () => void;
  uploadFile: (file: File) => Promise<boolean>;
  broadcastClipboardChange: (data: unknown) => void;
  handleRemoteClipboardUpdate: (data: unknown) => void;
}

// 剪贴板监控相关
let monitoringInterval: NodeJS.Timeout | null = null;
let lastClipboardContent = '';
let lastClipboardImageHash = '';
let clipboardIpcHandler: ((event: unknown, data: unknown) => void) | null = null;
let lastClipboardFileHash = '';
let lastFileAt = 0;
const FILE_DUP_TTL_MS = 8000;

export const useClipboardStore = create<ClipboardState>()((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  isMonitoring: false,
  page: 1,
  pageSize: 20, // 每页加载20条
  hasMore: true,
  isLoadingMore: false,

  fetchItems: async (signal?: AbortSignal) => {
    set({ isLoading: true, error: null, page: 1, hasMore: true });
    console.log('剪贴板Store: 开始获取第一页剪贴板历史...');
    
    try {
      const response = await apiClient.getClipItems<ClipItem>(
        { page: 1, pageSize: get().pageSize },
        signal
      );
      
      if (response.success) {
        const items = response.data.items || [];
        set({ 
          items, 
          isLoading: false, 
          page: 1,
          hasMore: items.length === get().pageSize,
        });
      } else {
        set({ error: response.message, isLoading: false, hasMore: false });
        useToastStore.getState().showError('获取剪贴板历史失败', response.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取剪贴板历史失败';
      
      // 在React严格模式下，组件会重新挂载，导致之前的请求被取消。
      // 这种取消是预期的，不应被视为错误。
      if (error instanceof Error && (error.name === 'AbortError' || errorMessage.includes('请求超时或被取消'))) {
        console.log('剪贴板Store: 获取剪贴板的请求被取消，这在开发模式下是正常行为。');
        set({ isLoading: false }); // 确保UI状态正确
        return;
      }
      
      set({ error: errorMessage, isLoading: false, hasMore: false });
      
      // 仅在没有数据时显示错误
      if (get().items.length === 0) {
        useToastStore.getState().showError('获取剪贴板历史失败', errorMessage);
      }
    }
  },

  loadMoreItems: async () => {
    const { isLoading, isLoadingMore, hasMore, page, pageSize } = get();
    if (isLoading || isLoadingMore || !hasMore) {
      return;
    }

    set({ isLoadingMore: true });
    const nextPage = page + 1;
    console.log(`剪贴板Store: 开始加载第 ${nextPage} 页...`);

    try {
      const controller = new AbortController();
      const response = await apiClient.getClipItems<ClipItem>(
        { 
          page: nextPage, 
          pageSize: pageSize 
        },
        controller.signal
      );

      if (response.success) {
        const newItems = response.data.items || [];
        set((state) => ({
          items: [...state.items, ...newItems],
          page: nextPage,
          hasMore: newItems.length === state.pageSize,
          isLoadingMore: false,
        }));
      } else {
        set({ error: response.message, isLoadingMore: false, hasMore: false });
        // 加载更多失败时，不一定要弹窗，可以在UI上给提示
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载更多失败';
      set({ error: errorMessage, isLoadingMore: false, hasMore: false });
    }
  },

  addItem: async (itemData) => {
    set({ error: null });
    try {
      const baseMeta = (itemData.metadata && typeof itemData.metadata === 'object') ? (itemData.metadata as Record<string, unknown>) : {}
      const response = await apiClient.createClipItem<ClipItem>({
        type: itemData.type,
        content: itemData.content,
        file_path: itemData.file_path,
        metadata: {
          ...baseMeta,
          timestamp: new Date().toISOString(),
        },
      });
      
      if (response.success) {
          // 重新获取列表以确保数据同步
          try {
            await get().fetchItems();
          } catch (fetchError) {
            // 如果重新获取失败，不影响添加操作的成功状态
            console.warn('Failed to refresh items after adding:', fetchError);
          }
          
          // 广播到其他设备
          get().broadcastClipboardChange(response.data);
          
          return true;
      } else {
        set({ error: response.message });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '添加剪贴板项失败';
      set({ error: errorMessage });
      useToastStore.getState().showError('添加剪贴板项失败', errorMessage);
      return false;
    }
  },

  deleteItem: async (id: string) => {
    set({ error: null });
    try {
      const response = await apiClient.deleteClipItem(id);
      if (response.success) {
        const currentItems = get().items;
        set({ items: currentItems.filter(item => String(item.id) !== String(id)) });
        return true;
      } else {
        set({ error: response.message });
        useToastStore.getState().showError('删除剪贴板项失败', response.message);
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除剪贴板项失败';
      set({ error: errorMessage });
      useToastStore.getState().showError('删除剪贴板项失败', errorMessage);
      return false;
    }
  },

  copyToClipboard: async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      set({ error: '复制到剪贴板失败' });
      useToastStore.getState().showError('复制失败', '无法复制到剪贴板');
      return false;
    }
  },

  startMonitoring: () => {
    if (get().isMonitoring) return;
    
    set({ isMonitoring: true });

    // 1. Electron 环境：使用 IPC 监听主进程消息 (支持后台监控)
    if (window.electronAPI) {
      console.log('启动 Electron IPC 剪贴板监控');
      
      // 清理旧的监听器（如果有）
      if (clipboardIpcHandler) {
        window.electronAPI.removeListener('clipboard-changed', clipboardIpcHandler);
      }

      // 定义新的监听处理函数
      clipboardIpcHandler = (_event: unknown, data: unknown) => {
        const payload = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {}
        const payloadType = typeof payload.type === 'string' ? payload.type : ''
        const payloadContent = typeof payload.content === 'string' ? payload.content : ''
        const savedByMain = payload.savedByMain === true

        console.log('收到主进程剪贴板更新:', payloadType);
        
        // 如果主进程已经保存了数据，我们只需要刷新列表
        if (savedByMain) {
            if (window.electronAPI && window.electronAPI.log) {
              window.electronAPI.log('主进程已保存数据，前端仅刷新列表');
            }
            // 更新本地状态以避免重复添加
            if (payloadType === 'text') {
                lastClipboardContent = payloadContent;
                lastClipboardImageHash = '';
            } else if (payloadType === 'image') {
                lastClipboardImageHash = payloadContent;
                lastClipboardContent = '';
            } else if (payloadType === 'file') {
                lastClipboardFileHash = payloadContent || '';
                lastClipboardContent = '';
                lastClipboardImageHash = '';
            }
            
            get().fetchItems();
            return;
        }

        if (window.electronAPI && window.electronAPI.log) {
          window.electronAPI.log('收到剪贴板 IPC 消息', { type: payloadType, contentLength: payloadContent.length });
        }
        
        if (payloadType === 'text') {
          // 文本去重检查
          if (payloadContent && payloadContent !== lastClipboardContent) {
            lastClipboardContent = payloadContent;
            lastClipboardImageHash = ''; // 清除图片状态
            
            if (window.electronAPI && window.electronAPI.log) {
              window.electronAPI.log('准备添加文本记录', { content: payloadContent.substring(0, 20) + '...' });
            }

            get().addItem({
              type: 'text',
              content: payloadContent,
              metadata: {
                source: 'electron_monitor',
                auto_detected: true,
              },
            }).then(success => {
               if (window.electronAPI && window.electronAPI.log) {
                 window.electronAPI.log('添加文本记录结果', { success });
               }
            }).catch(err => {
               if (window.electronAPI && window.electronAPI.log) {
                 window.electronAPI.log('添加文本记录失败', { error: err.message });
               }
               console.error(err);
            });
          } else {
             if (window.electronAPI && window.electronAPI.log) {
               window.electronAPI.log('文本内容重复，跳过');
             }
          }
        } else if (payloadType === 'image') {
          // 图片去重检查 (data.content 是 DataURL)
          if (payloadContent && payloadContent !== lastClipboardImageHash) {
            lastClipboardImageHash = payloadContent;
            lastClipboardContent = ''; // 清除文本状态
            
            if (window.electronAPI && window.electronAPI.log) {
              window.electronAPI.log('准备添加图片记录');
            }
            
            get().addItem({
              type: 'image',
              content: payloadContent, // DataURL
              metadata: {
                source: 'electron_monitor',
                auto_detected: true,
                mime_type: 'image/png', // 主进程通过 toDataURL 返回的一般是 png
              },
            }).then(success => {
               if (window.electronAPI && window.electronAPI.log) {
                 window.electronAPI.log('添加图片记录结果', { success });
               }
            }).catch(err => {
               if (window.electronAPI && window.electronAPI.log) {
                 window.electronAPI.log('添加图片记录失败', { error: err.message });
               }
               console.error(err);
            });
          }
        } else if (payloadType === 'file') {
          const now = Date.now();
          const content = payloadContent || '';
          if (content && (content !== lastClipboardFileHash || now - lastFileAt > FILE_DUP_TTL_MS)) {
            lastClipboardFileHash = content;
            lastFileAt = now;
            lastClipboardContent = '';
            lastClipboardImageHash = '';
            let paths: string[] = [];
            try {
              const parsed = JSON.parse(content);
              if (parsed && Array.isArray(parsed.paths)) paths = parsed.paths;
            } catch { void 0 }
            get().addItem({
              type: 'file',
              content,
              file_path: paths[0] || '',
              metadata: {
                source: 'electron_monitor',
                auto_detected: true,
              },
            }).catch(err => {
              if (window.electronAPI && window.electronAPI.log) {
                window.electronAPI.log('添加文件记录失败', { error: err.message });
              }
            });
          }
        }
      };

      // 注册监听
      window.electronAPI.on('clipboard-changed', clipboardIpcHandler);
      return;
    }

    // 2. Web 环境：使用轮询 (原有逻辑)
    if (monitoringInterval) clearInterval(monitoringInterval);
    monitoringInterval = setInterval(async () => {
      try {
        // 尝试读取剪贴板项目（现代浏览器 API）
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
          // 检查文本内容
          if (clipboardItem.types.includes('text/plain')) {
            const blob = await clipboardItem.getType('text/plain');
            const text = await blob.text();
            
            if (text && text !== lastClipboardContent) {
              lastClipboardContent = text;
              
              const success = await get().addItem({
                type: 'text',
                content: text,
                metadata: {
                  source: 'auto_monitor',
                  auto_detected: true,
                },
              });
              
              if (!success) {
                console.warn('自动添加文本剪贴板内容失败');
              }
            }
          }
          
          // 检查图片内容
          const imageTypes = clipboardItem.types.filter(type => type.startsWith('image/'));
          if (imageTypes.length > 0) {
            const imageType = imageTypes[0];
            const imageBlob = await clipboardItem.getType(imageType);
            
            // 生成图片的简单哈希来检测变化
            const arrayBuffer = await imageBlob.arrayBuffer();
            const hashArray = new Uint8Array(arrayBuffer.slice(0, 1024)); // 取前1KB作为哈希
            const currentImageHash = Array.from(hashArray).join(',');
            
            if (currentImageHash && currentImageHash !== lastClipboardImageHash) {
              lastClipboardImageHash = currentImageHash;
              
              // 将图片转换为base64
              const reader = new FileReader();
              reader.onload = async () => {
                const base64Data = reader.result as string;
                
                const success = await get().addItem({
                  type: 'image',
                  content: base64Data,
                  metadata: {
                    source: 'auto_monitor',
                    auto_detected: true,
                    mime_type: imageType,
                    size: imageBlob.size,
                  },
                });
                
                if (!success) {
                  console.warn('自动添加图片剪贴板内容失败');
                }
              };
              reader.readAsDataURL(imageBlob);
            }
          }
        }
      } catch (error) {
        // 如果 navigator.clipboard.read() 不支持，回退到只检测文本
        if (error instanceof Error && error.name === 'NotSupportedError') {
          try {
            const currentContent = await navigator.clipboard.readText();
            
            if (currentContent && currentContent !== lastClipboardContent) {
              lastClipboardContent = currentContent;
              
              const success = await get().addItem({
                type: 'text',
                content: currentContent,
                metadata: {
                  source: 'auto_monitor',
                  auto_detected: true,
                },
              });
              
              if (!success) {
                console.warn('自动添加文本剪贴板内容失败');
              }
            }
          } catch (textError) {
            // 忽略权限相关错误和文档失去焦点的错误
            if (textError instanceof Error && 
                !textError.message.includes('permission') && 
                textError.name !== 'NotAllowedError') {
              console.error('剪贴板文本监控错误:', textError);
            }
          }
        } else {
          // 忽略权限相关错误和文档失去焦点的错误，但记录其他错误
          if (error instanceof Error && 
              !error.message.includes('permission') && 
              error.name !== 'NotAllowedError') {
            console.error('剪贴板监控错误:', error);
          }
        }
      }
    }, 2000); // 每2秒检查一次
  },

  stopMonitoring: () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    
    if (window.electronAPI && clipboardIpcHandler) {
      window.electronAPI.removeListener('clipboard-changed', clipboardIpcHandler);
      clipboardIpcHandler = null;
    }
    
    set({ isMonitoring: false });
  },

  clearError: () => set({ error: null }),

  uploadFile: async (file: File) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.uploadFile(file);
      if (response.success) {
        await get().fetchItems();
        return true;
      } else {
        set({ error: response.message, isLoading: false });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文件上传失败';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().showError('文件上传失败', errorMessage);
      return false;
    }
  },
  
  // WebSocket集成方法
  


  broadcastClipboardChange: (data: unknown) => {
    // 广播剪贴板变化到其他设备
    setTimeout(() => {
      try {
        const wsState = useWebSocketStore?.getState?.();
        if (wsState?.isConnected && wsState?.sendMessage) {
          wsState.sendMessage({
            type: 'clipboard_sync',
            data: data,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to broadcast clipboard change:', error);
      }
    }, 0);
  },

  handleRemoteClipboardUpdate: (data: unknown) => {
    // 处理来自其他设备的剪贴板更新
    if (!data || typeof data !== 'object') return
    const payload = data as Record<string, unknown>
    const typeFromPayload = typeof payload.type === 'string' ? payload.type : ''
    const contentType = typeof payload.content_type === 'string' ? payload.content_type : ''
    const resolvedType = typeFromPayload || contentType
    if (!resolvedType) return
      const { items } = get();
      const id = (typeof payload.id === 'string' || typeof payload.id === 'number') ? String(payload.id) : Date.now().toString()
      const created_at = typeof payload.created_at === 'string' ? payload.created_at : new Date().toISOString()
      const updated_at = typeof payload.updated_at === 'string' ? payload.updated_at : new Date().toISOString()
      const device_id = (typeof payload.device_id === 'string' && payload.device_id) ? payload.device_id : 'remote'
      const newItem = {
        id,
        type: resolvedType,
        content: typeof payload.content === 'string' ? payload.content : undefined,
        file_path: typeof payload.file_path === 'string' ? payload.file_path : undefined,
        metadata: payload.metadata,
        created_at,
        updated_at,
        device_id,
        device_name: typeof payload.device_name === 'string' ? payload.device_name : undefined,
      };
      
      // 检查是否已存在相同的项目
      const existingIndex = items.findIndex(item => item.id === newItem.id);
      if (existingIndex === -1) {
        set({ items: [newItem, ...items] });
        return
      }

      const parseMs = (t: string) => {
        const ms = Date.parse(t)
        return Number.isFinite(ms) ? ms : 0
      }
      const localUpdated = parseMs(items[existingIndex].updated_at)
      const incomingUpdated = parseMs(newItem.updated_at)
      if (incomingUpdated > localUpdated) {
        const nextItems = [...items]
        nextItems.splice(existingIndex, 1)
        nextItems.unshift(newItem)
        set({ items: nextItems })
      }
  },
}));

// 页面卸载时清理监控
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
  });
}
