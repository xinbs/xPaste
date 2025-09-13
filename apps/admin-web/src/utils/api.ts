import axios from 'axios'

// API基础配置：优先使用环境变量，未设置则回退到本地默认端口 8083
const API_BASE_URL = (import.meta as any).env?.VITE_ADMIN_API_BASE_URL || 'http://localhost:8083'

// 创建axios实例
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 - 添加认证token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token过期或无效，先获取旧值再清除本地存储
      const oldToken = localStorage.getItem('admin_token')
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      
      // 触发storage事件，通知AuthContext更新状态
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'admin_token',
        newValue: null,
        oldValue: oldToken
      }))
    }
    return Promise.reject(error)
  }
)

// ============== 新增：Sync API 客户端 ==============
// Sync API 基础配置：优先使用环境变量，未设置则回退到本地默认端口 8080
const SYNC_API_BASE_URL = (import.meta as any).env?.VITE_SYNC_API_BASE_URL || 'http://localhost:8080'

export const syncApi = axios.create({
  baseURL: SYNC_API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 - 复用管理员令牌（OptionalAuth 可用，无令牌也可访问公开端点）
syncApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器 - 保持与 admin-api 一致的 401 处理
syncApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const oldToken = localStorage.getItem('admin_token')
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'admin_token',
        newValue: null,
        oldValue: oldToken
      }))
    }
    return Promise.reject(error)
  }
)

export default api