import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { loadCredentials } from '../lib/api';

export interface SyncConfig {
  workerUrl: string;
  syncSecret: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'not-configured';
export type ThemeSetting = 'light' | 'dark' | 'system';

interface AppState {
  syncConfig: SyncConfig | null;
  lastSyncTime: string;
  syncStatus: SyncStatus;
  themeSetting: ThemeSetting;
  shopName: string;
  tmpRetentionDays: number;
  tabBarHidden: boolean;
  setSyncConfig: (config: SyncConfig | null) => void;
  setLastSyncTime: (time: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setThemeSetting: (theme: ThemeSetting) => Promise<void>;
  setShopName: (name: string) => Promise<void>;
  setTmpRetentionDays: (days: number) => Promise<void>;
  setTabBarHidden: (hidden: boolean) => void;
  initStore: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  syncConfig: null,
  lastSyncTime: '1970-01-01T00:00:00.000Z',
  syncStatus: 'not-configured',
  themeSetting: 'system',
  shopName: 'Wholesale Ledger',
  tmpRetentionDays: 3,
  tabBarHidden: false,
  
  setSyncConfig: (config) => set({ 
    syncConfig: config, 
    syncStatus: config ? 'idle' : 'not-configured' 
  }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setTabBarHidden: (hidden) => set({ tabBarHidden: hidden }),
  
  setThemeSetting: async (theme) => {
    set({ themeSetting: theme });
    try {
      await SecureStore.setItemAsync('theme_setting', theme);
    } catch (e) {
      console.error('Failed to save theme setting to SecureStore:', e);
    }
  },

  setShopName: async (name) => {
    const finalName = name.trim() || 'Wholesale Ledger';
    set({ shopName: finalName });
    try {
      await SecureStore.setItemAsync('shop_name', finalName);
    } catch (e) {
      console.error('Failed to save shop name to SecureStore:', e);
    }
  },

  setTmpRetentionDays: async (days) => {
    const validDays = Math.max(1, Math.min(30, days)); // clamp 1–30
    set({ tmpRetentionDays: validDays });
    try {
      await SecureStore.setItemAsync('tmp_retention_days', String(validDays));
    } catch (e) {
      console.error('Failed to save tmp retention days:', e);
    }
  },

  initStore: async () => {
    try {
      const creds = await loadCredentials();
      if (creds) {
        set({ syncConfig: creds, syncStatus: 'idle' });
      } else {
        set({ syncConfig: null, syncStatus: 'not-configured' });
      }
      
      const savedTheme = await SecureStore.getItemAsync('theme_setting');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        set({ themeSetting: savedTheme as ThemeSetting });
      }

      const savedShopName = await SecureStore.getItemAsync('shop_name');
      if (savedShopName) {
        set({ shopName: savedShopName });
      }

      const savedRetention = await SecureStore.getItemAsync('tmp_retention_days');
      if (savedRetention) {
        const parsed = parseInt(savedRetention, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
          set({ tmpRetentionDays: parsed });
        }
      }
    } catch (e) {
      console.error('Failed to load store credentials, theme, or shop name:', e);
      set({ syncConfig: null, syncStatus: 'not-configured' });
    }
  },
}));
