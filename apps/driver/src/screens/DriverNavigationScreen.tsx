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
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, semanticColors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { ConfirmArrivalScenePayload, type GeoPoint } from "@sahayak/domain";
import {
  driverNavigationStrings,
  IncidentDelayOption,
} from "../i18n/driverNavigationStrings";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { useDriverConnectionStore } from "../state/driverConnection.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { distanceKm as distanceKmBetween } from "../hooks/hospitalSelection.core";
import { AppIcon, DriverMap, NavigateInGoogleMapsButton } from "../components";
import { IS_DEV } from "../config/env";

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
// __DEV__ only: a release build reaching this screen without real pickup params (stale link / reload) falls
// back to the driver's own current position (distance 0) rather than a fixed, confidently-wrong location.
const DEMO_PICKUP: GeoPoint = { latitude: 28.5355, longitude: 77.391 };
const SLIDER_THUMB_SIZE = 58;
const SLIDER_TRACK_PADDING = 4;

export default function DriverNavigationScreen({
  missionId = "MSN-2026-8819",
  driverId,
  pickupCoordinates,
  initialLanguage = "en",
  onConfirmArrival,
  onProceedToPatientHandoff,
  onBackToStandby,
}: DriverNavigationScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [isDelayDrawerOpen, setIsDelayDrawerOpen] = useState(false);
  const [selectedDelay, setSelectedDelay] = useState<IncidentDelayOption | null>(null);
  const [activeDelayNotice, setActiveDelayNotice] = useState<string | null>(null);
  const [isCallingModalOpen, setIsCallingModalOpen] = useState(false);
  const [activeCallingNumber, setActiveCallingNumber] = useState("");
  const [isArrivedOnScene, setIsArrivedOnScene] = useState(false);
  const [isOnSceneModalOpen, setIsOnSceneModalOpen] = useState(false);

  const setStoreLanguage = useDriverConnectionStore((s) => s.setLanguage);
  // Real GPS is published app-wide by useDriverLocation; this screen only displays it.
  const gps = useDriverStandbyStore((s) => s.gps);
  const currentSpeed = Math.round(gps.speedKmh);
  const driverPos = useMemo(() => ({ latitude: gps.latitude, longitude: gps.longitude }), [gps.latitude, gps.longitude]);
  const effectivePickup = pickupCoordinates ?? (IS_DEV ? DEMO_PICKUP : driverPos);
  const distanceKm = distanceKmBetween(driverPos, effectivePickup);

  const strings = driverNavigationStrings[language];

  // Dynamic slider track width
  const sliderWidth = SCREEN_WIDTH - spacing.base * 2;
  const maxDragDistance = sliderWidth - SLIDER_THUMB_SIZE - SLIDER_TRACK_PADDING * 2;

  // Animated values
  const panX = useRef(new Animated.Value(0)).current;

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

  // Handle Masked Phone Call Trigger
  const handleInitiateCall = (phoneNumber: string) => {
    setActiveCallingNumber(phoneNumber);
    setIsCallingModalOpen(true);
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      // Fallback if dialer not accessible
    });
  };

  // Broadcast Incident Delay
  const handleBroadcastDelay = () => {
    if (!selectedDelay) return;
    const added = selectedDelay.addedMinutes;
    setActiveDelayNotice(strings.delayBroadcastSuccessNotice(added));
    setIsDelayDrawerOpen(false);

    // Clear notice banner after 6s
    setTimeout(() => {
      setActiveDelayNotice(null);
    }, 6000);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.slate950} />

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
            <Text style={styles.etaTimeText}>{isArrivedOnScene ? "0.0" : distanceKm.toFixed(1)} km</Text>
            <Text style={styles.etaDistText}>{language === "hi" ? "मरीज तक (सीधी दूरी)" : "to patient (straight line)"}</Text>
          </View>
        </View>
      </View>

      <NavigateInGoogleMapsButton destination={effectivePickup} target="pickup" language={language} />

      {/* ACTIVE INCIDENT DELAY BANNER (IF BROADCASTED) */}
      {activeDelayNotice && (
        <View style={styles.activeDelayBanner}>
          <AppIcon icon={{ set: "ion", name: "warning" }} size={14} color={colors.slate700} style={styles.activeDelayIcon} />
          <Text style={styles.activeDelayText}>{activeDelayNotice}</Text>
        </View>
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

          <Pressable
            style={styles.incidentDelayBtn}
            onPress={() => setIsDelayDrawerOpen(true)}
          >
            <Text style={styles.incidentDelayBtnText}>
              {strings.btnOpenDelayDrawer}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* QUICK-DIAL CONTACT BAR (MASKED VIRTUAL NUMBER & DISPATCH DESK) */}
      <View style={styles.quickDialBar}>
        <View style={styles.callerInfoBox}>
          <View style={styles.callerIconCircle}>
            <AppIcon icon={{ set: "ion", name: "person" }} size={14} color={colors.slate700} style={styles.callerIconEmoji} />
          </View>
          <View style={styles.callerTextWrap}>
            <Text style={styles.callerName}>
              {strings.callerAttendantName}
            </Text>
            <Text style={styles.callerSub}>
              {strings.maskedVirtualNumber}
            </Text>
          </View>
        </View>

        <View style={styles.dialActionsRow}>
          {/* Masked Call Patient Button */}
          <Pressable
            style={styles.callPatientBtn}
            onPress={() => handleInitiateCall(strings.maskedVirtualNumber)}
          >
            <Text style={styles.callPatientBtnText}>
              <AppIcon icon={{ set: "ion", name: "call" }} size={11} />{" "}{strings.btnCallPatientMasked}
            </Text>
          </Pressable>

          {/* Central Dispatch Desk Button */}
          <Pressable
            style={styles.callDispatchBtn}
            onPress={() => handleInitiateCall("1800-AMBULANCE")}
          >
            <Text style={styles.callDispatchBtnText}><AppIcon icon={{ set: "mci", name: "car-emergency" }} size={11} />{" "}Desk</Text>
          </Pressable>
        </View>
      </View>

      {/* PERSISTENT BOTTOM ACTION BAR: IRREVERSIBLE SLIDE TO CONFIRM ARRIVAL */}
      <View style={styles.bottomBar}>
        <Text style={styles.sliderAccidentalTapHelper}>
          {strings.sliderAccidentalTapNotice}
        </Text>

        {/* Horizontal Slider Track */}
        <View
          style={[
            styles.sliderTrack,
            isArrivedOnScene && styles.sliderTrackConfirmed,
          ]}
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

      {/* INCIDENT DELAY REPORTING DRAWER / MODAL */}
      <Modal
        visible={isDelayDrawerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsDelayDrawerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.drawerCard}>
            <View style={styles.drawerHeaderRow}>
              <View style={styles.drawerTitleBox}>
                <Text style={styles.drawerTitle}>
                  {strings.delayDrawerTitle}
                </Text>
                <Text style={styles.drawerSub}>
                  {strings.delayDrawerSubtitle}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsDelayDrawerOpen(false)}
                style={styles.drawerCloseBtn}
              >
                <AppIcon icon={{ set: "ion", name: "close" }} size={18} style={styles.drawerCloseText} />
              </Pressable>
            </View>

            {/* Delay Choices */}
            <ScrollView style={styles.drawerOptionsScroll}>
              {strings.delayOptions.map((opt) => {
                const isSelected = selectedDelay?.id === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.delayOptionItem,
                      isSelected && styles.delayOptionItemSelected,
                    ]}
                    onPress={() => setSelectedDelay(opt)}
                  >
                    <AppIcon
                      icon={opt.icon}
                      size={22}
                      color={colors.slate700}
                      style={styles.delayOptionIcon}
                    />
                    <View style={styles.delayOptionTextWrap}>
                      <Text style={styles.delayOptionTitle}>{opt.title}</Text>
                      <Text style={styles.delayOptionImpact}>
                        Impact: +{opt.addedMinutes} mins ({opt.impactLevel})
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radioDot,
                        isSelected && styles.radioDotSelected,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Broadcast Button */}
            <Pressable
              style={[
                styles.broadcastDelayBtn,
                !selectedDelay && styles.broadcastDelayBtnDisabled,
              ]}
              onPress={handleBroadcastDelay}
              disabled={!selectedDelay}
            >
              <Text style={styles.broadcastDelayBtnText}>
                {strings.btnBroadcastDelay(selectedDelay?.addedMinutes || 5)}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MASKED CALLING CONNECTING DIALOG */}
      <Modal
        visible={isCallingModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCallingModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.callingModalCard}>
            <View style={styles.callingIconCircle}>
              <AppIcon icon={{ set: "ion", name: "call" }} size={24} color={colors.slate700} style={styles.callingIconEmoji} />
            </View>
            <Text style={styles.callingModalTitle}>
              DPDP 2023 Masked Calling Bridge
            </Text>
            <Text style={styles.callingModalTarget}>
              {activeCallingNumber}
            </Text>
            <Text style={styles.callingModalNotice}>
              {strings.dpdpPrivacyNotice}
            </Text>
            <Pressable
              style={styles.callingCloseBtn}
              onPress={() => setIsCallingModalOpen(false)}
            >
              <Text style={styles.callingCloseBtnText}>{strings.btnCloseDialog}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  voiceToggleBtn: {
    backgroundColor: colors.slate800,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.sm,
  },
  voiceToggleIcon: {
    fontSize: 14,
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
  maneuverRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  maneuverIconBox: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.emergency,
    alignItems: "center",
    justifyContent: "center",
  },
  maneuverArrowIcon: {
    fontSize: 22,
    color: colors.white,
    fontWeight: typography.fontWeights.extrabold,
  },
  maneuverDistBadge: {
    fontSize: 9,
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    marginTop: -2,
  },
  maneuverTextBox: {
    flex: 1,
  },
  maneuverInstruction: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
    lineHeight: typography.lineHeights.base,
  },
  maneuverSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate300,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2,
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
  corridorBadgeBox: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  corridorPill: {
    backgroundColor: semanticColors.triage.green.textAccessible,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semanticColors.triage.green.border,
  },
  corridorPillText: {
    color: colors.triageGreen, // nearest existing token
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  corridorSubText: {
    fontSize: 9,
    color: colors.slate400,
    marginTop: 2,
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

  // Active Delay Banner
  activeDelayBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
    gap: 8,
  },
  activeDelayIcon: {
    fontSize: 14,
  },
  activeDelayText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    flex: 1,
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
  incidentDelayBtn: {
    backgroundColor: "rgba(180, 83, 9, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  incidentDelayBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
  },

  // Quick Dial Bar
  quickDialBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.slate900,
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.slate800,
  },
  callerInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  callerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.slate800,
    alignItems: "center",
    justifyContent: "center",
  },
  callerIconEmoji: {
    fontSize: 14,
  },
  callerTextWrap: {
    flex: 1,
  },
  callerName: {
    color: colors.white,
    fontSize: 12,
    fontWeight: typography.fontWeights.bold,
  },
  callerSub: {
    color: colors.slate400,
    fontSize: 10,
  },
  dialActionsRow: {
    flexDirection: "row",
    gap: 6,
  },
  callPatientBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
    justifyContent: "center",
  },
  callPatientBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
  },
  callDispatchBtn: {
    backgroundColor: colors.slate800,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate700,
    justifyContent: "center",
  },
  callDispatchBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
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
  drawerCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii["2xl"],
    borderTopRightRadius: radii["2xl"],
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: "80%",
    ...shadows.md,
  },
  drawerHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  drawerTitleBox: {
    flex: 1,
  },
  drawerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  drawerSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 2,
  },
  drawerCloseBtn: {
    padding: 6,
  },
  drawerCloseText: {
    fontSize: 18,
    color: colors.slate600,
    fontWeight: typography.fontWeights.bold,
  },
  drawerOptionsScroll: {
    maxHeight: 280,
  },
  delayOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: 8,
    gap: 12,
  },
  delayOptionItemSelected: {
    borderColor: colors.warning,
    backgroundColor: colors.warningLight,
  },
  delayOptionIcon: {
    fontSize: 22,
  },
  delayOptionTextWrap: {
    flex: 1,
  },
  delayOptionTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  delayOptionImpact: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    marginTop: 2,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.slate400,
  },
  radioDotSelected: {
    borderColor: colors.warning,
    backgroundColor: colors.warning,
  },
  broadcastDelayBtn: {
    backgroundColor: colors.warning,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  broadcastDelayBtnDisabled: {
    opacity: 0.6,
  },
  broadcastDelayBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },

  // Calling Modal
  callingModalCard: {
    backgroundColor: colors.white,
    margin: spacing.xl,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "center",
    width: "90%",
    maxWidth: 380,
    ...shadows.md,
  },
  callingIconCircle: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.success,
  },
  callingIconEmoji: {
    fontSize: 24,
  },
  callingModalTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
  },
  callingModalTarget: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.success,
  },
  callingModalNotice: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    textAlign: "center",
    lineHeight: typography.lineHeights.xs,
    backgroundColor: colors.slate50,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  callingCloseBtn: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.base,
  },
  callingCloseBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
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
