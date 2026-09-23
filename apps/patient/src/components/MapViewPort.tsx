import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import MapView, { Circle, Marker, Polyline, type MapMarker } from "react-native-maps";
import { colors, spacing, shadows } from "@sahayak/ui";
import type { GeoPoint } from "@sahayak/domain";
import { AppIcon } from "./AppIcon";
import { isFittable, regionAround, scaleRegion } from "../services/mapGeo.core";

const MAP_BLUE = "#1D4ED8";
const MAP_READY_TIMEOUT_MS = 8000;
// The Android Google Maps SDK aborts the process at mount without a manifest API key, so never mount it keyless.
const CAN_MOUNT_NATIVE_MAP =
  Platform.OS === "ios" || (Platform.OS === "android" && Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY));

// Applies to Google Maps (Android) only; Apple Maps ignores customMapStyle.
const SLATE_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: colors.slate200 }] },
  { elementType: "labels.text.fill", stylers: [{ color: colors.slate600 }] },
  { elementType: "labels.text.stroke", stylers: [{ color: colors.slate50 }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: colors.slate100 }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: colors.white }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: colors.slate300 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: colors.slate300 }] },
];

/** Imperative handle so live pings move the marker natively, without re-rendering any screen. */
export interface DriverMarkerHandle {
  moveTo: (coordinate: GeoPoint, headingDeg?: number, durationMs?: number) => void;
}

export interface MapViewPortProps {
  pickup: GeoPoint;
  destination?: { coordinate: GeoPoint; label: string };
  route?: { coordinates: GeoPoint[]; isEstimate: boolean } | null;
  /** Camera centre and recenter target; defaults to the pickup. */
  center?: GeoPoint;
  /** Fit the whole route into view once it arrives (transport leg) instead of holding the 0.015 delta. */
  fitRoute?: boolean;
  driverMarkerRef?: Ref<DriverMarkerHandle>;
  /** Where the ambulance marker first appears; afterwards the native animation owns its position. */
  driverStart: GeoPoint;
  speedLabel?: string;
  /** Fixed content that must not move with the map (status pills, ETA banner). */
  overlays?: ReactNode;
  onCall108?: () => void;
  unavailableLabel?: string;
}

/** Custom marker views are bitmapped: keep tracking on after mount (icon fonts load) and after `bump` changes, then off. */
function useSettledTracking(bump?: unknown): boolean {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 1500);
    return () => clearTimeout(t);
  }, [bump]);
  return tracking;
}

function DriverMarker({ handleRef, start }: { handleRef?: Ref<DriverMarkerHandle>; start: GeoPoint }) {
  const marker = useRef<MapMarker>(null);
  const coordinate = useRef(start).current; // never changes: a changed prop would snap the marker back mid-glide
  const [heading, setHeading] = useState(0);
  const lastHeading = useRef(0);
  const tracking = useSettledTracking(heading);

  useImperativeHandle(
    handleRef,
    () => ({
      moveTo: (next, headingDeg, durationMs = 2800) => {
        marker.current?.animateMarkerToCoordinate(next, durationMs);
        // Only this leaf re-renders, and only for a >=3 degree turn.
        if (headingDeg !== undefined && Math.abs(headingDeg - lastHeading.current) >= 3) {
          lastHeading.current = headingDeg;
          setHeading(headingDeg);
        }
      },
    }),
    []
  );

  return (
    <Marker
      ref={marker}
      coordinate={coordinate}
      rotation={heading}
      flat
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      zIndex={3}
      accessibilityLabel="Live ambulance"
    >
      {/* rotation/flat are Google-only on iOS, so Apple Maps turns the (live) badge itself; Android bitmaps ignore this. */}
      <View style={[styles.ambulanceBadge, Platform.OS === "ios" && { transform: [{ rotate: `${heading}deg` }] }]}>
        <AppIcon icon={{ set: "mci", name: "navigation" }} size={20} color={colors.white} />
      </View>
    </Marker>
  );
}

const PULSE_STEPS = 8;

/** Radar ring as a native Circle stepped at ~4 Hz: a pulsing marker view would need tracksViewChanges forever. */
function PulseRing({ center }: { center: GeoPoint }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % PULSE_STEPS), 250);
    return () => clearInterval(t);
  }, []);
  const t = step / (PULSE_STEPS - 1);
  return (
    <Circle
      center={center}
      radius={25 + t * 90}
      strokeWidth={1}
      strokeColor={`rgba(220,38,38,${(0.6 * (1 - t)).toFixed(2)})`}
      fillColor={`rgba(220,38,38,${(0.3 * (1 - t)).toFixed(2)})`}
      zIndex={1}
    />
  );
}

function PickupMarker({ coordinate }: { coordinate: GeoPoint }) {
  const tracking = useSettledTracking();
  return (
    <>
      <PulseRing center={coordinate} />
      <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking} zIndex={2} accessibilityLabel="Patient pickup">
        <View style={styles.pickupPin}>
          <AppIcon icon={{ set: "ion", name: "location" }} size={20} color={colors.white} />
        </View>
      </Marker>
    </>
  );
}

function HospitalMarker({ coordinate, label }: { coordinate: GeoPoint; label: string }) {
  const tracking = useSettledTracking();
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.3 }} centerOffset={{ x: 0, y: 10 }} tracksViewChanges={tracking} zIndex={2} accessibilityLabel={label}>
      <View style={styles.hospitalWrap}>
        <View style={styles.hospitalBadge}>
          <AppIcon icon={{ set: "mci", name: "hospital-building" }} size={20} color={colors.white} />
        </View>
        <View style={styles.hospitalLabel}>
          <Text style={styles.hospitalLabelText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

function ControlButton({ label, onPress, children, danger }: { label: string; onPress: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={[styles.control, danger && styles.controlDanger]} onPress={onPress}>
      {children}
    </Pressable>
  );
}

/**
 * Native tile map (Google on Android, Apple on iOS) replacing the mock canvas. Markers, the OSRM polyline
 * and the floating controls live here; screens only pass coordinates and a driverMarkerRef.
 * Falls back to a static panel on web, keyless Android builds, or when the map never becomes ready
 * (no Google Play services / offline first load) - tracking text and the 108 button keep working.
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
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef(regionAround(center));
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!CAN_MOUNT_NATIVE_MAP || ready) return;
    const t = setTimeout(() => setTimedOut(true), MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  const coordinates = route?.coordinates;
  const canFit = coordinates ? isFittable(coordinates) : false;
  const fit = () => {
    if (canFit && coordinates) {
      mapRef.current?.fitToCoordinates(coordinates, { edgePadding: { top: 60, right: 60, bottom: 100, left: 60 }, animated: true });
    }
  };
  useEffect(() => {
    if (ready && fitRoute && canFit) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitRoute, coordinates]);

  const recenter = () => (fitRoute && canFit ? fit() : mapRef.current?.animateToRegion(regionAround(center), 350));
  const zoom = (factor: number) => mapRef.current?.animateToRegion(scaleRegion(regionRef.current, factor), 250);
  const call108 = onCall108 ?? (() => void Linking.openURL("tel:108").catch(() => {}));

  const showMap = CAN_MOUNT_NATIVE_MAP && !(timedOut && !ready);

  return (
    <View style={styles.container}>
      {showMap ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={regionAround(center)}
          customMapStyle={SLATE_MAP_STYLE}
          onMapReady={() => setReady(true)}
          onRegionChangeComplete={(r) => {
            regionRef.current = r;
          }}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsCompass={false}
          moveOnMarkerPress={false}
        >
          {route && route.coordinates.length > 1 && (
            <Polyline
              coordinates={route.coordinates}
              strokeColor={MAP_BLUE}
              strokeWidth={5}
              lineDashPattern={route.isEstimate ? [12, 10] : undefined}
              lineCap="round"
              lineJoin="round"
              zIndex={0}
            />
          )}
          <PickupMarker coordinate={pickup} />
          {destination && <HospitalMarker coordinate={destination.coordinate} label={destination.label} />}
          <DriverMarker handleRef={driverMarkerRef} start={driverStart} />
        </MapView>
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
            <ControlButton label="Zoom in" onPress={() => zoom(0.5)}>
              <AppIcon icon={{ set: "mci", name: "plus" }} size={20} color={colors.slate700} />
            </ControlButton>
            <ControlButton label="Zoom out" onPress={() => zoom(2)}>
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

// Overlays need zIndex AND elevation: Android draws the native map surface above lower-elevation siblings.
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
  ambulanceBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.emergencyDark,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pickupPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.emergency,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  hospitalWrap: { alignItems: "center", width: 150 },
  hospitalBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MAP_BLUE,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  hospitalLabel: { marginTop: 2, backgroundColor: colors.white, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 146 },
  hospitalLabelText: { color: MAP_BLUE, fontWeight: "700", fontSize: 11 },
});
