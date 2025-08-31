import { create } from 'zustand';
import apiClient from '@/lib/api';
import { useWebSocketStore } from './websocket';
import { useToastStore } from './toast';

interface ClipItem {
  id: string;
  type: string;
  content?: string;
  file_path?: string;
  metadata?: any;
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
  
  // Actions
  fetchItems: (signal?: AbortSignal) => Promise<void>;
  addItem: (item: Omit<ClipItem, 'id' | 'created_at' | 'updated_at' | 'device_id'>) => Promise<boolean>;
  deleteItem: (id: string) => Promise<boolean>;
  copyToClipboard: (content: string) => Promise<boolean>;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  clearError: () => void;
  uploadFile: (file: File) => Promise<boolean>;
  broadcastClipboardChange: (data: any) => void;
  handleRemoteClipboardUpdate: (data: any) => void;
}

// 剪贴板监控相关
let monitoringInterval: NodeJS.Timeout | null = null;
let lastClipboardContent = '';
let lastClipboardImageHash = '';

export const useClipboardStore = create<ClipboardState>()((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  isMonitoring: false,

  fetchItems: async (signal?: AbortSignal) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.getClipItems(signal);
      if (response.success) {
        set({ items: response.data.items || [], isLoading: false });
      } else {
        set({ error: response.message, isLoading: false });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 请求被取消，不显示错误
        set({ isLoading: false });
        return;
      }
      const errorMessage = error instanceof Error ? error.message : '获取剪贴板历史失败';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().showError('获取剪贴板历史失败', errorMessage);
    }
  },

  addItem: async (itemData) => {
    set({ error: null });
    try {
      const response = await apiClient.createClipItem({
        type: itemData.type,
        content: itemData.content,
        file_path: itemData.file_path,
        metadata: {
          ...itemData.metadata,
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
      // 这里需要后端实现删除API
      // const response = await apiClient.deleteClipItem(id);
      // 暂时从本地状态中移除
      const currentItems = get().items;
      set({ items: currentItems.filter(item => item.id !== id) });
      return true;
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
    } catch (error) {
      set({ error: '复制到剪贴板失败' });
      useToastStore.getState().showError('复制失败', '无法复制到剪贴板');
      return false;
    }
  },

  startMonitoring: () => {
    if (monitoringInterval) return;
    
    set({ isMonitoring: true });
    
    // 初始化当前剪贴板内容
    navigator.clipboard.readText().then(text => {
      lastClipboardContent = text;
    }).catch(() => {
      // 忽略权限错误
    });
    
    monitoringInterval = setInterval(async () => {
      try {
        // 使用 navigator.clipboard.read() 来检测所有类型的剪贴板内容
        const clipboardItems = await navigator.clipboard.read();
        
        for (const clipboardItem of clipboardItems) {
          // 检查文本内容
          if (clipboardItem.types.includes('text/plain')) {
            const textBlob = await clipboardItem.getType('text/plain');
            const currentContent = await textBlob.text();
            
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
  


  broadcastClipboardChange: (data: any) => {
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

  handleRemoteClipboardUpdate: (data: any) => {
    // 处理来自其他设备的剪贴板更新
    if (data && data.content_type) {
      const { items } = get();
      const newItem = {
        ...data,
        id: data.id || Date.now().toString(),
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
      };
      
      // 检查是否已存在相同的项目
      const existingIndex = items.findIndex(item => item.id === newItem.id);
      if (existingIndex === -1) {
        set({ items: [newItem, ...items] });
      }
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