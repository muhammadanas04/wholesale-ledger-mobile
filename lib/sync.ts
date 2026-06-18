import { Database, Model } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import { AppState, AppStateStatus } from 'react-native';
import { api } from './api';
import { useAppStore } from '../store/app';

// Flag to prevent overlapping sync cycles
let isSyncing = false;

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Utility helper to perform batch check-and-branch upsert on a collection.
 */
async function prepareUpsertForTable(
  database: Database,
  tableName: string,
  remoteRecords: any[]
): Promise<any[]> {
  if (!remoteRecords || remoteRecords.length === 0) return [];

  const collection = database.collections.get(tableName);
  const remoteIds = remoteRecords.map((r) => String(r.id));

  // Retrieve existing local records matching remote IDs in one query
  const localRecords = await collection.query(Q.where('id', Q.oneOf(remoteIds))).fetch();
  const localRecordMap = new Map<string, Model>();
  localRecords.forEach((r) => localRecordMap.set(r.id, r));

  const prepared: any[] = [];

  for (const remote of remoteRecords) {
    const local = localRecordMap.get(String(remote.id));

    if (local) {
      // Local record exists -> compare timestamps
      const remoteTime = new Date(remote.updated_at || '1970-01-01T00:00:00.000Z').getTime();
      const localRaw = local._raw as any;
      const localTime = new Date(localRaw.updated_at || '1970-01-01T00:00:00.000Z').getTime();

      // Update only if remote is newer
      if (remoteTime > localTime) {
        prepared.push(
          local.prepareUpdate((record) => {
            const columns = Object.keys(remote).filter((k) => k !== 'id');
            columns.forEach((col) => {
              const propName = toCamelCase(col);
              let val = remote[col];
              if (col.endsWith('_id') && val !== null && val !== undefined) {
                val = String(val);
              }
              (record as any)[propName] = val;
            });
            (record as any).synced = 1; // Mark synced locally
          })
        );
      }
    } else {
      // Local record does not exist -> prepare create
      prepared.push(
        collection.prepareCreate((record) => {
          record._raw.id = String(remote.id); // set custom D1 UUID string
          const columns = Object.keys(remote).filter((k) => k !== 'id');
          columns.forEach((col) => {
            const propName = toCamelCase(col);
            let val = remote[col];
            if (col.endsWith('_id') && val !== null && val !== undefined) {
              val = String(val);
            }
            (record as any)[propName] = val;
          });
          (record as any).synced = 1; // Mark synced locally
        })
      );
    }
  }

  return prepared;
}

/**
 * Custom sync pull implementation.
 */
export async function pullSync(database: Database): Promise<void> {
  const store = useAppStore.getState();
  if (!store.syncConfig) return;

  const since = store.lastSyncTime;
  const startPullTime = new Date().toISOString();

  // 1. Pull Core Business changes
  const coreData = await api.pull(since);
  const coreTables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'tmp_records'];
  const preparedCore: any[] = [];

  for (const table of coreTables) {
    const tableData = coreData[table] || [];
    const prepared = await prepareUpsertForTable(database, table, tableData);
    preparedCore.push(...prepared);
  }

  // 2. Pull Delivery Module changes
  const deliveryData = await api.pullDelivery(since);
  const deliveryTables = ['drivers', 'deliveries', 'delivery_items'];
  const preparedDelivery: any[] = [];

  for (const table of deliveryTables) {
    const tableData = deliveryData[table] || [];
    const prepared = await prepareUpsertForTable(database, table, tableData);
    preparedDelivery.push(...prepared);
  }

  // Commit all pulls in a single batch write
  const allPrepared = [...preparedCore, ...preparedDelivery];
  if (allPrepared.length > 0) {
    await database.write(() => database.batch(...allPrepared));
  }

  // Update last sync time
  store.setLastSyncTime(startPullTime);
}

/**
 * Custom sync push implementation.
 */
export async function pushSync(database: Database): Promise<void> {
  const store = useAppStore.getState();
  if (!store.syncConfig) return;

  // 1. Push Core Business changes
  const coreTables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'tmp_records'];
  const corePayload: any = {};
  const corePushedRecordsMap = new Map<string, Model[]>();
  const corePushTimes = new Map<string, string>(); // recordId -> updatedAt ISO string
  let hasCoreChanges = false;

  for (const table of coreTables) {
    const unsyncedRecords = await database.collections.get(table).query(Q.where('synced', 0)).fetch();
    if (unsyncedRecords.length > 0) {
      corePayload[table] = unsyncedRecords.map((r) => {
        const raw = { ...r._raw };
        corePushTimes.set(r.id, (raw as any).updated_at || '');
        // Remove WatermelonDB metadata fields if they conflict (D1 schema doesn't have _status / _changed)
        delete (raw as any)._status;
        delete (raw as any)._changed;
        return raw;
      });
      corePushedRecordsMap.set(table, unsyncedRecords);
      hasCoreChanges = true;
    }
  }

  if (hasCoreChanges) {
    await api.push(corePayload);
    // Success -> Mark records synced = 1 only if they weren't edited while push was in-flight
    const preparedUpdates: any[] = [];
    await database.write(async () => {
      for (const [table, records] of corePushedRecordsMap.entries()) {
        const collection = database.collections.get(table);
        for (const r of records) {
          try {
            const latestRecord = await collection.find(r.id);
            const latestRaw = latestRecord._raw as any;
            const pushedTime = corePushTimes.get(r.id);

            if (latestRaw.updated_at === pushedTime) {
              preparedUpdates.push(
                latestRecord.prepareUpdate((record) => {
                  (record as any).synced = 1;
                })
              );
            } else {
              console.log(`[Sync] Concurrency conflict detected on push for ${table} ${r.id}, skipping synced=1 update`);
            }
          } catch (err) {
            // Record was deleted locally during sync -> ignore
          }
        }
      }
      
      if (preparedUpdates.length > 0) {
        await database.batch(...preparedUpdates);
      }
    });
  }

  // 2. Push Delivery Module changes
  const deliveryTables = ['drivers', 'deliveries', 'delivery_items'];
  const deliveryPayload: any = {};
  const deliveryPushedRecordsMap = new Map<string, Model[]>();
  const deliveryPushTimes = new Map<string, string>(); // recordId -> updatedAt ISO string
  let hasDeliveryChanges = false;

  for (const table of deliveryTables) {
    const unsyncedRecords = await database.collections.get(table).query(Q.where('synced', 0)).fetch();
    if (unsyncedRecords.length > 0) {
      deliveryPayload[table] = unsyncedRecords.map((r) => {
        const raw = { ...r._raw };
        deliveryPushTimes.set(r.id, (raw as any).updated_at || '');
        delete (raw as any)._status;
        delete (raw as any)._changed;
        return raw;
      });
      deliveryPushedRecordsMap.set(table, unsyncedRecords);
      hasDeliveryChanges = true;
    }
  }

  if (hasDeliveryChanges) {
    await api.pushDelivery(deliveryPayload);
    // Success -> Mark records synced = 1 only if they weren't edited while push was in-flight
    const preparedUpdates: any[] = [];
    await database.write(async () => {
      for (const [table, records] of deliveryPushedRecordsMap.entries()) {
        const collection = database.collections.get(table);
        for (const r of records) {
          try {
            const latestRecord = await collection.find(r.id);
            const latestRaw = latestRecord._raw as any;
            const pushedTime = deliveryPushTimes.get(r.id);

            if (latestRaw.updated_at === pushedTime) {
              preparedUpdates.push(
                latestRecord.prepareUpdate((record) => {
                  (record as any).synced = 1;
                })
              );
            } else {
              console.log(`[Sync] Concurrency conflict detected on push for ${table} ${r.id}, skipping synced=1 update`);
            }
          } catch (err) {
            // Record was deleted locally during sync -> ignore
          }
        }
      }
      
      if (preparedUpdates.length > 0) {
        await database.batch(...preparedUpdates);
      }
    });
  }
}

/**
 * Main synchronisation loop combining push and pull.
 */
export async function runSync(database: Database): Promise<void> {
  if (isSyncing) return;
  const store = useAppStore.getState();
  if (!store.syncConfig) {
    store.setSyncStatus('not-configured');
    return;
  }

  isSyncing = true;
  store.setSyncStatus('syncing');

  try {
    // 1. Push local changes first (last-write-wins)
    await pushSync(database);
    // 2. Pull remote changes next
    await pullSync(database);
    
    // --- Local tmp_records cleanup ---
    try {
      const days = store.tmpRetentionDays || 3;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

      const expired = await database.collections
        .get('tmp_records')
        .query(Q.where('date', Q.lt(cutoffStr)))
        .fetch();

      if (expired.length > 0) {
        await database.write(async () => {
          await database.batch(
            ...expired.map((r) => r.prepareDestroyPermanently())
          );
        });
        console.log(`[Sync] Cleaned up ${expired.length} expired tmp_records`);
      }
    } catch (e) {
      console.error('[Sync] tmp_records cleanup error:', e);
    }
    
    store.setSyncStatus('idle');
  } catch (e) {
    console.error('Offline Sync Loop failed:', e);
    store.setSyncStatus('error');
    throw e;
  } finally {
    isSyncing = false;
  }
}

/**
 * Setup foreground listeners and app indicators.
 */
export function setupSyncTriggers(database: Database): () => void {
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      try {
        await runSync(database);
      } catch (e) {
        // Silently capture background triggers to prevent crash dialogs
      }
    }
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);

  // Return unsubscribe cleanup hook
  return () => {
    subscription.remove();
  };
}
