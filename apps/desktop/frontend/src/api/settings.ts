import { apiClient } from '../lib/api';

// 设置类型定义
export interface Setting {
  id: number;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'array' | 'object';
  category: string;
  description: string;
  is_readonly: boolean;
  is_encrypted: boolean;
  default_value: string;
  metadata: SettingMetadata;
  created_at: string;
  updated_at: string;
}

export interface SettingMetadata {
  display_name?: string;
  placeholder?: string;
  help_text?: string;
  group?: string;
  order?: number;
  input_type?: string;
  options?: string[];
  min_value?: number;
  max_value?: number;
  min_length?: number;
  max_length?: number;
  extra?: Record<string, any>;
}

export interface SetSettingRequest {
  value: any;
}

export interface BatchSetSettingsRequest {
  settings: Record<string, any>;
}

// 设置API类
export class SettingsApi {
  // 获取用户设置
  async getUserSettings(category?: string): Promise<Setting[]> {
    const url = category ? `/settings/user?category=${category}` : '/settings/user';
    const response = await apiClient.get<{ success: boolean; data: { items: Setting[] } }>(url);
    return response.data.items;
  }

  // 获取单个用户设置
  async getUserSetting(key: string): Promise<Setting> {
    const response = await apiClient.get<{ success: boolean; data: Setting }>(`/settings/user/${key}`);
    return response.data;
  }

  // 设置用户设置
  async setUserSetting(key: string, value: any): Promise<Setting> {
    const response = await apiClient.put<{ success: boolean; data: Setting }>(`/settings/user/${key}`, { value });
    return response.data;
  }

  // 批量设置用户设置
  async batchSetUserSettings(settings: Record<string, any>): Promise<void> {
    await apiClient.put<{ success: boolean }>('/settings/user/batch', { settings });
  }

  // 删除用户设置（恢复默认值）
  async deleteUserSetting(key: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/settings/user/${key}`);
  }

  // 导出用户设置
  async exportUserSettings(): Promise<Record<string, any>> {
    const response = await apiClient.get<{ success: boolean; data: Record<string, any> }>('/settings/user/export');
    return response.data;
  }

  // 导入用户设置
  async importUserSettings(settings: Record<string, any>): Promise<void> {
    await apiClient.post<{ success: boolean }>('/settings/user/import', { settings });
  }

  // 根据分类获取设置
  async getSettingsByCategory(category: string): Promise<Setting[]> {
    const response = await apiClient.get<{ success: boolean; data: { items: Setting[] } }>(`/settings/category/${category}`);
    return response.data.items;
  }

  // 获取系统设置
  async getSystemSettings(): Promise<Setting[]> {
    const response = await apiClient.get<{ success: boolean; data: { items: Setting[] } }>('/settings/system');
    return response.data.items;
  }

  // 设置系统设置（需要管理员权限）
  async setSystemSetting(key: string, value: any): Promise<Setting> {
    const response = await apiClient.put<{ success: boolean; data: Setting }>(`/settings/system/${key}`, { value });
    return response.data;
  }
}

// 导出单例实例
export const settingsApi = new SettingsApi();