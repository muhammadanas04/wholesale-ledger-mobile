import * as SecureStore from 'expo-secure-store';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes a base64 key string to retrieve the Worker URL and Secret token.
 * Expected decoded format: "https://worker-url.domain|SYNC_SECRET"
 */
export function decodeSyncKey(base64: string): { workerUrl: string; syncSecret: string } {
  const str = base64.trim();
  let buffer = '';

  if (typeof atob === 'function') {
    try {
      buffer = atob(str);
    } catch (e) {
      throw new Error('Invalid Base64 string format');
    }
  } else {
    // Pure JS fallback decoding
    try {
      const lookup = new Uint8Array(256);
      for (let i = 0; i < CHARS.length; i++) {
        lookup[CHARS.charCodeAt(i)] = i;
      }
      const len = str.length;
      let placeHolders = 0;
      if (str[len - 1] === '=') {
        placeHolders = str[len - 2] === '=' ? 2 : 1;
      }
      const bytes = new Uint8Array((len * 3) / 4 - placeHolders);
      let l = len - placeHolders;
      let j = 0;
      for (let i = 0; i < l; i += 4) {
        const w = lookup[str.charCodeAt(i)];
        const x = lookup[str.charCodeAt(i + 1)];
        const y = lookup[str.charCodeAt(i + 2)];
        const z = lookup[str.charCodeAt(i + 3)];
        bytes[j++] = (w << 2) | (x >> 4);
        if (j < bytes.length) bytes[j++] = ((x & 15) << 4) | (y >> 2);
        if (j < bytes.length) bytes[j++] = ((y & 3) << 6) | z;
      }
      buffer = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
    } catch (e) {
      throw new Error('Failed to parse Base64 string');
    }
  }

  const [workerUrl, syncSecret] = buffer.split('|');
  if (!workerUrl || !syncSecret) {
    throw new Error('Sync Key must be in URL|SECRET format');
  }

  return { workerUrl: workerUrl.trim(), syncSecret: syncSecret.trim() };
}

/**
 * Persists sync connection credentials securely.
 */
export async function saveCredentials(workerUrl: string, syncSecret: string): Promise<void> {
  await SecureStore.setItemAsync('sync_url', workerUrl);
  await SecureStore.setItemAsync('sync_secret', syncSecret);
}

/**
 * Loads secure credentials from the device key storage.
 */
export async function loadCredentials(): Promise<{ workerUrl: string; syncSecret: string } | null> {
  const workerUrl = await SecureStore.getItemAsync('sync_url');
  const syncSecret = await SecureStore.getItemAsync('sync_secret');
  
  if (!workerUrl || !syncSecret) return null;
  
  return {
    workerUrl,
    syncSecret,
  };
}

/**
 * Wipes credentials from secure storage.
 */
export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync('sync_url');
  await SecureStore.deleteItemAsync('sync_secret');
}

/**
 * Helper to execute authorized HTTP fetch requests.
 */
async function fetchFromWorker(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: any,
  overrideCreds?: { workerUrl: string; syncSecret: string }
): Promise<any> {
  const creds = overrideCreds || (await loadCredentials());
  if (!creds) {
    throw new Error('Sync connection is not configured');
  }

  const cleanUrl = creds.workerUrl.endsWith('/') ? creds.workerUrl.slice(0, -1) : creds.workerUrl;
  const url = `${cleanUrl}${path}`;

  const headers: HeadersInit = {
    'Authorization': `Bearer ${creds.syncSecret}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with code ${response.status}`);
  }

  return response.json();
}

/**
 * Endpoint queries
 */
export const api = {
  testConnection: async (workerUrl: string, syncSecret: string): Promise<void> => {
    // Tests connection by invoking /pull with a future date to avoid downloading data
    const futureDate = '2099-12-31T23:59:59.000Z';
    await fetchFromWorker(`/pull?since=${encodeURIComponent(futureDate)}`, 'GET', undefined, {
      workerUrl,
      syncSecret,
    });
  },

  pull: async (since: string): Promise<any> => {
    return fetchFromWorker(`/pull?since=${encodeURIComponent(since)}`, 'GET');
  },

  push: async (data: any): Promise<any> => {
    return fetchFromWorker('/push', 'POST', data);
  },

  pullDelivery: async (since: string): Promise<any> => {
    return fetchFromWorker(`/pull/delivery?since=${encodeURIComponent(since)}`, 'GET');
  },

  pushDelivery: async (data: any): Promise<any> => {
    return fetchFromWorker('/push/delivery', 'POST', data);
  },

  getDriverLocations: async (): Promise<any> => {
    return fetchFromWorker('/driver/locations', 'GET');
  },

  getExpenses: async (driverId?: string): Promise<any> => {
    const queryParams = driverId ? `?driverId=${encodeURIComponent(driverId)}` : '';
    return fetchFromWorker(`/admin/expenses${queryParams}`, 'GET');
  },
};
