import { useToastStore } from '../store/toast';

// 错误类型定义
export interface AppError {
  code?: string;
  message: string;
  details?: string;
  statusCode?: number;
}

// 错误处理配置
interface ErrorHandlerConfig {
  showToast?: boolean;
  logError?: boolean;
  reportError?: boolean;
}

// 默认配置
const defaultConfig: ErrorHandlerConfig = {
  showToast: true,
  logError: true,
  reportError: false,
};

// 错误处理类
export class ErrorHandler {
  private static instance: ErrorHandler;
  private toastStore = useToastStore.getState();

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  // 处理错误
  handle(error: unknown, config: ErrorHandlerConfig = {}): AppError {
    const finalConfig = { ...defaultConfig, ...config };
    const appError = this.normalizeError(error);

    if (finalConfig.logError) {
      this.logError(appError);
    }

    if (finalConfig.showToast) {
      this.showErrorToast(appError);
    }

    if (finalConfig.reportError) {
      this.reportError(appError);
    }

    return appError;
  }

  // 标准化错误
  private normalizeError(error: unknown): AppError {
    if (error instanceof Error) {
      return {
        message: error.message,
        details: error.stack,
      };
    }

    if (typeof error === 'string') {
      return {
        message: error,
      };
    }

    if (error && typeof error === 'object') {
      const errorObj = error as any;
      return {
        code: errorObj.code,
        message: errorObj.message || '未知错误',
        details: errorObj.details,
        statusCode: errorObj.statusCode,
      };
    }

    return {
      message: '未知错误',
    };
  }

  // 记录错误日志
  private logError(error: AppError): void {
    console.error('Application Error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString(),
    });
  }

  // 显示错误提示
  private showErrorToast(error: AppError): void {
    const title = this.getErrorTitle(error);
    const message = this.getErrorMessage(error);
    
    this.toastStore.showError(title, message);
  }

  // 上报错误（可扩展）
  private reportError(error: AppError): void {
    // 这里可以集成错误上报服务，如 Sentry
    console.log('Reporting error:', error);
  }

  // 获取错误标题
  private getErrorTitle(error: AppError): string {
    if (error.statusCode) {
      switch (error.statusCode) {
        case 400:
          return '请求错误';
        case 401:
          return '未授权';
        case 403:
          return '权限不足';
        case 404:
          return '资源不存在';
        case 500:
          return '服务器错误';
        default:
          return '网络错误';
      }
    }

    if (error.code) {
      switch (error.code) {
        case 'NETWORK_ERROR':
          return '网络连接失败';
        case 'TIMEOUT_ERROR':
          return '请求超时';
        case 'VALIDATION_ERROR':
          return '数据验证失败';
        default:
          return '操作失败';
      }
    }

    return '操作失败';
  }

  // 获取错误消息
  private getErrorMessage(error: AppError): string {
    return error.message || '请稍后重试或联系技术支持';
  }
}

// 全局错误处理函数
export const handleError = (error: unknown, config?: ErrorHandlerConfig): AppError => {
  return ErrorHandler.getInstance().handle(error, config);
};

// 异步操作错误处理装饰器
export const withErrorHandling = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config?: ErrorHandlerConfig
): T => {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, config);
      throw error;
    }
  }) as T;
};

// React Hook 错误处理
export const useErrorHandler = () => {
  return {
    handleError: (error: unknown, config?: ErrorHandlerConfig) => {
      return handleError(error, config);
    },
    handleAsyncError: <T>(promise: Promise<T>, config?: ErrorHandlerConfig): Promise<T> => {
      return promise.catch((error) => {
        handleError(error, config);
        throw error;
      });
    },
  };
};