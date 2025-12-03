import { useConfigStore } from '@/store/config';

class ApiClient {
  private token: string | null = null;

  constructor() {
    // 从Zustand认证存储获取token
    this.loadTokenFromStorage();
  }
  
  private loadTokenFromStorage() {
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const authData = JSON.parse(authStorage);
        this.token = authData.state?.token || null;
        console.log('从存储加载token:', this.token ? 'Token已加载' : '未找到token');
      }
    } catch (error) {
      console.error('加载token失败:', error);
      this.token = null;
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
    // 更新Zustand认证存储中的token
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const authData = JSON.parse(authStorage);
        authData.state.token = token;
        localStorage.setItem('auth-storage', JSON.stringify(authData));
      }
    } catch (error) {
      console.error('更新token失败:', error);
    }
  }

  clearToken() {
    this.token = null;
    // 清除Zustand认证存储中的token
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const authData = JSON.parse(authStorage);
        if (authData.state) {
          authData.state.token = null;
          authData.state.isAuthenticated = false;
          localStorage.setItem('auth-storage', JSON.stringify(authData));
        }
      }
    } catch (error) {
      console.error('清除token失败:', error);
    }
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
      data: { access_token: string; user: any };
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
