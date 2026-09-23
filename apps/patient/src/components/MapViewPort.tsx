import { useRef, type ReactNode } from "react";
import { View, StyleSheet, Pressable, Animated, PanResponder } from "react-native";
import { colors, spacing, shadows } from "@sahayak/ui";
import { AppIcon } from "./AppIcon";

export interface MapViewPortProps {
  /** Pannable canvas content: road grid, landmarks, polylines, markers.
   *  MapViewPort never inspects this - it only applies the pan transform
   *  around it - so telemetry-driven markers (driverHeadingAnim,
   *  liveSpeedKmh) keep flowing directly from the screen to its own
   *  children exactly as before, with no rewiring. */
  children: ReactNode;
  /** Fixed-position content over the viewport that should NOT pan with
   *  the canvas (status pills, ETA banners) - e.g. MissionTrackingScreen's
   *  centrifugoBadge/trafficEtaCard. Optional; omit if a screen has none. */
  overlays?: ReactNode;
  canvasWidth?: number;
  canvasHeight?: number;
}

/**
 * Shared mock-map viewport chrome (pan gesture, recenter, canvas frame)
 * extracted from MissionTrackingScreen and TransportingScreen, whose pan
 * gesture, recenter button, and container/viewport/canvas styling were
 * byte-identical. Swapping the mock canvas for a native tile map
 * (react-native-maps/MapLibre) later means replacing what this component
 * renders internally - callers only ever pass markers as children, so no
 * caller-side rewiring is needed.
 *
 * PickupLocationScreen's map is NOT wired to this component: its pan
 * gesture derives new pickup coordinates from the release delta
 * (resolveJurisdiction et al.) rather than just panning a static canvas -
 * a structurally different interaction, not passive viewport chrome, so
 * forcing it into this shell would either strip that logic out or leak
 * location-picking into a component meant to stay ignorant of it.
 */
export function MapViewPort({ children, overlays, canvasWidth = 600, canvasHeight = 480 }: MapViewPortProps) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {},
    })
  ).current;

  const handleRecenterMap = () => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={styles.mapContainer}>
      <View style={styles.mapViewport} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.mapCanvas,
            {
              width: canvasWidth,
              height: canvasHeight,
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>

      {overlays}

      <Pressable
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Recenter Map"
        style={styles.recenterButton}
        onPress={handleRecenterMap}
      >
        <AppIcon icon={{ set: "mci", name: "target" }} size={18} color={colors.slate700} style={styles.recenterIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 310,
    position: "relative",
    backgroundColor: colors.slate200,
    overflow: "hidden",
  },
  mapViewport: {
    flex: 1,
    position: "relative",
  },
  mapCanvas: {
    position: "absolute",
    top: -85,
    left: -110,
    backgroundColor: colors.slate200,
  },
  recenterButton: {
    position: "absolute",
    right: spacing.sm,
    bottom: 85,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.md,
    zIndex: 20,
  },
  recenterIcon: {
    fontSize: 18,
  },
});
