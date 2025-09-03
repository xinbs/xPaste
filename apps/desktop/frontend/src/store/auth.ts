import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/lib/api';
import { useToastStore } from './toast';
import { getOrCreateDeviceId } from '@/lib/device';

interface User {
  id: string;
  username: string;
  email: string;
}

interface DeviceCapabilities {
  clipboard_read: boolean;
  clipboard_write: boolean;
  file_upload: boolean;
  image_ocr: boolean;
  notifications: boolean;
  websocket: boolean;
}

interface Device {
  id: number;           // 数据库主键
  device_id: string;    // 设备标识符
  name: string;
  platform: string;
  version: string;
  capabilities: DeviceCapabilities;
  is_current: boolean;
  last_seen: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  currentDevice: Device | null;
  devices: Device[];
  isLoading: boolean;
  error: string | null;
  token: string | null;
  
  // Actions
  validateToken: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  registerDevice: (deviceInfo: Omit<Device, 'id' | 'is_current' | 'last_seen'>) => Promise<boolean>;
  fetchDevices: (signal?: AbortSignal) => Promise<void>;
  renameDevice: (deviceId: string, newName: string) => Promise<boolean>;
  deleteDevice: (deviceId: string) => Promise<boolean>;
  clearError: () => void;
  clearStorage: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      currentDevice: null,
      devices: [],
      isLoading: false,
      error: null,
      token: null,

      // 验证token有效性
      validateToken: async () => {
        const { token } = get();
        if (!token) {
          return false;
        }

        // 设置token到apiClient
        apiClient.setToken(token);

        try {
          // 尝试调用一个需要认证的API来验证token
          const response = await apiClient.get<{success: boolean; message: string; data: any}>('/auth/profile');
          if (response.success) {
            // token有效，更新用户信息
            set({ user: response.data });
            return true;
          } else {
            // token无效，清除认证状态
            get().logout();
            return false;
          }
        } catch (error) {
          // token无效，清除认证状态
          get().logout();
          return false;
        }
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          // 获取当前设备ID
          const deviceId = getOrCreateDeviceId();
          const response = await apiClient.login(username, password, deviceId);
          if (response.success) {
            set({
              user: response.data.user,
              isAuthenticated: true,
              token: response.data.access_token,
              isLoading: false,
            });
            
            // 登录成功后自动尝试注册设备
            try {
              const { getDeviceName, getDevicePlatform } = await import('../lib/device');
              const deviceInfo = {
                device_id: deviceId,
                name: getDeviceName(),
                platform: getDevicePlatform(),
                version: '1.0.0',
                capabilities: {
                  clipboard_read: true,
                  clipboard_write: true,
                  file_upload: true,
                  image_ocr: false,
                  notifications: true,
                  websocket: true
                }
              };
              
              const deviceResponse = await apiClient.registerDevice(deviceInfo);
              if (deviceResponse.success) {
                set({ currentDevice: deviceResponse.data });
              }
            } catch (deviceError) {
              // 设备注册失败不影响登录，用户可以稍后手动注册
              console.warn('Auto device registration failed:', deviceError);
            }
            
            return true;
          } else {
            set({ error: response.message, isLoading: false });
            return false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '登录失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('登录失败', errorMessage);
          return false;
        }
      },

      register: async (username: string, email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.register(username, email, password);
          if (response.success) {
            set({ isLoading: false });
            return true;
          } else {
            set({ error: response.message, isLoading: false });
            return false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '注册失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('注册失败', errorMessage);
          return false;
        }
      },

      logout: () => {
        apiClient.clearToken();
        set({
          user: null,
          isAuthenticated: false,
          currentDevice: null,
          devices: [],
          token: null,
          error: null,
        });
      },

      registerDevice: async (deviceInfo) => {
        set({ isLoading: true, error: null });
        try {
          // 获取设备ID并添加到注册信息中
          const { getOrCreateDeviceId } = await import('../lib/device');
          const deviceId = getOrCreateDeviceId();
          const deviceInfoWithId = {
            ...deviceInfo,
            device_id: deviceId
          };
          
          const response = await apiClient.registerDevice(deviceInfoWithId);
          if (response.success) {
            const newDevice = response.data;
            set({
              currentDevice: newDevice,
              devices: [...get().devices, newDevice],
              isLoading: false,
            });
            return true;
          } else {
            set({ error: response.message, isLoading: false });
            return false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '设备注册失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('设备注册失败', errorMessage);
          return false;
        }
      },

      fetchDevices: async (signal?: AbortSignal) => {
        set({ isLoading: true, error: null });
        console.log('设备Store: 开始获取设备列表...');
        
        try {
          const response = await apiClient.getDevices(signal);
          console.log('设备Store: API响应', {
            success: response.success,
            message: response.message,
            deviceCount: response.data?.items?.length || 0,
            fullResponse: response
          });
          
          if (response.success) {
            const devices = response.data.items;
            console.log('设备Store: 成功获取', devices.length, '个设备');
            const { currentDevice } = get();
            
            // 检查currentDevice是否仍然存在于设备列表中
            let updatedCurrentDevice = currentDevice;
            if (currentDevice && devices.length > 0 && !devices.find(device => device.id === currentDevice.id)) {
              console.warn('当前设备不在设备列表中，但保持currentDevice状态以避免数据丢失');
            }
            
            set({
              devices,
              currentDevice: updatedCurrentDevice,
              isLoading: false,
              error: null, // 清除错误状态
            });
          } else {
            console.error('设备Store: API返回失败', response.message);
            set({ error: response.message, isLoading: false });
            // 只有在真正失败时才显示错误
            useToastStore.getState().showError('获取设备列表失败', response.message);
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('设备Store: 请求被取消');
            set({ isLoading: false });
            return;
          }
          
          console.error('设备Store: 网络请求异常', {
            error,
            message: error instanceof Error ? error.message : '未知错误',
            stack: error instanceof Error ? error.stack : undefined
          });
          
          const errorMessage = error instanceof Error ? error.message : '获取设备列表失败';
          set({ error: errorMessage, isLoading: false });
          
          // 检查是否是网络错误
          const isNetworkError = error instanceof Error && (
            error.message.includes('fetch') ||
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('ERR_NETWORK') ||
            error.message.includes('请求超时或被取消')
          );
          
          if (isNetworkError) {
            console.log('检测到网络错误，延迟3秒后检查是否需要显示错误提示');
            // 延迟检查，给其他请求重试的机会
            setTimeout(() => {
              const currentState = get();
              // 只有在3秒后仍然有错误且没有设备数据时才显示错误
              if (currentState.error && currentState.devices.length === 0) {
                useToastStore.getState().showError('获取设备列表失败', errorMessage);
              }
            }, 3000);
          } else {
            useToastStore.getState().showError('获取设备列表失败', errorMessage);
            throw error; // 只有在非网络错误时才重新抛出
          }
        }
      },

      renameDevice: async (deviceId: string, newName: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.updateDevice(deviceId, { name: newName });
          if (response.success) {
            // 更新本地设备列表
            const { devices, currentDevice } = get();
            const updatedDevices = devices.map(device => 
              device.device_id === deviceId ? { ...device, name: newName } : device
            );
            const updatedCurrentDevice = currentDevice?.device_id === deviceId 
              ? { ...currentDevice, name: newName } 
              : currentDevice;
            
            set({ 
              devices: updatedDevices,
              currentDevice: updatedCurrentDevice,
              isLoading: false 
            });
            return true;
          } else {
            set({ error: response.message, isLoading: false });
            return false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '重命名设备失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('重命名设备失败', errorMessage);
          return false;
        }
      },

      deleteDevice: async (deviceId: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.deleteDevice(deviceId);
          if (response.success) {
            // 从本地设备列表中移除
            const { devices } = get();
            const updatedDevices = devices.filter(device => device.device_id !== deviceId);
            set({ devices: updatedDevices, isLoading: false });
            return true;
          } else {
            set({ error: response.message, isLoading: false });
            return false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '删除设备失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('删除设备失败', errorMessage);
          return false;
        }
      },

      clearError: () => set({ error: null }),
      
      // 清除本地存储和认证状态
      clearStorage: () => {
        // 清除zustand持久化存储
        localStorage.removeItem('auth-storage');
        sessionStorage.clear();
        // 重置状态
        set({
          user: null,
          isAuthenticated: false,
          currentDevice: null,
          devices: [],
          token: null,
          error: null,
          isLoading: false,
        });
        // 清除API客户端token
        apiClient.clearToken();
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        currentDevice: state.currentDevice,
        token: state.token,
      }),
      onRehydrateStorage: () => (state) => {
        // 在 store 恢复后，如果有 token 则设置到 apiClient
        if (state?.token) {
          apiClient.setToken(state.token);
        }
      },
    }
  )
);