import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/lib/api';
import { useToastStore } from './toast';

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
  id: string;
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
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  registerDevice: (deviceInfo: Omit<Device, 'id' | 'is_current' | 'last_seen'>) => Promise<boolean>;
  fetchDevices: () => Promise<void>;
  renameDevice: (deviceId: string, newName: string) => Promise<boolean>;
  deleteDevice: (deviceId: string) => Promise<boolean>;
  clearError: () => void;
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

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.login(username, password);
          if (response.success) {
            set({
              user: response.data.user,
              isAuthenticated: true,
              token: response.data.access_token,
              isLoading: false,
            });
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
          const response = await apiClient.registerDevice(deviceInfo);
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

      fetchDevices: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.getDevices();
          if (response.success) {
            set({
              devices: response.data.items,
              isLoading: false,
            });
          } else {
            set({ error: response.message, isLoading: false });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '获取设备列表失败';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().showError('获取设备列表失败', errorMessage);
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
              device.id === deviceId ? { ...device, name: newName } : device
            );
            const updatedCurrentDevice = currentDevice?.id === deviceId 
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
            const updatedDevices = devices.filter(device => device.id !== deviceId);
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
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        currentDevice: state.currentDevice,
        token: state.token,
      }),
    }
  )
);