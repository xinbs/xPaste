// 核心领域类型定义

/**
 * 剪贴板项目类型
 */
export type ClipItemType = 'text' | 'image' | 'file' | 'html';

/**
 * 剪贴板项目
 */
export interface ClipItem {
  id: string;
  type: ClipItemType;
  hash: string;
  contentRef: string;
  createdAt: number;
  deviceId: string;
  deleted?: boolean;
  note?: string;
  favorite?: boolean;
}

/**
 * 设备信息
 */
export interface Device {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: number;
  version: string;
}

/**
 * 设置项
 */
export interface Setting {
  key: string;
  value: string;
  category?: string;
}

/**
 * 历史筛选条件
 */
export interface HistoryFilter {
  type?: ClipItemType;
  keyword?: string;
  favorite?: boolean;
  limit?: number;
  offset?: number;
  since?: number;
}

/**
 * OCR 结果
 */
export interface OcrResult {
  text: string;
  confidence: number;
  language?: string;
}

/**
 * 同步状态
 */
export interface SyncStatus {
  connected: boolean;
  lastSyncAt?: number;
  pendingCount: number;
}

/**
 * 错误信息
 */
export interface ErrorInfo {
  code: string;
  message: string;
  details?: any;
}