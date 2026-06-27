import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { leafletHtml } from './LeafletHtml';
import type {
  EnrichedDriverLocation,
  LeafletMapRef,
  WebViewIncomingMessage,
} from './types';

interface LeafletMapProps {
  /** Array of enriched driver locations (staleness pre-computed) */
  locations: EnrichedDriverLocation[];
  /** Called when user taps a marker dot on the map */
  onMarkerClick?: (driverId: string) => void;
  /** Called when the Leaflet map finishes initializing */
  onMapReady?: () => void;
  /** Called when OSM tile loading fails repeatedly */
  onTileError?: (failedCount: number) => void;
}

export const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(
  ({ locations, onMarkerClick, onMapReady, onTileError }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const isMapReady = useRef(false);
    // Queue: if locations arrive before MAP_READY, store them and flush after ready
    const pendingLocations = useRef<EnrichedDriverLocation[] | null>(null);

    // ── Inject JS helper ──
    const injectJS = useCallback((js: string) => {
      if (webViewRef.current && isMapReady.current) {
        webViewRef.current.injectJavaScript(`${js}; true;`);
      }
    }, []);

    const prevJsonRef = useRef<string | null>(null);

    // ── Push locations into WebView whenever they change ──
    useEffect(() => {
      if (!isMapReady.current) {
        // Map not ready yet — store for later
        pendingLocations.current = locations;
        return;
      }
      const json = JSON.stringify(locations);
      if (json !== prevJsonRef.current) {
        injectJS(`window.updateDrivers(${json})`);
        prevJsonRef.current = json;
      }
    }, [locations, injectJS]);

    // ── Expose imperative methods to parent ──
    useImperativeHandle(ref, () => ({
      panToDriver(driverId: string) {
        injectJS(`window.panToDriver(${JSON.stringify(driverId)})`);
      },
      fitAllMarkers() {
        injectJS(`window.fitAllMarkers()`);
      },
    }), [injectJS]);

    // ── Handle messages FROM the WebView ──
    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      try {
        const data: WebViewIncomingMessage = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case 'MAP_READY':
            isMapReady.current = true;
            onMapReady?.();
            // Flush any locations that arrived before the map was ready
            if (pendingLocations.current) {
              const json = JSON.stringify(pendingLocations.current);
              webViewRef.current?.injectJavaScript(
                `window.updateDrivers(${json}); true;`
              );
              pendingLocations.current = null;
            }
            break;

          case 'MARKER_CLICK':
            onMarkerClick?.(data.driverId);
            break;

          case 'TILE_ERROR':
            onTileError?.(data.failedCount);
            break;
        }
      } catch (e) {
        console.warn('[LeafletMap] Failed to parse WebView message:', e);
      }
    }, [onMarkerClick, onMapReady, onTileError]);

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          originWhitelist={['https://*', 'http://*', 'file://*', 'data:*']}
          source={{ html: leafletHtml }}
          style={styles.map}
          onMessage={handleMessage}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          domStorageEnabled
          javaScriptEnabled
          onShouldStartLoadWithRequest={(request) => {
            // Only allow local file loads or unpkg leaflet assets
            return request.url.startsWith('file://') || 
                   request.url.startsWith('data:') || 
                   request.url.startsWith('https://unpkg.com') ||
                   request.url.startsWith('about:blank');
          }}
          androidLayerType="hardware"
        />
      </View>
    );
  }
);

LeafletMap.displayName = 'LeafletMap';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
