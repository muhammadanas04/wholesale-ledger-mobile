import { create } from 'zustand';

export interface SyncConfig {
  workerUrl: string;
  syncSecret: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'not-configured';

interface AppState {
  syncConfig: SyncConfig | null;
  lastSyncTime: string;
  syncStatus: SyncStatus;
  setSyncConfig: (config: SyncConfig | null) => void;
  setLastSyncTime: (time: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
}

export const useAppStore = create<AppState>((set) => ({
  syncConfig: null,
  lastSyncTime: '1970-01-01T00:00:00.000Z',
  syncStatus: 'not-configured',
  setSyncConfig: (config) => set({ 
    syncConfig: config, 
    syncStatus: config ? 'idle' : 'not-configured' 
  }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setSyncStatus: (status) => set({ syncStatus: status }),
}));
