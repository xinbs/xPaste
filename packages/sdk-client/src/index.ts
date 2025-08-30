// 客户端 SDK：同步服务调用、重试、批处理、鉴权

import type {
  ClipItem,
  Device,
  HistoryFilter,
  SyncStatus,
} from '@xpaste/shared-types';

import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  PullClipsRequest,
  PullClipsResponse,
  PushClipsRequest,
  PushClipsResponse,
  WsMessage,
  WsEventType,
} from '@xpaste/protocol';

import { API_PATHS, WS_EVENTS } from '@xpaste/protocol';

/**
 * SDK 配置
 */
export interface SdkConfig {
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  batchSize?: number;
}

/**
 * 认证信息
 */
export interface AuthInfo {
  token: string;
  deviceId: string;
  expiresAt: number;
}

/**
 * WebSocket 事件监听器
 */
export type WsEventListener<T = any> = (data: T) => void;

/**
 * xPaste 同步客户端 SDK
 */
export class XPasteSyncClient {
  private config: Required<SdkConfig>;
  private authInfo: AuthInfo | null = null;
  private ws: WebSocket | null = null;
  private wsEventListeners: Map<WsEventType, Set<WsEventListener>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingQueue: ClipItem[] = [];

  constructor(config: SdkConfig) {
    this.config = {
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000,
      batchSize: 50,
      ...config,
    };
  }

  /**
   * 设备注册
   */
  async registerDevice(request: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    const response = await this.request<RegisterDeviceResponse>(
      'POST',
      API_PATHS.DEVICES.REGISTER,
      request
    );
    return response.data!;
  }

  /**
   * 用户登录
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>(
      'POST',
      API_PATHS.AUTH.LOGIN,
      request
    );
    
    this.authInfo = {
      token: response.data!.token,
      deviceId: response.data!.deviceId,
      expiresAt: response.data!.expiresAt,
    };
    
    return response.data!;
  }

  /**
   * 拉取剪贴板数据
   */
  async pullClips(request: PullClipsRequest = {}): Promise<PullClipsResponse> {
    const response = await this.request<PullClipsResponse>(
      'GET',
      API_PATHS.CLIPS.PULL,
      null,
      request
    );
    return response.data!;
  }

  /**
   * 推送剪贴板数据
   */
  async pushClips(clips: ClipItem[]): Promise<PushClipsResponse> {
    // 批处理
    const batches = this.chunkArray(clips, this.config.batchSize);
    const results: PushClipsResponse = {
      accepted: [],
      duplicates: [],
      errors: [],
    };

    for (const batch of batches) {
      const request: PushClipsRequest = { clips: batch };
      const response = await this.request<PushClipsResponse>(
        'POST',
        API_PATHS.CLIPS.PUSH,
        request
      );
      
      if (response.data) {
        results.accepted.push(...response.data.accepted);
        results.duplicates.push(...response.data.duplicates);
        results.errors.push(...response.data.errors);
      }
    }

    return results;
  }

  /**
   * 连接 WebSocket
   */
  async connectWebSocket(): Promise<void> {
    if (!this.authInfo) {
      throw new Error('Not authenticated');
    }

    const wsUrl = `${this.config.baseUrl.replace('http', 'ws')}${API_PATHS.WS}?token=${this.authInfo.token}`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.clearReconnectTimer();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        this.handleWsMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.scheduleReconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  /**
   * 断开 WebSocket
   */
  disconnectWebSocket(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 监听 WebSocket 事件
   */
  on<T = any>(event: WsEventType, listener: WsEventListener<T>): void {
    if (!this.wsEventListeners.has(event)) {
      this.wsEventListeners.set(event, new Set());
    }
    this.wsEventListeners.get(event)!.add(listener);
  }

  /**
   * 移除 WebSocket 事件监听器
   */
  off<T = any>(event: WsEventType, listener: WsEventListener<T>): void {
    const listeners = this.wsEventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 获取同步状态
   */
  getSyncStatus(): SyncStatus {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      pendingCount: this.pendingQueue.length,
    };
  }

  /**
   * 添加到待同步队列
   */
  addToPendingQueue(clip: ClipItem): void {
    this.pendingQueue.push(clip);
  }

  /**
   * 处理待同步队列
   */
  async processPendingQueue(): Promise<void> {
    if (this.pendingQueue.length === 0) {
      return;
    }

    try {
      const clips = [...this.pendingQueue];
      await this.pushClips(clips);
      this.pendingQueue = [];
    } catch (error) {
      console.error('Failed to process pending queue:', error);
    }
  }

  // 私有方法

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    params?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    const url = new URL(path, this.config.baseUrl);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authInfo) {
      headers.Authorization = `Bearer ${this.authInfo.token}`;
    }

    let lastError: Error;
    
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        const result: ApiResponse<T> = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error?.message || 'Request failed');
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts - 1) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError!;
  }

  private handleWsMessage(message: WsMessage): void {
    const listeners = this.wsEventListeners.get(message.event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(message.data);
        } catch (error) {
          console.error('WebSocket event listener error:', error);
        }
      });
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket().catch(console.error);
    }, 5000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出默认实例创建函数
export function createSyncClient(config: SdkConfig): XPasteSyncClient {
  return new XPasteSyncClient(config);
}

export * from '@xpaste/shared-types';
export * from '@xpaste/protocol';