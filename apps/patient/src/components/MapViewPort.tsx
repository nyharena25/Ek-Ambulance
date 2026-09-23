import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { colors, spacing, shadows } from "@sahayak/ui";
import type { GeoPoint } from "@sahayak/domain";
import { AppIcon } from "./AppIcon";
import { OsmWebMap, type OsmWebMapHandle, type WebMarkerSpec } from "./OsmWebMap";
import { CAN_MOUNT_MAP, OSM_TILE_URL } from "./nativeMap";
import { isFittable } from "../services/mapGeo.core";

const MAP_BLUE = "#1D4ED8";
const DEFAULT_ZOOM = 15;

export interface DriverMarkerHandle {
  moveTo: (coordinate: GeoPoint, headingDeg?: number, durationMs?: number) => void;
}

export interface MapViewPortProps {
  pickup: GeoPoint;
  destination?: { coordinate: GeoPoint; label: string };
  route?: { coordinates: GeoPoint[]; isEstimate: boolean } | null;
  /** Camera centre and recenter target; defaults to the pickup. */
  center?: GeoPoint;
  /** Fit the whole route into view once it arrives (transport leg) instead of holding the default zoom. */
  fitRoute?: boolean;
  driverMarkerRef?: Ref<DriverMarkerHandle>;
  /** Where the ambulance marker first appears; afterwards moveTo() owns its position. */
  driverStart: GeoPoint;
  speedLabel?: string;
  /** Fixed content that must not move with the map (status pills, ETA banner). */
  overlays?: ReactNode;
  onCall108?: () => void;
  unavailableLabel?: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const pickupPinHtml = () => `
  <div style="position:relative;width:34px;height:34px;">
    <div class="osm-pulse" style="position:absolute;top:-13px;left:-13px;width:60px;height:60px;background:rgba(220,38,38,0.35);"></div>
    <div style="width:34px;height:34px;border-radius:17px;background:${colors.emergency};border:2px solid ${colors.white};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
      <div style="width:10px;height:10px;border-radius:50%;background:${colors.white};"></div>
    </div>
  </div>`;

const hospitalPinHtml = (label: string) => `
  <div style="position:relative;width:36px;height:36px;">
    <div style="width:36px;height:36px;border-radius:18px;background:${MAP_BLUE};border:2px solid ${colors.white};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
      <span style="color:${colors.white};font-weight:800;font-size:14px;">H</span>
    </div>
    <div style="position:absolute;top:40px;left:50%;transform:translateX(-50%);background:${colors.white};border-radius:8px;padding:2px 6px;font-size:11px;font-weight:700;color:${MAP_BLUE};white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</div>
  </div>`;

// A plain CSS triangle stands in for the AppIcon "navigation" glyph - it's inside a WebView's own
// DOM, not RN, so it can't reuse AppIcon directly. ponytail: swap for an inline SVG if the exact
// icon matters more than "a pointer that rotates with heading".
const driverPinHtml = () => `
  <div class="rotwrap" style="width:36px;height:36px;border-radius:18px;background:${colors.emergencyDark};border:2px solid ${colors.white};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);transition:transform 300ms;">
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid ${colors.white};"></div>
  </div>`;

function ControlButton({ label, onPress, children, danger }: { label: string; onPress: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={[styles.control, danger && styles.controlDanger]} onPress={onPress}>
      {children}
    </Pressable>
  );
}

/**
 * Leaflet-in-a-WebView map (see OsmWebMap.tsx for why, in place of react-native-maps). Markers, the
 * OSRM polyline and the floating controls live here; screens only pass coordinates and a driverMarkerRef.
 */
export function MapViewPort({
  pickup,
  destination,
  route,
  center = pickup,
  fitRoute = false,
  driverMarkerRef,
  driverStart,
  speedLabel,
  overlays,
  onCall108,
  unavailableLabel = "Map unavailable - live tracking continues",
}: MapViewPortProps) {
  const mapRef = useRef<OsmWebMapHandle>(null);
  const [ready, setReady] = useState(false);
  const driverStartRef = useRef(driverStart); // never re-read after mount: a changed prop would snap the marker back mid-glide

  const coordinates = route?.coordinates;
  const canFit = coordinates ? isFittable(coordinates) : false;
  const fit = () => {
    if (canFit && coordinates) mapRef.current?.fitBounds(coordinates);
  };
  useEffect(() => {
    if (ready && fitRoute && canFit) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitRoute, coordinates]);

  useEffect(() => {
    if (ready) mapRef.current?.flyTo(center, DEFAULT_ZOOM, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.latitude, center.longitude]);

  useEffect(() => {
    // First paint: put the driver marker where it starts. Every ping after this goes through
    // driverMarkerRef.moveTo below, bypassing React entirely.
    if (ready) mapRef.current?.moveMarker({ id: "driver", coordinate: driverStartRef.current, html: driverPinHtml(), anchor: [18, 18] });
  }, [ready]);

  useImperativeHandle(
    driverMarkerRef,
    () => ({
      moveTo: (next, headingDeg, durationMs = 2800) =>
        mapRef.current?.moveMarker({ id: "driver", coordinate: next, html: driverPinHtml(), anchor: [18, 18], headingDeg, durationMs }),
    }),
    []
  );

  const recenter = () => (fitRoute && canFit ? fit() : mapRef.current?.flyTo(center, DEFAULT_ZOOM, 600));
  const zoom = (delta: number) => mapRef.current?.zoomBy(delta);
  const call108 = onCall108 ?? (() => void Linking.openURL("tel:108").catch(() => {}));

  const markers: WebMarkerSpec[] = useMemo(() => {
    const list: WebMarkerSpec[] = [{ id: "pickup", coordinate: pickup, html: pickupPinHtml(), anchor: [17, 17], zIndexOffset: 10 }];
    if (destination) list.push({ id: "hospital", coordinate: destination.coordinate, html: hospitalPinHtml(destination.label), anchor: [18, 18], zIndexOffset: 10 });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.latitude, pickup.longitude, destination?.coordinate.latitude, destination?.coordinate.longitude, destination?.label]);

  const showMap = CAN_MOUNT_MAP;

  return (
    <View style={styles.container}>
      {showMap ? (
        <OsmWebMap
          ref={mapRef}
          center={center}
          zoom={DEFAULT_ZOOM}
          tileUrlTemplate={OSM_TILE_URL}
          markers={markers}
          route={route ? { coordinates: route.coordinates, color: MAP_BLUE, dashed: route.isEstimate } : null}
          onReady={() => setReady(true)}
        />
      ) : (
        <View style={styles.unavailable} accessibilityRole="summary">
          <AppIcon icon={{ set: "mci", name: "map-marker-off-outline" }} size={28} color={colors.slate500} />
          <Text style={styles.unavailableText}>{unavailableLabel}</Text>
          <Text style={styles.unavailableCoords}>
            Pickup {pickup.latitude.toFixed(4)}, {pickup.longitude.toFixed(4)}
          </Text>
          {destination && <Text style={styles.unavailableCoords}>{destination.label}</Text>}
        </View>
      )}

      {overlays}

      {speedLabel ? (
        <View style={styles.speedPill} pointerEvents="none">
          <Text style={styles.speedPillText}>{speedLabel}</Text>
        </View>
      ) : null}

      <View style={styles.controls} pointerEvents="box-none">
        {showMap && (
          <>
            <ControlButton label="Zoom in" onPress={() => zoom(1)}>
              <AppIcon icon={{ set: "mci", name: "plus" }} size={20} color={colors.slate700} />
            </ControlButton>
            <ControlButton label="Zoom out" onPress={() => zoom(-1)}>
              <AppIcon icon={{ set: "mci", name: "minus" }} size={20} color={colors.slate700} />
            </ControlButton>
            <ControlButton label="Recenter Map" onPress={recenter}>
              <AppIcon icon={{ set: "mci", name: "target" }} size={18} color={colors.slate700} />
            </ControlButton>
          </>
        )}
        <ControlButton label="Call 108 emergency" onPress={call108} danger>
          <Text style={styles.call108Text}>108</Text>
        </ControlButton>
      </View>
    </View>
  );
}

// Overlays need zIndex AND elevation: Android draws the WebView surface above lower-elevation siblings.
const FLOAT = { zIndex: 20, elevation: 20 } as const;

const styles = StyleSheet.create({
  container: { height: 310, position: "relative", backgroundColor: colors.slate200, overflow: "hidden" },
  unavailable: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.md },
  unavailableText: { color: colors.slate700, fontWeight: "600", textAlign: "center" },
  unavailableCoords: { color: colors.slate500, fontSize: 12, textAlign: "center" },
  controls: { position: "absolute", right: spacing.sm, bottom: 85, gap: spacing.xs, ...FLOAT },
  control: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.md,
  },
  controlDanger: { backgroundColor: colors.emergency, borderColor: colors.emergencyDark },
  call108Text: { color: colors.white, fontWeight: "800", fontSize: 12 },
  speedPill: {
    position: "absolute",
    left: spacing.sm,
    bottom: 85,
    backgroundColor: colors.slate900,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    ...FLOAT,
  },
  speedPillText: { color: colors.white, fontWeight: "700", fontSize: 12 },
});
