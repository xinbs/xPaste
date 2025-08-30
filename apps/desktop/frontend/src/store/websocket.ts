import { create } from 'zustand';
import { useAuthStore } from './auth';
import { useClipboardStore } from './clipboard';
import { useToastStore } from './toast';

interface WebSocketMessage {
  type: 'clipboard_sync' | 'device_status' | 'ping' | 'pong';
  data?: any;
  timestamp: string;
  device_id?: string;
}

interface WebSocketState {
  socket: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastPingTime: number | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  onlineDevices: string[];
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => void;
  clearError: () => void;
  resetReconnectAttempts: () => void;
}

const WS_URL = 'ws://localhost:8080/ws/ws';
const PING_INTERVAL = 30000; // 30秒
const RECONNECT_DELAY = 5000; // 5秒

export const useWebSocketStore = create<WebSocketState>((set, get) => {
  let pingInterval: NodeJS.Timeout | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;

  const startPing = () => {
    if (pingInterval) clearInterval(pingInterval);
    
    pingInterval = setInterval(() => {
      const { socket, isConnected } = get();
      if (socket && isConnected) {
        const pingMessage: WebSocketMessage = {
          type: 'ping',
          timestamp: new Date().toISOString(),
        };
        socket.send(JSON.stringify(pingMessage));
        set({ lastPingTime: Date.now() });
      }
    }, PING_INTERVAL);
  };

  const stopPing = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'clipboard_sync':
          // 处理剪贴板同步消息
          if (message.data && message.device_id !== useAuthStore.getState().currentDevice?.id) {
            // 只处理来自其他设备的消息
            // 使用setTimeout避免循环引用
            setTimeout(() => {
              useClipboardStore.getState().handleRemoteClipboardUpdate(message.data);
            }, 0);
          }
          break;
          
        case 'device_status':
          // 处理设备状态更新
          console.log('Device status update:', message.data);
          if (message.data && message.data.online_devices) {
            set({ onlineDevices: message.data.online_devices });
          }
          break;
          
        case 'pong':
          // 处理pong响应
          console.log('Received pong');
          break;
          
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const attemptReconnect = () => {
    const { reconnectAttempts, maxReconnectAttempts } = get();
    
    if (reconnectAttempts < maxReconnectAttempts) {
      set({ reconnectAttempts: reconnectAttempts + 1 });
      
      reconnectTimeout = setTimeout(() => {
        console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})...`);
        get().connect();
      }, RECONNECT_DELAY);
    } else {
      set({ error: '连接失败，已达到最大重连次数' });
    }
  };

  return {
    socket: null,
    isConnected: false,
    isConnecting: false,
    error: null,
    lastPingTime: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    onlineDevices: [],

    connect: () => {
      const { isAuthenticated, currentDevice } = useAuthStore.getState();
      if (!isAuthenticated || !currentDevice) {
        set({ error: 'Not authenticated or missing device' });
        return;
      }

      if (get().socket?.readyState === WebSocket.OPEN) {
        return;
      }

      set({ isConnecting: true, error: null });
      
      try {
      const { token } = useAuthStore.getState();
       const wsUrl = `${WS_URL}?device_id=${currentDevice.id}&token=${token}`;
       const newSocket = new WebSocket(wsUrl);
       set({ socket: newSocket });

        newSocket.onopen = () => {
          console.log('WebSocket connected');
          set({ 
            socket: newSocket, 
            isConnected: true, 
            isConnecting: false,
            reconnectAttempts: 0,
            error: null 
          });
          startPing();
        };

        newSocket.onmessage = handleMessage;

        newSocket.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          set({ 
            socket: null, 
            isConnected: false, 
            isConnecting: false 
          });
          stopPing();
          
          // 如果不是主动断开连接，尝试重连
          if (event.code !== 1000) {
            attemptReconnect();
          }
        };

        newSocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          set({ 
            error: 'WebSocket连接错误',
            isConnecting: false 
          });
          useToastStore.getState().showError('连接错误', 'WebSocket连接出现错误');
        };

        set({ socket: newSocket });
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        set({ 
          error: '创建WebSocket连接失败',
          isConnecting: false 
        });
        useToastStore.getState().showError('连接失败', '创建WebSocket连接失败');
      }
    },

    disconnect: () => {
      const { socket } = get();
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      
      stopPing();
      
      if (socket) {
        socket.close(1000, 'User disconnected');
      }
      
      set({ 
        socket: null, 
        isConnected: false, 
        isConnecting: false,
        reconnectAttempts: 0 
      });
    },

    sendMessage: (message: WebSocketMessage) => {
      const { socket, isConnected } = get();
      
      if (!socket || !isConnected) {
        console.error('WebSocket not connected');
        return;
      }
      
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        set({ error: '发送消息失败' });
      }
    },

    clearError: () => set({ error: null }),
    
    resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
  };
});