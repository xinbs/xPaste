import { useConfigStore } from '@/store/config';

class ApiClient {
  private token: string | null = null;
  private refreshTokenValue: string | null = null;
  private onUnauthorized: (() => void) | null = null;
  private onTokenRefresh: ((newToken: string, newRefreshToken: string) => void) | null = null;
  private isRefreshing: boolean = false;
  private failedRequestsQueue: Array<{
    resolve: (value: unknown) => void;
    reject: (reason?: any) => void;
  }> = [];

  constructor() {
    // 从Zustand认证存储获取token
    this.loadTokenFromStorage();
  }

  // 设置未授权回调
  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  // 设置token刷新回调
  setOnTokenRefresh(callback: (newToken: string, newRefreshToken: string) => void) {
    this.onTokenRefresh = callback;
  }

  // 设置刷新token
  setRefreshToken(token: string) {
    this.refreshTokenValue = token;
  }
  
  private loadTokenFromStorage() {
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const authData = JSON.parse(authStorage);
        this.token = authData.state?.token || null;
        this.refreshTokenValue = authData.state?.refreshToken || null;
        console.log('从存储加载token:', this.token ? 'Token已加载' : '未找到token');
      }
    } catch (error) {
      console.error('加载token失败:', error);
      this.token = null;
      this.refreshTokenValue = null;
    }
  }
  
  private getBaseURL(): string {
    return useConfigStore.getState().getApiUrl();
  }

  // 公共HTTP方法
  async get<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
    this.refreshTokenValue = null;
  }
  
  // 刷新token（从存储重新加载）
  refreshToken() {
    this.loadTokenFromStorage();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.getBaseURL()}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>).Authorization = `Bearer ${this.token}`;
      // console.log(`[API] Requesting ${endpoint} with token: ${this.token.substring(0, 10)}...`);
    } else {
      // console.log(`[API] Requesting ${endpoint} without token`);
    }

    const { signal, ...restOptions } = options;
    const fetchOptions: RequestInit = { ...restOptions, headers };

    let timeoutId: NodeJS.Timeout | null = null;

    if (signal instanceof AbortSignal) {
      fetchOptions.signal = signal;
    } else {
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
    }

    try {
      const response = await fetch(url, fetchOptions);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        if (response.status === 401) {
          console.warn(`[API] 401 Unauthorized for ${endpoint}`);
          // 如果是登录接口本身，直接抛出错误
          if (endpoint.includes('/auth/login')) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
          }

          // 尝试刷新token
          if (this.refreshTokenValue) {
            try {
              if (!this.isRefreshing) {
                this.isRefreshing = true;
                
                // 发起刷新请求
                const refreshResponse = await fetch(`${this.getBaseURL()}/auth/refresh`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ token: this.refreshTokenValue }),
                });
                
                if (refreshResponse.ok) {
                  const refreshData = await refreshResponse.json();
                  if (refreshData.success && refreshData.data) {
                    const newToken = refreshData.data.access_token;
                    const newRefreshToken = refreshData.data.refresh_token;
                    
                    this.token = newToken;
                    this.refreshTokenValue = newRefreshToken;
                    
                    // 通知外部更新token
                    if (this.onTokenRefresh) {
                      this.onTokenRefresh(newToken, newRefreshToken);
                    }
                    
                    // 处理队列中的请求
                    this.failedRequestsQueue.forEach(({ resolve, reject }) => {
                      // 重新发起请求
                      this.request(endpoint, options).then(resolve).catch(reject);
                    });
                    this.failedRequestsQueue = [];
                    
                    // 重试当前请求
                    this.isRefreshing = false;
                    return this.request<T>(endpoint, options);
                  }
                }
                
                // 刷新失败
                throw new Error('Token refresh failed');
              } else {
                // 正在刷新中，将请求加入队列
                return new Promise<T>((resolve, reject) => {
                  this.failedRequestsQueue.push({ resolve, reject });
                });
              }
            } catch (refreshError) {
              // 刷新失败，清除状态并登出
              this.isRefreshing = false;
              this.failedRequestsQueue = [];
              this.clearToken();
              if (this.onUnauthorized) {
                this.onUnauthorized();
              }
            }
          } else if (this.onUnauthorized) {
             // 没有刷新token，直接登出
             this.onUnauthorized();
          }
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求超时或被取消');
      }
      throw error;
    }
  }

  // 认证相关API
  async login(username: string, password: string, deviceId?: string, privateIP?: string | null) {
    const requestBody: any = { username, password };
    if (deviceId) {
      requestBody.device_id = deviceId;
    }
    if (privateIP) {
      requestBody.private_ip = privateIP;
    }
    
    const response = await this.request<{
      success: boolean;
      message: string;
      data: { access_token: string; refresh_token?: string; user: any };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    
    if (response.success && response.data.access_token) {
      this.setToken(response.data.access_token);
    }
    
    return response;
  }

  async register(username: string, email: string, password: string) {
    return this.request<{
      success: boolean;
      message: string;
      data: any;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  // 设备相关API
  async registerDevice(deviceInfo: {
    device_id?: string;
    name: string;
    platform: string;
    version: string;
    capabilities: {
      clipboard_read: boolean;
      clipboard_write: boolean;
      file_upload: boolean;
      image_ocr: boolean;
      notifications: boolean;
      websocket: boolean;
    };
    client_ip?: string;
    private_ip?: string;
  }) {
    return this.request<{
      success: boolean;
      message: string;
      data: any;
    }>('/devices/register', {
      method: 'POST',
      body: JSON.stringify(deviceInfo),
    });
  }

  async getDevices(signal?: AbortSignal) {
    return this.request<{
      success: boolean;
      message: string;
      data: { items: any[]; pagination: any };
    }>('/devices?page=1&limit=100', {
      signal,
    });
  }

  async updateDevice(deviceId: string, updateData: { name?: string }) {
    return this.request<{
      success: boolean;
      message: string;
      data: any;
    }>(`/devices/${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  async deleteDevice(deviceId: string) {
    return this.request<{
      success: boolean;
      message: string;
      data: any;
    }>(`/devices/${deviceId}`, {
      method: 'DELETE',
    });
  }

  // 剪贴板相关API
  async getClipItems(params: { page: number; pageSize: number }, signal?: AbortSignal) {
    const query = new URLSearchParams({
      page: String(params.page),
      page_size: String(params.pageSize),
    }).toString();
    return this.request<{
      success: boolean;
      message: string;
      data: { items: any[]; pagination: any };
    }>(`/clips?${query}`, {
      signal,
    });
  }

  async createClipItem(clipData: {
    type: string;
    content?: string;
    file_path?: string;
    metadata?: any;
  }) {
    return this.request<{
      success: boolean;
      message: string;
      data: any;
    }>('/clips', {
      method: 'POST',
      body: JSON.stringify(clipData),
    });
  }

  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const url = `${this.getBaseURL()}/files/upload`;
    const headers: HeadersInit = {};

    if (this.token) {
      (headers as Record<string, string>).Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async uploadNotebookAttachment(blob: Blob, opts: { filename: string; noteDir?: string; pathRel?: string; useData?: boolean; subdir?: string }) {
    const formData = new FormData();
    formData.append('file', blob, opts.filename);
    if (opts.filename) formData.append('filename', opts.filename);
    if (opts.noteDir) formData.append('note_dir', opts.noteDir);
    if (opts.pathRel) formData.append('path_rel', opts.pathRel);
    if (opts.subdir) formData.append('subdir', opts.subdir);

    const params = new URLSearchParams();
    if (opts.useData) params.set('use_data', 'true');
    const url = `${this.getBaseURL()}/uploads/file${params.toString() ? `?${params.toString()}` : ''}`;
    const headers: HeadersInit = {};
    if (this.token) {
      (headers as Record<string, string>).Authorization = `Bearer ${this.token}`;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async pushNotebookNote(content: string, opts: { filename: string; noteDir?: string; useData?: boolean }) {
    const body = {
      content,
      filename: opts.filename,
      note_dir: opts.noteDir || '',
      use_data: !!opts.useData,
    } as any;
    return this.request<{
      success: boolean;
      message: string;
      data: any;
    }>(`/notes/push`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async pushNotebookNotesBatch(items: { content: string; filename: string; note_dir?: string; use_data?: boolean }[]) {
    const body = { items } as any;
    return this.request<{
      success: boolean;
      message: string;
      data: any;
    }>(`/notes/push-batch`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async listNotebookNotes(opts: { noteDir?: string; useData?: boolean }) {
    const params = new URLSearchParams();
    if (opts.noteDir) params.set('note_dir', opts.noteDir);
    if (opts.useData) params.set('use_data', 'true');
    return this.request<{
      success: boolean;
      message: string;
      data: { items: string[]; count: number };
    }>(`/notes/list${params.toString() ? `?${params.toString()}` : ''}`, {
      method: 'GET',
    });
  }

  async getNotebookNote(opts: { filename: string; noteDir?: string; useData?: boolean }) {
    const params = new URLSearchParams();
    params.set('filename', opts.filename);
    if (opts.noteDir) params.set('note_dir', opts.noteDir);
    if (opts.useData) params.set('use_data', 'true');
    return this.request<{
      success: boolean;
      message: string;
      data: { content: string; filename: string; note_dir: string };
    }>(`/notes/get?${params.toString()}`, {
      method: 'GET',
    });
  }

  // 健康检查
  async healthCheck() {
    return this.request<{
      status: string;
      service: string;
      version: string;
    }>('/health', {
      method: 'GET',
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
