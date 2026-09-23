import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { GeoPoint } from "@sahayak/domain";

/**
 * Leaflet-in-a-WebView, standing in for react-native-maps on Android: the native Google Maps SDK
 * needs a per-app API key baked into AndroidManifest.xml at prebuild time, which Expo Go (a fixed,
 * un-customizable binary) can never pick up - confirmed by testing, not assumed. A WebView has no
 * such requirement; it fetches OSM tiles the same way any browser tab would.
 *
 * The HTML/JS below is built once per mount (`source={{ html }}` never changes) and driven entirely
 * by postMessage afterwards, so the page never reloads - a reload would drop every marker and flash
 * the tile layer blank. Two channels:
 *  - RN -> WebView: `post({ cmd: ... })`, handled by `handleCommand` in the page script.
 *  - WebView -> RN: `window.ReactNativeWebView.postMessage(...)`, read in `onMessage` below.
 */

export interface WebMarkerSpec {
  id: string;
  coordinate: GeoPoint;
  /** Raw HTML for the marker's Leaflet divIcon. Caller-built, so it can reuse @sahayak/ui color tokens. */
  html: string;
  /** Icon anchor in px from the HTML's top-left - e.g. half the badge size to centre it on the coordinate. */
  anchor: [number, number];
  zIndexOffset?: number;
}

export interface OsmWebMapRoute {
  coordinates: GeoPoint[];
  color?: string;
  dashed?: boolean;
}

export interface DriverMarkerMove {
  id: string;
  coordinate: GeoPoint;
  /** Only used the first time this id is seen (marker creation); ignored on later moves of the same id. */
  html: string;
  anchor: [number, number];
  headingDeg?: number;
  durationMs?: number;
}

export interface OsmWebMapHandle {
  flyTo: (center: GeoPoint, zoom?: number, durationMs?: number) => void;
  fitBounds: (coordinates: GeoPoint[]) => void;
  zoomBy: (delta: number) => void;
  /** Bypasses React entirely (no re-render, no postMessage diffing) - for GPS-tick-frequency updates. */
  moveMarker: (move: DriverMarkerMove) => void;
}

export interface OsmWebMapProps {
  center: GeoPoint;
  zoom?: number;
  tileUrlTemplate: string;
  markers?: WebMarkerSpec[];
  route?: OsmWebMapRoute | null;
  onMoveEnd?: (center: GeoPoint, isUserGesture: boolean) => void;
  onDragStart?: () => void;
  onReady?: () => void;
}

const DEFAULT_ZOOM = 15;

function buildHtml(center: GeoPoint, zoom: number, tileUrlTemplate: string): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #E2E8F0; }
  .leaflet-control-attribution { font-size: 9px; }
  .osm-pulse { border-radius: 50%; animation: osm-pulse-kf 2s ease-out infinite; pointer-events: none; }
  @keyframes osm-pulse-kf { 0% { transform: scale(0.3); opacity: 0.7; } 100% { transform: scale(1); opacity: 0; } }
</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  var map = L.map('map', { zoomControl: false, attributionControl: true })
    .setView([${center.latitude}, ${center.longitude}], ${zoom});
  L.tileLayer(${JSON.stringify(tileUrlTemplate)}, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

  var staticMarkers = {};
  var dynamicMarkers = {};
  var routeLine = null;
  var userGesture = false;

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  map.on('dragstart', function () { userGesture = true; post({ type: 'dragstart' }); });
  map.on('moveend', function () {
    var c = map.getCenter();
    post({ type: 'moveend', lat: c.lat, lng: c.lng, isUserGesture: userGesture });
    userGesture = false;
  });
  map.whenReady(function () { post({ type: 'ready' }); });

  function iconFor(html, anchor) {
    return L.divIcon({ html: html, className: '', iconSize: null, iconAnchor: anchor });
  }

  // Linear tween: react-native-maps' animateMarkerToCoordinate is a system animation, not exactly
  // linear, but this is a close enough substitute for a GPS-tick-rate glide.
  // ponytail: swap for an eased curve if the linear glide reads as robotic at low tick rates.
  function tweenTo(marker, toLat, toLng, durationMs) {
    var from = marker.getLatLng();
    if (!durationMs) { marker.setLatLng([toLat, toLng]); return; }
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / durationMs);
      marker.setLatLng([from.lat + (toLat - from.lat) * t, from.lng + (toLng - from.lng) * t]);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function handleCommand(msg) {
    if (msg.cmd === 'setMarkers') {
      var incomingIds = msg.markers.map(function (m) { return m.id; });
      Object.keys(staticMarkers).forEach(function (id) {
        if (incomingIds.indexOf(id) === -1) { map.removeLayer(staticMarkers[id]); delete staticMarkers[id]; }
      });
      msg.markers.forEach(function (spec) {
        var latlng = [spec.lat, spec.lng];
        if (staticMarkers[spec.id]) {
          staticMarkers[spec.id].setLatLng(latlng);
          staticMarkers[spec.id].setIcon(iconFor(spec.html, spec.anchor));
        } else {
          staticMarkers[spec.id] = L.marker(latlng, { icon: iconFor(spec.html, spec.anchor), zIndexOffset: spec.zIndexOffset || 0 }).addTo(map);
        }
      });
    } else if (msg.cmd === 'setRoute') {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      if (msg.coordinates && msg.coordinates.length > 1) {
        routeLine = L.polyline(msg.coordinates.map(function (p) { return [p.lat, p.lng]; }), {
          color: msg.color, weight: 5, dashArray: msg.dashed ? '12,10' : null, lineCap: 'round', lineJoin: 'round',
        }).addTo(map);
        routeLine.bringToBack();
      }
    } else if (msg.cmd === 'moveMarker') {
      var m = dynamicMarkers[msg.id];
      if (!m) {
        m = L.marker([msg.lat, msg.lng], { icon: iconFor(msg.html, msg.anchor), zIndexOffset: 1000 }).addTo(map);
        dynamicMarkers[msg.id] = m;
      } else {
        tweenTo(m, msg.lat, msg.lng, msg.durationMs || 0);
      }
      if (msg.headingDeg !== undefined && m.getElement()) {
        var rot = m.getElement().querySelector('.rotwrap');
        if (rot) rot.style.transform = 'rotate(' + msg.headingDeg + 'deg)';
      }
    } else if (msg.cmd === 'flyTo') {
      userGesture = false;
      map.flyTo([msg.lat, msg.lng], msg.zoom || map.getZoom(), { duration: (msg.durationMs || 600) / 1000 });
    } else if (msg.cmd === 'fitBounds') {
      userGesture = false;
      map.fitBounds(L.latLngBounds(msg.bounds.map(function (p) { return [p.lat, p.lng]; })), {
        paddingTopLeft: [60, 60], paddingBottomRight: [60, 100], animate: true,
      });
    } else if (msg.cmd === 'zoomBy') {
      userGesture = false;
      map.setZoom(map.getZoom() + msg.delta);
    }
  }

  // react-native-webview fires the message event on \`document\` on Android and \`window\` on iOS.
  document.addEventListener('message', function (e) { handleCommand(JSON.parse(e.data)); });
  window.addEventListener('message', function (e) { handleCommand(JSON.parse(e.data)); });
})();
</script></body></html>`;
}

export const OsmWebMap = forwardRef<OsmWebMapHandle, OsmWebMapProps>(function OsmWebMap(
  { center, zoom = DEFAULT_ZOOM, tileUrlTemplate, markers, route, onMoveEnd, onDragStart, onReady },
  ref
) {
  const webviewRef = useRef<WebView>(null);
  // Baked in once; see the module comment for why later updates go through postMessage instead.
  const html = useMemo(() => buildHtml(center, zoom, tileUrlTemplate), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The page loads Leaflet from a CDN before its message listeners exist; a command posted before
  // that finishes is not queued anywhere and is simply lost. Queue here instead and flush on 'ready'
  // so callers (including an effect that fires on mount) never have to think about the race.
  const isReady = useRef(false);
  const pending = useRef<Record<string, unknown>[]>([]);
  const post = (msg: Record<string, unknown>) => {
    if (isReady.current) webviewRef.current?.postMessage(JSON.stringify(msg));
    else pending.current.push(msg);
  };

  useImperativeHandle(ref, () => ({
    flyTo: (c, z, durationMs) => post({ cmd: "flyTo", lat: c.latitude, lng: c.longitude, zoom: z, durationMs }),
    fitBounds: (coords) => post({ cmd: "fitBounds", bounds: coords.map((c) => ({ lat: c.latitude, lng: c.longitude })) }),
    zoomBy: (delta) => post({ cmd: "zoomBy", delta }),
    moveMarker: (m) =>
      post({
        cmd: "moveMarker",
        id: m.id,
        lat: m.coordinate.latitude,
        lng: m.coordinate.longitude,
        html: m.html,
        anchor: m.anchor,
        headingDeg: m.headingDeg,
        durationMs: m.durationMs,
      }),
  }));

  // markers/route are small (0-2 static markers, one route) and change only on real booking events
  // (pickup set, destination assigned, route fetched) - not worth memoizing the array identity
  // upstream just to skip an idempotent postMessage.
  useEffect(() => {
    post({
      cmd: "setMarkers",
      markers: (markers ?? []).map((m) => ({ id: m.id, lat: m.coordinate.latitude, lng: m.coordinate.longitude, html: m.html, anchor: m.anchor, zIndexOffset: m.zIndexOffset })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

  useEffect(() => {
    post({
      cmd: "setRoute",
      coordinates: route?.coordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })) ?? [],
      color: route?.color ?? "#1D4ED8",
      dashed: !!route?.dashed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "ready") {
        isReady.current = true;
        const queued = pending.current;
        pending.current = [];
        queued.forEach((m) => webviewRef.current?.postMessage(JSON.stringify(m)));
        onReady?.();
      } else if (msg.type === "moveend") onMoveEnd?.({ latitude: msg.lat, longitude: msg.lng }, !!msg.isUserGesture);
      else if (msg.type === "dragstart") onDragStart?.();
    } catch {
      // malformed/foreign message - ignore rather than crash the screen
    }
  };

  return (
    <WebView
      ref={webviewRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={["*"]}
      source={{ html }}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled={false}
      geolocationEnabled={false}
      scrollEnabled={false}
      overScrollMode="never"
      bounces={false}
    />
  );
});
