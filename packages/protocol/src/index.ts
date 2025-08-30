// 协议定义：事件名、HTTP/WS 契约、错误码

import type { ClipItem, Device } from '@xpaste/shared-types';

/**
 * WebSocket 事件类型
 */
export const WS_EVENTS = {
  CLIP_CREATED: 'clip.created',
  CLIP_UPDATED: 'clip.updated',
  CLIP_DELETED: 'clip.deleted',
  DEVICE_HEARTBEAT: 'device.heartbeat',
} as const;

export type WsEventType = typeof WS_EVENTS[keyof typeof WS_EVENTS];

/**
 * WebSocket 消息格式
 */
export interface WsMessage<T = any> {
  event: WsEventType;
  data: T;
  timestamp: number;
}

/**
 * HTTP API 响应格式
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * 认证相关
 */
export interface LoginRequest {
  username?: string;
  password?: string;
  deviceId: string;
  deviceName: string;
  platform: string;
}

export interface LoginResponse {
  token: string;
  deviceId: string;
  expiresAt: number;
}

/**
 * 设备注册
 */
export interface RegisterDeviceRequest {
  name: string;
  platform: string;
  version: string;
}

export interface RegisterDeviceResponse {
  deviceId: string;
}

/**
 * 剪贴板同步
 */
export interface PullClipsRequest {
  since?: number;
  limit?: number;
}

export interface PullClipsResponse {
  clips: ClipItem[];
  hasMore: boolean;
  nextCursor?: number;
}

export interface PushClipsRequest {
  clips: ClipItem[];
}

export interface PushClipsResponse {
  accepted: string[];
  duplicates: string[];
  errors: Array<{
    id: string;
    error: string;
  }>;
}

/**
 * 错误码定义
 */
export const ERROR_CODES = {
  // 通用错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  
  // 设备相关
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  DEVICE_ALREADY_EXISTS: 'DEVICE_ALREADY_EXISTS',
  
  // 剪贴板相关
  CLIP_NOT_FOUND: 'CLIP_NOT_FOUND',
  CLIP_TOO_LARGE: 'CLIP_TOO_LARGE',
  INVALID_CLIP_TYPE: 'INVALID_CLIP_TYPE',
  
  // 同步相关
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  SYNC_FAILED: 'SYNC_FAILED',
  
  // OCR 相关
  OCR_FAILED: 'OCR_FAILED',
  OCR_TIMEOUT: 'OCR_TIMEOUT',
  OCR_UNSUPPORTED_FORMAT: 'OCR_UNSUPPORTED_FORMAT',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * API 版本
 */
export const API_VERSION = 'v1';

/**
 * API 路径
 */
export const API_PATHS = {
  AUTH: {
    LOGIN: `/api/${API_VERSION}/auth/login`,
    REFRESH: `/api/${API_VERSION}/auth/refresh`,
    LOGOUT: `/api/${API_VERSION}/auth/logout`,
  },
  DEVICES: {
    REGISTER: `/api/${API_VERSION}/devices/register`,
    LIST: `/api/${API_VERSION}/devices`,
    UPDATE: (id: string) => `/api/${API_VERSION}/devices/${id}`,
    DELETE: (id: string) => `/api/${API_VERSION}/devices/${id}`,
  },
  CLIPS: {
    PULL: `/api/${API_VERSION}/clips/pull`,
    PUSH: `/api/${API_VERSION}/clips/push`,
    LIST: `/api/${API_VERSION}/clips`,
    GET: (id: string) => `/api/${API_VERSION}/clips/${id}`,
    DELETE: (id: string) => `/api/${API_VERSION}/clips/${id}`,
  },
  WS: `/api/${API_VERSION}/ws`,
} as const;