const API_BASE_URL = 'http://localhost:8080/api/v1';

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // 从localStorage获取token
    this.token = localStorage.getItem('access_token');
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
    localStorage.setItem('access_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('access_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>).Authorization = `Bearer ${this.token}`;
    }

    // 使用传入的signal或创建新的controller
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let signal = options.signal;
    
    // 只有在没有传入signal时才创建新的controller和超时
    if (!signal) {
      controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller!.abort(), 10000); // 10秒超时
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal,
      });

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
  async login(username: string, password: string, deviceId?: string) {
    const requestBody: any = { username, password };
    if (deviceId) {
      requestBody.device_id = deviceId;
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
  async getClipItems(signal?: AbortSignal) {
    return this.request<{
      success: boolean;
      message: string;
      data: { items: any[]; pagination: any };
    }>('/clips', {
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
    
    const url = `${this.baseURL}/files/upload`;
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

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;