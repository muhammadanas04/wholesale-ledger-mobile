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
  setSyncConfig: (config: SyncConfig | null) => void;
  setLastSyncTime: (time: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setThemeSetting: (theme: ThemeSetting) => Promise<void>;
  initStore: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  syncConfig: null,
  lastSyncTime: '1970-01-01T00:00:00.000Z',
  syncStatus: 'not-configured',
  themeSetting: 'system',
  
  setSyncConfig: (config) => set({ 
    syncConfig: config, 
    syncStatus: config ? 'idle' : 'not-configured' 
  }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  
  setThemeSetting: async (theme) => {
    set({ themeSetting: theme });
    try {
      await SecureStore.setItemAsync('theme_setting', theme);
    } catch (e) {
      console.error('Failed to save theme setting to SecureStore:', e);
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
    } catch (e) {
      console.error('Failed to load store credentials or theme:', e);
      set({ syncConfig: null, syncStatus: 'not-configured' });
    }
  },
}));
