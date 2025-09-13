// 用户相关类型
export interface User {
  id: number
  username: string
  role: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// 管理员相关类型
export interface Admin {
  id: number
  username: string
  role: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// 来自后端的用户响应（camelCase，见 UserResponse DTO）
export interface UserResponse {
  id: string
  username: string
  email: string
  role: string
  createdAt: string
  lastLoginAt?: string
  isActive: boolean
  userType: string
  status: string
}

// 认证相关类型
export interface AuthState {
  isAuthenticated: boolean
  user: Admin | null
  token: string | null
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  admin: Admin
}

// 仪表盘统计类型
export interface DashboardStats {
  totalUsers: number
  activeDevices: number
  totalClipboards: number
  todayClipboards: number
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// 分页类型
export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ============== 新增：系统监控相关类型（sync-api） ==============
export interface SyncApiHealthServices {
  database: 'ok' | 'error'
  websocket: 'ok' | 'error'
}

export interface SyncApiHealth {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string | Date
  version: string
  services: SyncApiHealthServices
  websocket_connections?: WSConnectionStatsMap | any
}

export type WSConnectionStatsMap = Record<string, number>

export interface WSConnectionStats {
  total_connections: number
  connections_by_user: WSConnectionStatsMap
  timestamp: number
}