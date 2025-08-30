import { create } from 'zustand';
import { ToastMessage, ToastType } from '../components/Toast';

interface ToastStore {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  // 便捷方法
  showSuccess: (title: string, message?: string, duration?: number) => void;
  showError: (title: string, message?: string, duration?: number) => void;
  showWarning: (title: string, message?: string, duration?: number) => void;
  showInfo: (title: string, message?: string, duration?: number) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId();
    const newToast: ToastMessage = {
      id,
      duration: 5000, // 默认5秒
      ...toast,
    };
    
    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },

  showSuccess: (title, message, duration = 4000) => {
    get().addToast({
      type: 'success',
      title,
      message,
      duration,
    });
  },

  showError: (title, message, duration = 6000) => {
    get().addToast({
      type: 'error',
      title,
      message,
      duration,
    });
  },

  showWarning: (title, message, duration = 5000) => {
    get().addToast({
      type: 'warning',
      title,
      message,
      duration,
    });
  },

  showInfo: (title, message, duration = 4000) => {
    get().addToast({
      type: 'info',
      title,
      message,
      duration,
    });
  },
}));