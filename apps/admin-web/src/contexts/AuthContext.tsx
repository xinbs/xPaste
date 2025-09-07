import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../utils/api'
import type { AuthState, Admin } from '../types'

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null
  })

  // 检查并同步localStorage状态
  const syncAuthState = () => {
    const token = localStorage.getItem('admin_token')
    const userStr = localStorage.getItem('admin_user')
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        setAuthState({
          isAuthenticated: true,
          user,
          token
        })
      } catch (error) {
        // 解析失败，清除无效数据
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_user')
        setAuthState({
          isAuthenticated: false,
          user: null,
          token: null
        })
      }
    } else {
      // 没有token或用户信息，设置为未认证状态
      setAuthState({
        isAuthenticated: false,
        user: null,
        token: null
      })
    }
  }

  useEffect(() => {
    // 初始化时同步状态
    syncAuthState()
    
    // 监听localStorage变化（比如在其他标签页登出）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'admin_token' || e.key === 'admin_user') {
        syncAuthState()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    
    // 定期检查token状态（每30秒）
    const intervalId = setInterval(() => {
      const token = localStorage.getItem('admin_token')
      if (token) {
        // 验证token是否仍然有效
        api.get('/api/v1/profile').catch(() => {
          // 如果验证失败，syncAuthState会在api拦截器清除localStorage后被触发
          syncAuthState()
        })
      }
    }, 30000)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(intervalId)
    }
  }, [])

  const login = async (username: string, password: string) => {
    try {
      const response = await api.post('/api/v1/auth/login', {
        username,
        password
      })
      
      // 后端返回格式: { data: { admin, token } }
      const { token, admin } = response.data.data
      const user = admin
      
      localStorage.setItem('admin_token', token)
      localStorage.setItem('admin_user', JSON.stringify(user))
      
      setAuthState({
        isAuthenticated: true,
        user,
        token
      })
      
      return { success: true }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.error || '登录失败' 
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    
    setAuthState({
      isAuthenticated: false,
      user: null,
      token: null
    })
  }

  return (
    <AuthContext.Provider value={{
      ...authState,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}