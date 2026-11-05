import { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  StatusBar,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, semanticColors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { ConfirmArrivalScenePayload, type GeoPoint } from "@sahayak/domain";
import {
  driverNavigationStrings,
} from "../i18n/driverNavigationStrings";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { useDriverConnectionStore } from "../state/driverConnection.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { distanceKm as distanceKmBetween } from "../hooks/hospitalSelection.core";
import { AppIcon, DriverMap, NavigateInGoogleMapsButton } from "../components";
import { IS_TEST_RUNNER } from "../config/env";

export interface DriverNavigationScreenProps {
  missionId?: string;
  /** The real, already-validated driver id from the parent route - never re-derived or hardcoded here. */
  driverId?: string;
  pickupCoordinates?: GeoPoint;
  initialLanguage?: SupportedLanguage;
  onConfirmArrival?: (payload: ConfirmArrivalScenePayload) => void;
  onProceedToPatientHandoff?: () => void;
  onBackToStandby?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// The DEMO_* point is for the test runner only: any build on a phone reaching this screen without real pickup params (stale link / reload) falls
// back to the driver's own current position (distance 0) rather than a fixed, confidently-wrong location.
const DEMO_PICKUP: GeoPoint = { latitude: 28.5355, longitude: 77.391 };
const SLIDER_THUMB_SIZE = 58;
const SLIDER_TRACK_PADDING = 4;

export default function DriverNavigationScreen({
  missionId = "",
  driverId,
  pickupCoordinates,
  initialLanguage = "en",
  onConfirmArrival,
  onProceedToPatientHandoff,
  onBackToStandby,
}: DriverNavigationScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [isArrivedOnScene, setIsArrivedOnScene] = useState(false);
  const [isOnSceneModalOpen, setIsOnSceneModalOpen] = useState(false);

  const setStoreLanguage = useDriverConnectionStore((s) => s.setLanguage);
  // Real GPS is published app-wide by useDriverLocation; this screen only displays it.
  const gps = useDriverStandbyStore((s) => s.gps);
  const currentSpeed = Math.round(gps.speedKmh);
  const driverPos = useMemo(() => ({ latitude: gps.latitude, longitude: gps.longitude }), [gps.latitude, gps.longitude]);
  // No pickup known (the mission route re-reads it from the server): shown as not available, never the driver's own position.
  const effectivePickup = pickupCoordinates ?? (IS_TEST_RUNNER ? DEMO_PICKUP : null);
  const distanceKm = effectivePickup ? distanceKmBetween(driverPos, effectivePickup) : null;

  const strings = driverNavigationStrings[language];

  // Dynamic slider track width
  const sliderWidth = SCREEN_WIDTH - spacing.base * 2;
  const maxDragDistance = sliderWidth - SLIDER_THUMB_SIZE - SLIDER_TRACK_PADDING * 2;

  // Animated values
  const panX = useRef(new Animated.Value(0)).current;

  // The irreversible confirm, shared by the slide gesture and the screen-reader "activate" action (a deliberate focus +
  // double-tap), so a TalkBack/VoiceOver user is never locked out of it. Re-assigned every render: the PanResponder below
  // is created once, and calling through this ref keeps the payload's GPS position live instead of the one at mount.
  const confirmArrivalRef = useRef(() => {});
  confirmArrivalRef.current = () => {
    if (isArrivedOnScene) return;
    // Latch permanently to the end (Irreversible!)
    Animated.timing(panX, {
      toValue: maxDragDistance,
      duration: 150,
      useNativeDriver: false,
    }).start(() => {
      setIsArrivedOnScene(true);

      const payload: ConfirmArrivalScenePayload = {
        missionId,
        driverId: driverId ?? "",
        // The driver's real, live GPS position (see driverPos above) - this is what the server records
        // as the on-scene arrival location, never a fixed coordinate unrelated to where the driver is.
        location: driverPos,
        arrivedAt: new Date().toISOString(),
      };

      if (onConfirmArrival) {
        onConfirmArrival(payload);
      }

      // Open handoff celebration modal after short delay
      setTimeout(() => {
        setIsOnSceneModalOpen(true);
      }, 500);
    });
  };

  // PanResponder for Irreversible 'Slide to Confirm Arrival on Scene'
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isArrivedOnScene,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !isArrivedOnScene && Math.abs(gestureState.dx) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (isArrivedOnScene) return;
        const clampedX = Math.max(0, Math.min(gestureState.dx, maxDragDistance));
        panX.setValue(clampedX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isArrivedOnScene) return;

        // Completion threshold: Must drag at least 80% across track
        const completionRatio = gestureState.dx / maxDragDistance;

        if (completionRatio >= 0.8) {
          confirmArrivalRef.current();
        } else {
          // Snap back to origin if released before 80% (prevents accidental triggers)
          Animated.spring(panX, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* TOP EMERGENCY CORRIDOR HEADER */}
      <View style={styles.topHeader}>
        <View style={styles.headerStatusRow}>
          <View style={styles.liveFlashingDot} />
          <Text style={styles.headerStatusText}>
            {isArrivedOnScene
              ? strings.missionStatusOnScene
              : strings.missionStatusEnRoute}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <Pressable
            style={styles.langPill}
            onPress={() => {
              const nextLang = language === "en" ? "hi" : "en";
              setLanguage(nextLang);
              setStoreLanguage(nextLang);
            }}
          >
            <Text style={styles.langPillText}>
              {language === "en" ? "हिन्दी" : "EN"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* DISTANCE + SPEED (directions themselves open in Google Maps) */}
      <View style={styles.navigationOverlayCard}>
        <View style={styles.telemetryRow}>
          <View style={styles.speedometerBox}>
            <Text style={styles.speedValue}>{currentSpeed}</Text>
            <Text style={styles.speedUnit}>{strings.currentSpeedUnit}</Text>
          </View>
          <View style={styles.etaBox}>
            <Text style={styles.etaTimeText}>{isArrivedOnScene ? "0.0 km" : distanceKm === null ? "—" : `${distanceKm.toFixed(1)} km`}</Text>
            <Text style={styles.etaDistText}>{language === "hi" ? "मरीज तक (सीधी दूरी)" : "to patient (straight line)"}</Text>
          </View>
        </View>
      </View>

      {effectivePickup ? (
        <NavigateInGoogleMapsButton destination={effectivePickup} target="pickup" language={language} />
      ) : (
        <Text style={styles.etaDistText} accessibilityRole="alert">
          {language === "hi" ? "पिकअप स्थान अभी उपलब्ध नहीं है।" : "Pickup location not available yet."}
        </Text>
      )}

      {/* FULL-SCREEN TACTICAL NAVIGATION CANVAS */}
      <View style={styles.mapCanvas} pointerEvents="box-none">
        <DriverMap style={StyleSheet.absoluteFill} driver={driverPos} headingDeg={gps.heading} controlsBottom={64} />

        {/* Floating Map HUD Controls */}
        <View style={styles.floatingControlsRow}>
          <View style={styles.gpsAccuracyBadge}>
            <Text style={styles.gpsAccuracyText}>
              <AppIcon icon={{ set: "mci", name: "satellite-variant" }} size={10} />{" "}
              ± {gps.accuracyMeters.toFixed(1)}m • GPS
            </Text>
          </View>

        </View>
      </View>

      {/* No patient relay number or dispatch-desk number is provisioned by the server, so no call bar is shown (no fake numbers). */}

      {/* PERSISTENT BOTTOM ACTION BAR: IRREVERSIBLE SLIDE TO CONFIRM ARRIVAL */}
      <View style={styles.bottomBar}>
        <Text style={styles.sliderAccidentalTapHelper}>
          {strings.sliderAccidentalTapNotice}
        </Text>

        {/* Horizontal Slider Track (one accessible control: screen readers confirm with the activate action) */}
        <View
          style={[
            styles.sliderTrack,
            isArrivedOnScene && styles.sliderTrackConfirmed,
          ]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={isArrivedOnScene ? strings.sliderConfirmedArrival : strings.sliderPromptArrival}
          accessibilityState={{ disabled: isArrivedOnScene }}
          accessibilityActions={[{ name: "activate" }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "activate") confirmArrivalRef.current();
          }}
        >
          {/* Dynamically expanding green background fill */}
          <Animated.View
            style={[
              styles.sliderFill,
              {
                width: isArrivedOnScene
                  ? sliderWidth
                  : panX.interpolate({
                      inputRange: [0, maxDragDistance],
                      outputRange: [SLIDER_THUMB_SIZE, sliderWidth],
                    }),
              },
            ]}
          />

          {/* Slider Prompt Text */}
          <Text
            style={[
              styles.sliderPromptText,
              isArrivedOnScene && styles.sliderPromptTextConfirmed,
            ]}
          >
            {isArrivedOnScene
              ? strings.sliderConfirmedArrival
              : strings.sliderPromptArrival}
          </Text>

          {/* Moving Draggable Thumb */}
          <Animated.View
            style={[
              styles.sliderThumb,
              isArrivedOnScene && styles.sliderThumbConfirmed,
              {
                transform: [
                  {
                    translateX: isArrivedOnScene ? maxDragDistance : panX,
                  },
                ],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <Text style={styles.sliderThumbEmoji}>
              <AppIcon
                icon={
                  isArrivedOnScene
                    ? { set: "ion", name: "checkmark" }
                    : { set: "ion", name: "flag" }
                }
                size={20}
              />
            </Text>
          </Animated.View>
        </View>
      </View>


      {/* ARRIVAL ON SCENE CONFIRMED CELEBRATION MODAL */}
      <Modal
        visible={isOnSceneModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOnSceneModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.onSceneCard}>
            <View style={styles.onSceneBadgeCircle}>
              <AppIcon icon={{ set: "ion", name: "checkmark" }} size={32} style={styles.onSceneBadgeCheck} />
            </View>
            <Text style={styles.onSceneTitle}>
              {strings.arrivedSceneTitle}
            </Text>
            <Text style={styles.onSceneSubtitle}>
              {strings.arrivedSceneSubtitle}
            </Text>

            <View style={styles.onSceneNoticeBox}>
              <Text style={styles.onSceneNoticeHeading}>
                <AppIcon icon={{ set: "ion", name: "clipboard" }} size={13} />{" "}
                Clinical Preparation Protocol:
              </Text>
              <Text style={styles.onSceneNoticeText}>
                {strings.triagePreparationNotice}
              </Text>
            </View>

            <Pressable
              style={styles.proceedHandoffBtn}
              onPress={() => {
                setIsOnSceneModalOpen(false);
                if (onProceedToPatientHandoff) {
                  onProceedToPatientHandoff();
                } else if (onBackToStandby) {
                  onBackToStandby();
                }
              }}
            >
              <Text style={styles.proceedHandoffBtnText}>
                {strings.btnProceedToTriageHandoff}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.slate950,
  },

  // Top Header
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.slate950,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveFlashingDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    backgroundColor: colors.emergency,
  },
  headerStatusText: {
    color: colors.white,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.6,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  langPill: {
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  langPillText: {
    color: colors.slate900,
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
  },

  // Navigation Overlay Card
  navigationOverlayCard: {
    backgroundColor: colors.slate900,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.slate700,
    gap: spacing.sm,
    ...shadows.md,
  },
  telemetryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.slate950,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate800,
  },
  speedometerBox: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  speedValue: {
    fontSize: 26,
    fontWeight: typography.fontWeights.extrabold,
    color: semanticColors.status.statutoryBorder, // nearest existing token (no cyan in the design system)
  },
  speedUnit: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate400,
  },
  etaBox: {
    alignItems: "flex-end",
  },
  etaTimeText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.triageGreen, // nearest existing token
  },
  etaDistText: {
    fontSize: 10,
    color: colors.slate400,
  },


  // Map Canvas
  mapCanvas: {
    flex: 1,
    backgroundColor: colors.slate950, // nearest existing token
    position: "relative",
    overflow: "hidden",
  },
  floatingControlsRow: {
    position: "absolute",
    bottom: 12,
    left: spacing.base,
    right: spacing.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 20,
    elevation: 20,
  },
  gpsAccuracyBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate700,
  },
  gpsAccuracyText: {
    color: semanticColors.status.statutoryBorder, // nearest existing token
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
  },


  // Persistent Bottom Action Bar
  bottomBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.base,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    borderTopWidth: 2,
    borderTopColor: colors.slate200,
    gap: 6,
    ...shadows.emergency,
  },
  sliderAccidentalTapHelper: {
    fontSize: 10,
    color: colors.slate600,
    textAlign: "center",
  },
  sliderTrack: {
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.slate950,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    padding: SLIDER_TRACK_PADDING,
  },
  sliderTrackConfirmed: {
    backgroundColor: colors.success,
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.success,
    borderRadius: radii.full,
  },
  sliderPromptText: {
    position: "absolute",
    left: SLIDER_THUMB_SIZE + 16,
    right: 12,
    textAlign: "center",
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  sliderPromptTextConfirmed: {
    left: 12,
    color: colors.white,
    fontSize: typography.fontSizes.base,
  },
  sliderThumb: {
    width: SLIDER_THUMB_SIZE,
    height: SLIDER_THUMB_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  sliderThumbConfirmed: {
    backgroundColor: colors.white,
  },
  sliderThumbEmoji: {
    fontSize: 26,
  },

  // Modals & Drawers
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "flex-end",
  },


  // On-Scene Celebration Modal
  onSceneCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii["2xl"],
    borderTopRightRadius: radii["2xl"],
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    ...shadows.md,
  },
  onSceneBadgeCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.success,
  },
  onSceneBadgeCheck: {
    fontSize: 32,
    color: colors.success,
    fontWeight: typography.fontWeights.extrabold,
  },
  onSceneTitle: {
    fontSize: typography.fontSizes["2xl"],
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    textAlign: "center",
  },
  onSceneSubtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
    textAlign: "center",
  },
  onSceneNoticeBox: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.base,
    width: "100%",
    gap: 4,
  },
  onSceneNoticeHeading: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  onSceneNoticeText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    lineHeight: typography.lineHeights.xs,
  },
  proceedHandoffBtn: {
    width: "100%",
    backgroundColor: colors.emergency,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    ...shadows.emergency,
  },
  proceedHandoffBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },
});
