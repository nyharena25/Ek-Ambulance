import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, shadows, spacing } from "@sahayak/ui";
import type { GeoPoint } from "@sahayak/domain";
import AppIcon from "./AppIcon";
import { OsmWebMap, type OsmWebMapHandle } from "./OsmWebMap";
import { CAN_MOUNT_MAP, OSM_TILE_URL } from "./nativeMap";

const ZOOM = 16;

export interface DriverMapProps {
  /** Live GPS fix; the ambulance marker glides to it on every change. */
  driver: GeoPoint;
  headingDeg?: number;
  style?: object;
  controlsBottom?: number;
}

const ambulanceHtml = () => `
  <div style="position:relative;width:40px;height:40px;">
    <div class="osm-pulse" style="position:absolute;top:-14px;left:-14px;width:68px;height:68px;background:rgba(220,38,38,0.3);"></div>
    <div class="rotwrap" style="width:40px;height:40px;border-radius:20px;background:${colors.emergencyDark};border:3px solid ${colors.white};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);transition:transform 300ms;">
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid ${colors.white};"></div>
    </div>
  </div>`;

function Control({ label, onPress, icon }: { label: string; onPress: () => void; icon: string }) {
  return (
    <Pressable hitSlop={4} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.control, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <AppIcon icon={{ set: "mci", name: icon as never }} size={22} color={colors.slate800} />
    </Pressable>
  );
}

/**
 * Static "you are here" map: the ambulance marker on OSM tiles, no route or destination.
 * Directions live in Google Maps (deep link), not here. Leaflet in a WebView - see OsmWebMap.tsx;
 * web has no WebView, so it shows a coordinates panel instead.
 */
export default function DriverMap({ driver, headingDeg, style, controlsBottom = spacing.md }: DriverMapProps) {
  const mapRef = useRef<OsmWebMapHandle>(null);
  const [ready, setReady] = useState(false);
  const following = useRef(true);

  useEffect(() => {
    if (!ready) return;
    mapRef.current?.moveMarker({ id: "driver", coordinate: driver, html: ambulanceHtml(), anchor: [20, 20], headingDeg, durationMs: 2500 });
    if (following.current) mapRef.current?.flyTo(driver, ZOOM, 800);
  }, [ready, driver.latitude, driver.longitude, headingDeg]);

  return (
    <View style={[styles.container, style]}>
      {CAN_MOUNT_MAP ? (
        <OsmWebMap
          ref={mapRef}
          center={driver}
          zoom={ZOOM}
          tileUrlTemplate={OSM_TILE_URL}
          onDragStart={() => {
            following.current = false; // the driver is looking around: stop re-centring until Recenter
          }}
          onReady={() => setReady(true)}
        />
      ) : (
        <View style={styles.unavailable}>
          <AppIcon icon={{ set: "mci", name: "map-marker-off-outline" }} size={28} color={colors.slate500} />
          <Text style={styles.unavailableText}>Live map needs the Android/iOS app</Text>
          <Text style={styles.unavailableCoords}>{driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}</Text>
        </View>
      )}
      {CAN_MOUNT_MAP && (
        <View style={[styles.controls, { bottom: controlsBottom }]} pointerEvents="box-none">
          <Control label="Zoom in" icon="plus" onPress={() => mapRef.current?.zoomBy(1)} />
          <Control label="Zoom out" icon="minus" onPress={() => mapRef.current?.zoomBy(-1)} />
          <Control
            label="Recenter on my location"
            icon="crosshairs-gps"
            onPress={() => {
              following.current = true;
              mapRef.current?.flyTo(driver, ZOOM, 600);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.slate200, overflow: "hidden" },
  unavailable: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.md },
  unavailableText: { color: colors.slate700, fontWeight: "600", textAlign: "center" },
  unavailableCoords: { color: colors.slate500, fontSize: 12 },
  // zIndex AND elevation: Android draws the WebView surface above lower-elevation siblings.
  controls: { position: "absolute", right: spacing.sm, gap: spacing.sm, zIndex: 20, elevation: 20 },
  control: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.slate300,
    ...shadows.md,
  },
});
