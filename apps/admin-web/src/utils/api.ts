import axios from 'axios'

// API基础配置
const API_BASE_URL = 'http://localhost:8081'

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

export default api