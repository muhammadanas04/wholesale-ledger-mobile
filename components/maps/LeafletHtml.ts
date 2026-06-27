/**
 * Complete HTML template for the Leaflet map.
 * 
 * Source files:
 *   CSS: https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
 *   JS:  https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
 */
export const leafletHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src https://unpkg.com https://*.tile.openstreetmap.org data:; connect-src 'none';">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html, #map {
      height: 100%;
      width: 100%;
      background: #F8FAFC;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
    }

    /* ── Active driver marker ── */
    .driver-marker {
      background: #4F46E5;
      border: 2.5px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
      transition: transform 0.2s ease;
    }
    .driver-marker:hover {
      transform: scale(1.3);
    }

    /* ── Stale driver marker (offline > 15 min) ── */
    .stale-marker {
      background: #94A3B8;
      border: 2.5px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      opacity: 0.7;
    }

    /* ── Popup styling (shown on marker tap) ── */
    .leaflet-popup-content-wrapper {
      border-radius: 12px !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12) !important;
      padding: 0 !important;
    }
    .leaflet-popup-content {
      margin: 0 !important;
      min-width: 160px;
    }
    .leaflet-popup-tip {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12) !important;
    }
    .driver-popup {
      padding: 12px 14px;
    }
    .driver-popup-name {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-weight: 700;
      font-size: 13px;
      color: #0F172A;
      margin-bottom: 2px;
    }
    .driver-popup-phone {
      font-family: 'SF Mono', 'Menlo', monospace;
      font-size: 11px;
      color: #94A3B8;
    }
    .driver-popup-time {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px;
      font-weight: 600;
      color: #64748B;
      margin-top: 6px;
    }

    /* ── Hide Leaflet attribution (we credit in the app UI instead) ── */
    .leaflet-control-attribution {
      font-size: 8px !important;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // ═══════════════════════════════════════════════════════
    //  MAP INITIALIZATION
    // ═══════════════════════════════════════════════════════

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView([27.6094, 75.1398], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OSM contributors',
      errorTileUrl: '',
    }).addTo(map)
      .on('tileerror', function(e) {
        tileErrorCount++;
        if (tileErrorCount >= 5 && !tileErrorReported) {
          tileErrorReported = true;
          sendMessage({ type: 'TILE_ERROR', failedCount: tileErrorCount });
        }
      });

    var tileErrorCount = 0;
    var tileErrorReported = false;

    // Store all markers keyed by driver ID
    var markers = {};
    // Store all popups keyed by driver ID (for programmatic open)
    var driverData = {};

    // ═══════════════════════════════════════════════════════
    //  HELPER: Send message to React Native
    // ═══════════════════════════════════════════════════════

    function sendMessage(obj) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    }

    // Notify RN that the map is ready
    map.whenReady(function() {
      sendMessage({ type: 'MAP_READY' });
    });

    // ═══════════════════════════════════════════════════════
    //  CORE: updateDrivers(drivers)
    //  Called from React Native via injectJavaScript.
    //  Receives the FULL array of enriched drivers every poll.
    //  Handles: add new markers, update existing, remove gone.
    // ═══════════════════════════════════════════════════════

    window.updateDrivers = function(drivers) {
      var incomingIds = [];

      drivers.forEach(function(driver) {
        var id = driver.id;
        incomingIds.push(id);

        // Store data for popup rendering
        driverData[id] = driver;

        var iconClass = driver.isStale ? 'stale-marker' : 'driver-marker';
        var icon = L.divIcon({
          className: iconClass,
          iconSize: [14, 14],
          iconAnchor: [7, 7],  // Center the circle on the coordinate
          popupAnchor: [0, -10],
        });

        var popupHtml =
          '<div class="driver-popup">' +
            '<div class="driver-popup-name">' + escapeHtml(driver.name) + '</div>' +
            '<div class="driver-popup-phone">' + escapeHtml(driver.phone) + '</div>' +
            '<div class="driver-popup-time">' + escapeHtml(driver.lastSeenText) + '</div>' +
          '</div>';

        if (markers[id]) {
          // ── UPDATE existing marker ──
          markers[id].setLatLng([driver.latitude, driver.longitude]);
          markers[id].setIcon(icon);
          markers[id].getPopup().setContent(popupHtml);
        } else {
          // ── ADD new marker ──
          var marker = L.marker([driver.latitude, driver.longitude], { icon: icon })
            .addTo(map)
            .bindPopup(popupHtml, {
              closeButton: false,
              offset: [0, -4],
            })
            .on('click', function() {
              sendMessage({ type: 'MARKER_CLICK', driverId: id });
            });

          markers[id] = marker;
        }
      });

      // ── REMOVE markers for drivers no longer in the response ──
      var existingIds = Object.keys(markers);
      existingIds.forEach(function(id) {
        if (incomingIds.indexOf(id) === -1) {
          map.removeLayer(markers[id]);
          delete markers[id];
          delete driverData[id];
        }
      });
    };

    // ═══════════════════════════════════════════════════════
    //  COMMAND: panToDriver(driverId)
    //  Called when user taps a carousel card in React Native.
    //  Smoothly pans to that driver and opens their popup.
    // ═══════════════════════════════════════════════════════

    window.panToDriver = function(driverId) {
      var marker = markers[driverId];
      if (!marker) return;

      map.flyTo(marker.getLatLng(), 16, { duration: 0.8 });

      // Open popup after pan animation completes
      setTimeout(function() {
        marker.openPopup();
      }, 900);
    };

    // ═══════════════════════════════════════════════════════
    //  COMMAND: fitAllMarkers()
    //  Called when user taps the "recenter" button.
    //  Fits bounds to show all active markers with padding.
    // ═══════════════════════════════════════════════════════

    window.fitAllMarkers = function() {
      var ids = Object.keys(markers);
      if (ids.length === 0) return;

      if (ids.length === 1) {
        map.flyTo(markers[ids[0]].getLatLng(), 15, { duration: 0.8 });
        return;
      }

      var group = L.featureGroup(ids.map(function(id) { return markers[id]; }));
      map.flyToBounds(group.getBounds(), {
        padding: [60, 60],
        maxZoom: 16,
        duration: 0.8,
      });
    };

    // ═══════════════════════════════════════════════════════
    //  UTILITY: Escape HTML to prevent XSS in popup content
    // ═══════════════════════════════════════════════════════

    function escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>
`;
