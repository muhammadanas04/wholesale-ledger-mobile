/**
 * Raw driver location as returned by GET /driver/locations
 */
export interface RawDriverLocation {
  driver_id: string;
  driver_name: string;
  phone: string;
  latitude: number;
  longitude: number;
  recorded_at: string; // ISO 8601
}

/**
 * Enriched driver location computed in React Native before passing to WebView.
 * The WebView never computes staleness — it just reads the boolean.
 */
export interface EnrichedDriverLocation {
  id: string;           // = driver_id
  name: string;         // = driver_name
  phone: string;
  latitude: number;
  longitude: number;
  isStale: boolean;     // true if (now - recorded_at) > 15 minutes OR invalid date
  lastSeenText: string; // "Updated: 14:30" or "Last seen 23 min ago" or "N/A"
}

/**
 * Messages sent FROM the WebView TO React Native via postMessage.
 * Discriminated union on `type`.
 */
export type WebViewIncomingMessage =
  | { type: 'MAP_READY' }
  | { type: 'MARKER_CLICK'; driverId: string }
  | { type: 'TILE_ERROR'; failedCount: number };

/**
 * Imperative methods exposed by LeafletMap via forwardRef.
 * Called from map.tsx when the user taps carousel cards or recenter button.
 */
export interface LeafletMapRef {
  /** Pan and zoom the map to a specific driver's marker */
  panToDriver: (driverId: string) => void;
  /** Fit bounds to include all currently visible markers */
  fitAllMarkers: () => void;
}

/**
 * Default map center (Jhunjhunu, Rajasthan).
 * Used as the initial view before any driver data loads.
 */
export const DEFAULT_MAP_CENTER = {
  latitude: 27.6094,
  longitude: 75.1398,
  zoom: 12,
} as const;

/**
 * Staleness threshold in minutes.
 * Drivers not reporting for longer than this are shown as gray/stale.
 */
export const STALE_THRESHOLD_MINUTES = 15;
