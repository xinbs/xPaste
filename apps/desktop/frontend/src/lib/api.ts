import { useConfigStore } from '@/store/config';

type Pagination = {
  page?: number;
  page_size?: number;
  total?: number;
  total_pages?: number;
};

type RequestExtra = {
  allowStatuses?: number[];
};

class ApiClient {
  private token: string | null = null;
  private refreshTokenValue: string | null = null;
  private onUnauthorized: (() => void) | null = null;
  private onTokenRefresh: ((newToken: string, newRefreshToken: string) => void) | null = null;
  private isRefreshing: boolean = false;
  private failedRequestsQueue: Array<{
    endpoint: string;
    options: RequestInit;
    extra?: RequestExtra;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
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

  async post<T>(endpoint: string, data?: unknown, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown, options: RequestInit = {}): Promise<T> {
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
    this.refreshTokenValue = null;
    // 清除Zustand认证存储中的token
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const authData = JSON.parse(authStorage);
        if (authData.state) {
          authData.state.token = null;
          authData.state.refreshToken = null;
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
    options: RequestInit = {},
    extra?: RequestExtra
  ): Promise<T> {
    const url = `${this.getBaseURL()}${endpoint}`;
    const headersObj: Record<string, string> = {};
    if (options.headers) {
      const hs = new Headers(options.headers);
      hs.forEach((v, k) => { headersObj[k] = v; });
    }

    const hasContentType = Object.keys(headersObj).some(k => k.toLowerCase() === 'content-type');
    if (!hasContentType && !(options.body instanceof FormData)) {
      headersObj['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headersObj.Authorization = `Bearer ${this.token}`;
    }

    const { signal, ...restOptions } = options;
    const fetchOptions: RequestInit = { ...restOptions, headers: headersObj };

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
        if (extra?.allowStatuses && extra.allowStatuses.includes(response.status)) {
          return response.json();
        }
        if (response.status === 401) {
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
                    this.failedRequestsQueue.forEach(({ endpoint, options, extra, resolve, reject }) => {
                      // 重新发起请求
                      this.request(endpoint, options, extra).then(resolve).catch(reject);
                    });
                    this.failedRequestsQueue = [];
                    
                    // 重试当前请求
                    this.isRefreshing = false;
                    return this.request<T>(endpoint, options, extra);
                  }
                }
                
                // 刷新失败
                throw new Error('Token refresh failed');
              } else {
                // 正在刷新中，将请求加入队列
                return new Promise<T>((resolve, reject) => {
                  this.failedRequestsQueue.push({ endpoint, options, extra, resolve, reject });
                });
              }
            } catch {
              // 刷新失败，清除状态并登出
              this.isRefreshing = false;
              this.failedRequestsQueue.forEach(({ reject }) => {
                reject(new Error('Token refresh failed'));
              });
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
  async login<TUser = unknown>(username: string, password: string, deviceId?: string, privateIP?: string | null) {
    const requestBody: Record<string, unknown> = { username, password };
    if (deviceId) {
      requestBody.device_id = deviceId;
    }
    if (privateIP) {
      requestBody.private_ip = privateIP;
    }
    
    const response = await this.request<{
      success: boolean;
      message: string;
      data: { access_token: string; refresh_token?: string; user: TUser };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    
    if (response.success && response.data.access_token) {
      this.setToken(response.data.access_token);
      if (response.data.refresh_token) {
        this.setRefreshToken(response.data.refresh_token);
      }
    }
    
    return response;
  }

  async register(username: string, email: string, password: string) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  // 设备相关API
  async registerDevice<TDevice = unknown>(deviceInfo: {
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
      data: TDevice;
    }>('/devices/register', {
      method: 'POST',
      body: JSON.stringify(deviceInfo),
    });
  }

  async getDevices<TDevice = unknown>(signal?: AbortSignal) {
    return this.request<{
      success: boolean;
      message: string;
      data: { items: TDevice[]; pagination: Pagination };
    }>('/devices?page=1&limit=100', {
      signal,
    });
  }

  async updateDevice(deviceId: string, updateData: { name?: string }) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>(`/devices/${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  async deleteDevice(deviceId: string) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>(`/devices/${deviceId}`, {
      method: 'DELETE',
    });
  }

  // 剪贴板相关API
  async getClipItems<TClipItem = unknown>(params: { page: number; pageSize: number }, signal?: AbortSignal) {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.pageSize),
    }).toString();
    return this.request<{
      success: boolean;
      message: string;
      data: { items: TClipItem[]; pagination: Pagination };
    }>(`/clips?${query}`, {
      signal,
    });
  }

  async searchClipItems<TClipItem = unknown>(params: { q: string; page?: number; limit?: number }, signal?: AbortSignal) {
    const query = new URLSearchParams();
    query.set('q', params.q);
    if (params.page != null) query.set('page', String(params.page));
    if (params.limit != null) query.set('limit', String(params.limit));
    return this.request<{
      success: boolean;
      message: string;
      data: { items: TClipItem[]; pagination: Pagination };
    }>(`/clips/search?${query.toString()}`, {
      signal,
    });
  }

  async createClipItem<TClipItem = unknown>(clipData: {
    type: string;
    content?: string;
    file_path?: string;
    metadata?: unknown;
  }) {
    return this.request<{
      success: boolean;
      message: string;
      data: TClipItem;
    }>('/clips', {
      method: 'POST',
      body: JSON.stringify(clipData),
    });
  }

  async deleteClipItem(id: string | number) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>(`/clips/${id}`, {
      method: 'DELETE',
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

  // 笔记本同步：推送单条笔记
  async pushNotebookNote(
    content: string,
    opts: { filename: string; noteDir?: string; useData?: boolean }
  ) {
    const payload = {
      content,
      filename: opts.filename,
      note_dir: opts.noteDir || '',
      use_data: !!opts.useData,
    };
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>('/notes/push', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // 笔记本同步：批量推送笔记
  async pushNotebookNotesBatch(
    items: { content: string; filename: string; note_dir?: string; use_data?: boolean }[]
  ) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>('/notes/push-batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  // 笔记本附件上传
  async uploadNotebookAttachment(
    fileData: Blob | File,
    opts: { filename?: string; noteDir?: string; pathRel?: string; subdir?: string; useData?: boolean } = {}
  ) {
    const formData = new FormData();
    const name = opts.filename || `attachment-${Date.now()}`;
    formData.append('file', fileData, name);
    if (opts.filename) formData.append('filename', opts.filename);
    if (typeof opts.noteDir === 'string') formData.append('note_dir', opts.noteDir);
    if (typeof opts.pathRel === 'string') formData.append('path_rel', opts.pathRel);
    if (typeof opts.subdir === 'string') formData.append('subdir', opts.subdir);
    if (opts.useData) formData.append('use_data', 'true');

    const query = new URLSearchParams();
    if (opts.useData) query.set('use_data', 'true');
    if (opts.subdir) query.set('subdir', opts.subdir);
    if (opts.noteDir) query.set('note_dir', opts.noteDir);
    if (opts.pathRel) query.set('path_rel', opts.pathRel);
    if (opts.filename) query.set('filename', opts.filename);
    const qs = query.toString() ? `?${query.toString()}` : '';

    const url = `${this.getBaseURL()}/uploads/file${qs}`;
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

  // 获取云端笔记列表
  async listNotebookNotes(opts: { noteDir?: string; useData?: boolean } = {}) {
    const params = new URLSearchParams();
    if (opts.noteDir) params.set('note_dir', opts.noteDir);
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: {
        items?: string[];
        items_meta?: { path: string; mtime_ms?: number; size_bytes?: number }[];
        count?: number;
      };
    }>(`/notes/list${qs}`, { method: 'GET' });
  }

  // 获取云端笔记内容
  async getNotebookNote(opts: { filename: string; noteDir?: string; useData?: boolean }) {
    const params = new URLSearchParams();
    params.set('filename', opts.filename);
    if (opts.noteDir) params.set('note_dir', opts.noteDir);
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: { content?: unknown } & Record<string, unknown>;
    }>(`/notes/get${qs}`, { method: 'GET' });
  }

  // 获取云端笔记变更事件（增量）
  async getNotebookNoteChanges(opts: { since?: number; limit?: number; useData?: boolean } = {}) {
    const params = new URLSearchParams();
    if (typeof opts.since === 'number' && Number.isFinite(opts.since)) params.set('since', String(opts.since));
    if (typeof opts.limit === 'number' && Number.isFinite(opts.limit)) params.set('limit', String(opts.limit));
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: {
        items?: { token: number; event_type?: string; note_key?: string; mtime_ms?: number; size_bytes?: number; content_hash?: string }[];
        since?: number;
        next_token?: number;
        max_token?: number;
        has_more?: boolean;
      };
    }>(`/notes/changes${qs}`, { method: 'GET' });
  }

  // 确认已处理的云端变更事件游标
  async ackNotebookNoteChanges(opts: { lastToken: number; useData?: boolean }) {
    const payload = { last_token: opts.lastToken, use_data: !!opts.useData };
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>('/notes/ack', { method: 'POST', body: JSON.stringify(payload) });
  }

  async getCloudFilesTree(opts: { path?: string; recursive?: boolean; useData?: boolean } = {}) {
    const params = new URLSearchParams();
    if (opts.path) params.set('path', opts.path);
    if (opts.recursive) params.set('recursive', '1');
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: {
        path: string;
        recursive: boolean;
        items: { name: string; path: string; is_dir: boolean; size_bytes?: number; mtime_ms?: number }[];
      };
    }>(`/cloud-files/tree${qs}`, { method: 'GET' });
  }

  async getCloudFileMeta(opts: { path: string; useData?: boolean }) {
    const params = new URLSearchParams();
    params.set('path', opts.path);
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: { path: string; is_dir: boolean; size_bytes?: number; mtime_ms?: number; sha256?: string; backup_path?: string };
    }>(`/cloud-files/meta${qs}`, { method: 'GET' });
  }

  async downloadCloudFile(opts: { path: string; useData?: boolean }) {
    const params = new URLSearchParams();
    params.set('path', opts.path);
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    const url = `${this.getBaseURL()}/cloud-files/file${qs}`;
    const headers: HeadersInit = {};
    if (this.token) {
      (headers as Record<string, string>).Authorization = `Bearer ${this.token}`;
    }
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.arrayBuffer();
    const path = response.headers.get('X-File-Path') || opts.path;
    const sizeBytes = Number(response.headers.get('X-File-Size') || 0) || 0;
    const mtimeMs = Number(response.headers.get('X-File-Mtime-Ms') || 0) || 0;
    return { path, sizeBytes, mtimeMs, data };
  }

  async writeCloudText(payload: { path: string; content: string; ifMatchHash?: string; mode?: string; useData?: boolean }) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>('/cloud-files/text', { method: 'PUT', body: JSON.stringify({
      path: payload.path,
      content: payload.content,
      if_match_hash: payload.ifMatchHash,
      mode: payload.mode,
      use_data: !!payload.useData,
    }) }, { allowStatuses: [409] });
  }

  async uploadCloudFile(fileData: Blob | File, opts: { path: string; mode?: string; ifMatchHash?: string; useData?: boolean }) {
    const params = new URLSearchParams();
    params.set('path', opts.path);
    if (opts.mode) params.set('mode', opts.mode);
    if (opts.ifMatchHash) params.set('if_match_hash', opts.ifMatchHash);
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    const formData = new FormData();
    const name = fileData instanceof File ? fileData.name : 'file';
    formData.append('file', fileData, name);
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>(`/cloud-files/upload${qs}`, { method: 'POST', body: formData }, { allowStatuses: [409] });
  }

  async renameCloudFile(payload: { fromPath: string; toPath: string; mode?: string; useData?: boolean }) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>('/cloud-files/rename', { method: 'PATCH', body: JSON.stringify({
      from_path: payload.fromPath,
      to_path: payload.toPath,
      mode: payload.mode,
      use_data: !!payload.useData,
    }) }, { allowStatuses: [409] });
  }

  async deleteCloudFile(opts: { path: string; trash?: boolean; useData?: boolean }) {
    const params = new URLSearchParams();
    params.set('path', opts.path);
    params.set('trash', opts.trash === false ? '0' : '1');
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>(`/cloud-files/file${qs}`, { method: 'DELETE' });
  }

  async listCloudTrash(opts: { useData?: boolean } = {}) {
    const params = new URLSearchParams();
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: { items: { trash_id: string; original_path: string; deleted_at_ms: number; is_dir: boolean; size_bytes?: number; mtime_ms?: number }[] };
    }>(`/cloud-files/trash${qs}`, { method: 'GET' });
  }

  async restoreCloudTrash(payload: { trashId: string; mode?: string; useData?: boolean }) {
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>('/cloud-files/trash/restore', { method: 'POST', body: JSON.stringify({
      trash_id: payload.trashId,
      mode: payload.mode,
      use_data: !!payload.useData,
    }) }, { allowStatuses: [409] });
  }

  async deleteCloudTrashItem(opts: { trashId: string; useData?: boolean }) {
    const params = new URLSearchParams();
    params.set('trash_id', opts.trashId);
    if (opts.useData) params.set('use_data', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      success: boolean;
      message: string;
      data: unknown;
    }>(`/cloud-files/trash/item${qs}`, { method: 'DELETE' });
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
