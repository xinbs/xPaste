import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ServerConfig {
  baseUrl: string;
  wsUrl: string;
}

interface ConfigState {
  serverConfig: ServerConfig;
  isConfigured: boolean;
  
  // Actions
  setServerConfig: (config: ServerConfig) => void;
  resetConfig: () => void;
  getApiUrl: () => string;
  getWsUrl: () => string;
}

const DEFAULT_CONFIG: ServerConfig = {
  baseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080'
};

function stripTrailingSlashes(url: string) {
  return String(url || '').replace(/\/+$/, '');
}

function normalizeBaseUrl(baseUrl: string) {
  const u = stripTrailingSlashes(baseUrl);
  return u.replace(/\/api\/v1$/i, '');
}

function normalizeWsUrl(wsUrl: string) {
  const u = stripTrailingSlashes(wsUrl);
  return u.replace(/\/ws$/i, '');
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      serverConfig: DEFAULT_CONFIG,
      isConfigured: false,
      
      setServerConfig: (config: ServerConfig) => {
        const normalized: ServerConfig = {
          baseUrl: normalizeBaseUrl(config.baseUrl),
          wsUrl: normalizeWsUrl(config.wsUrl),
        };
        set({ 
          serverConfig: normalized, 
          isConfigured: true 
        });
      },
      
      resetConfig: () => {
        set({ 
          serverConfig: DEFAULT_CONFIG, 
          isConfigured: false 
        });
      },
      
      getApiUrl: () => {
        const { serverConfig } = get();
        const base = normalizeBaseUrl(serverConfig.baseUrl);
        return `${base || DEFAULT_CONFIG.baseUrl}/api/v1`;
      },
      
      getWsUrl: () => {
        const { serverConfig } = get();
        const ws = normalizeWsUrl(serverConfig.wsUrl);
        return ws || DEFAULT_CONFIG.wsUrl;
      }
    }),
    {
      name: 'xpaste-config',
      version: 1,
    }
  )
);
