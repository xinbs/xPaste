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

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      serverConfig: DEFAULT_CONFIG,
      isConfigured: false,
      
      setServerConfig: (config: ServerConfig) => {
        set({ 
          serverConfig: config, 
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
        return `${serverConfig.baseUrl}/api/v1`;
      },
      
      getWsUrl: () => {
        const { serverConfig } = get();
        return serverConfig.wsUrl;
      }
    }),
    {
      name: 'xpaste-config',
      version: 1,
    }
  )
);