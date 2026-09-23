import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Animated,
  Easing,
  Linking,
  Modal,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { AIS125VehicleType } from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { matchingStrings } from "../i18n/matchingStrings";

import { AppIcon } from "../components";
export interface ActiveMatchingScreenProps {
  vehicleType?: AIS125VehicleType;
  pickupAddress?: string;
  pickupCoords?: { latitude: number; longitude: number };
  initialLanguage?: SupportedLanguage;
  wave1TimeoutSeconds?: number;
  wave2TimeoutSeconds?: number;
  onCancel?: (reason: string) => void;
  onBack?: () => void;
  onCall108?: () => void;
  onSimulateMatch?: () => void;
}

/**
 * ActiveMatchingScreen for Ek-Ambulance
 *
 * Represents the XState dispatch broadcast and driver matching lifecycle:
 * - Animated concentric radar circle radiating outward from pickup pin.
 * - Multi-wave dispatch progress indicator:
 *     Wave 1: 0-3 km (Immediate Local Fleet)
 *     Wave 2: 3-6 km (Expanded Regional Fleet)
 * - Driver acceptance countdown timer with automatic wave escalation.
 * - Immediate Cancel action with safe cancellation reason confirmation modal.
 * - Prominent, floating "Emergency 108 Call Fallback" pill.
 * - WCAG AAA compliant contrast, high-visibility medical typography, and bilingual i18n.
 */
export default function ActiveMatchingScreen({
  vehicleType = "TYPE_D_ALS",
  pickupAddress = "AIIMS New Delhi, Main Emergency Ward",
  pickupCoords = { latitude: 28.5672, longitude: 77.2100 },
  initialLanguage = "en",
  wave1TimeoutSeconds = 45,
  wave2TimeoutSeconds = 45,
  onCancel,
  onBack,
  onCall108,
  onSimulateMatch,
}: ActiveMatchingScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [currentWave, setCurrentWave] = useState<1 | 2>(1);
  const [secondsLeft, setSecondsLeft] = useState<number>(wave1TimeoutSeconds);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState<boolean>(false);
  const [selectedReasonKey, setSelectedReasonKey] = useState<string>("alternative");

  const strings = matchingStrings[language];

  // ---------------------------------------------------------------------------
  // RADAR CONCENTRIC ANIMATION RINGS (3 STAGGERED RINGS)
  // ---------------------------------------------------------------------------
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const pinPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const createRingAnimation = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animRing1 = createRingAnimation(ring1, 0);
    const animRing2 = createRingAnimation(ring2, 800);
    const animRing3 = createRingAnimation(ring3, 1600);

    const animPinPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pinPulse, {
          toValue: 1.15,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pinPulse, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    animRing1.start();
    animRing2.start();
    animRing3.start();
    animPinPulse.start();

    return () => {
      animRing1.stop();
      animRing2.stop();
      animRing3.stop();
      animPinPulse.stop();
    };
  }, [ring1, ring2, ring3, pinPulse]);

  // ---------------------------------------------------------------------------
  // DRIVER ACCEPTANCE COUNTDOWN & WAVE ESCALATION TIMER
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (currentWave === 1) {
            // Escalate to Wave 2 (3-6 km)
            setCurrentWave(2);
            return wave2TimeoutSeconds;
          } else {
            // Re-loop Wave 2 timer
            return wave2TimeoutSeconds;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentWave, wave2TimeoutSeconds]);

  // Format seconds to MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remSecs.toString().padStart(2, "0")}`;
  };

  // ---------------------------------------------------------------------------
  // EMERGENCY 108 CALL HANDLER
  // ---------------------------------------------------------------------------
  const handleCall108 = () => {
    if (onCall108) {
      onCall108();
      return;
    }
    const telUrl = "tel:108";
    Linking.canOpenURL(telUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(telUrl);
        } else {
          Alert.alert(
            strings.fallbackPillTitle,
            "108 National Emergency Ambulance Helpline: 108"
          );
        }
      })
      .catch(() => {
        Alert.alert(strings.fallbackPillTitle, "Emergency Helpline: 108");
      });
  };

  // ---------------------------------------------------------------------------
  // CANCELLATION HANDLERS
  // ---------------------------------------------------------------------------
  const handleConfirmCancel = () => {
    setIsCancelModalVisible(false);
    if (onCancel) {
      onCancel(selectedReasonKey);
    }
  };

  const cancellationReasons = [
    { key: "alternative", label: strings.reasonAlternative },
    { key: "resolved", label: strings.reasonResolved },
    { key: "location", label: strings.reasonIncorrectLocation },
    { key: "other", label: strings.reasonOther },
  ];

  // Ring scale and opacity interpolation
  const getRingStyle = (anim: Animated.Value) => {
    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.25, 2.6],
    });
    const opacity = anim.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0.75, 0.35, 0],
    });
    return {
      transform: [{ scale }],
      opacity,
    };
  };

  const isUrgentTimer = secondsLeft <= 10;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP HEADER */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.backButton}
              onPress={onBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={20} color={colors.slate700} />
            </Pressable>
          )}
          <View style={styles.pulseDotWrapper}>
            <View style={styles.pulseDotCore} />
          </View>
          <View>
            <Text style={styles.headerTitle}>{strings.screenTitle}</Text>
            <Text style={styles.headerStateBadge}>{strings.stateMachineState}</Text>
          </View>
        </View>

        {/* BILINGUAL LANGUAGE SWITCHER */}
        <View
          style={styles.langToggleContainer}
          accessibilityRole="radiogroup"
          accessibilityLabel={strings.languageToggleLabel}
        >
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: language === "en" }}
            accessibilityLabel="Switch to English"
            style={[
              styles.langButton,
              language === "en" && styles.langButtonActive,
            ]}
            onPress={() => setLanguage("en")}
          >
            <Text
              style={[
                styles.langButtonText,
                language === "en" && styles.langButtonTextActive,
              ]}
            >
              EN
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: language === "hi" }}
            accessibilityLabel="हिन्दी भाषा चुनें"
            style={[
              styles.langButton,
              language === "hi" && styles.langButtonActive,
            ]}
            onPress={() => setLanguage("hi")}
          >
            <Text
              style={[
                styles.langButtonText,
                language === "hi" && styles.langButtonTextActive,
              ]}
            >
              हिन्दी
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* RADAR SEARCH VISUALIZATION CANVAS */}
        <View
          style={styles.radarCard}
          accessible={true}
          accessibilityLabel={strings.radarAria}
        >
          <View style={styles.radarViewport}>
            {/* Range Rings / Distance Grid Rings (0-3 km and 3-6 km markers) */}
            <View style={styles.rangeRingOuter} />
            <View style={styles.rangeRingInner} />

            {/* Range ring labels */}
            <Text style={styles.rangeRingOuterLabel}>6 km</Text>
            <Text style={styles.rangeRingInnerLabel}>3 km</Text>

            {/* Radar Crosshairs */}
            <View style={styles.radarCrosshairHorizontal} />
            <View style={styles.radarCrosshairVertical} />

            {/* Animated Concentric Waves Radiating Outward */}
            <Animated.View
              style={[styles.animatedWaveRing, getRingStyle(ring1)]}
            />
            <Animated.View
              style={[styles.animatedWaveRing, getRingStyle(ring2)]}
            />
            <Animated.View
              style={[styles.animatedWaveRing, getRingStyle(ring3)]}
            />

            {/* Simulated Nearby Ambulance Blips */}
            <View style={[styles.ambulanceBlip, { top: 38, left: 65 }]}>
              <View style={styles.ambulanceBlipDot} />
              <Text style={styles.ambulanceBlipText}>ALS 1</Text>
            </View>
            <View style={[styles.ambulanceBlip, { bottom: 44, right: 55 }]}>
              <View style={styles.ambulanceBlipDot} />
              <Text style={styles.ambulanceBlipText}>ALS 2</Text>
            </View>
            {currentWave === 2 && (
              <View style={[styles.ambulanceBlip, { top: 22, right: 36 }]}>
                <View style={[styles.ambulanceBlipDot, styles.blipWave2]} />
                <Text style={styles.ambulanceBlipText}>ALS 3</Text>
              </View>
            )}

            {/* Center Pickup Pin with Pulse Beacon */}
            <Animated.View
              style={[
                styles.centerBeacon,
                { transform: [{ scale: pinPulse }] },
              ]}
            >
              <View style={styles.centerPinIconCircle}>
                <AppIcon icon={{ set: "ion", name: "location" }} size={16} color={colors.slate700} style={styles.centerPinEmoji} />
              </View>
            </Animated.View>
          </View>

          {/* Radar Status Footer */}
          <View style={styles.radarFooter}>
            <View style={styles.broadcastingTag}>
              <View style={styles.blinkingRedLight} />
              <Text style={styles.broadcastingTagText}>
                {strings.searchingStatus}
              </Text>
            </View>
            <Text style={styles.fleetCountText}>
              {strings.nearbyFleetCount(currentWave === 1 ? 3 : 6)}
            </Text>
          </View>
        </View>

        {/* DRIVER ACCEPTANCE COUNTDOWN CARD */}
        <View style={styles.countdownCard}>
          <View style={styles.countdownHeaderRow}>
            <View style={styles.countdownTitleGroup}>
              <Text style={styles.countdownTitle}>{strings.countdownLabel}</Text>
              <Text style={styles.countdownSubtitle}>
                {strings.countdownSubtext(secondsLeft)}
              </Text>
            </View>

            {/* Large Clock Display */}
            <View
              style={[
                styles.countdownBadge,
                isUrgentTimer && styles.countdownBadgeUrgent,
              ]}
            >
              <Text style={styles.countdownClockIcon}>⏱️</Text>
              <Text
                style={[
                  styles.countdownTimeText,
                  isUrgentTimer && styles.countdownTimeTextUrgent,
                ]}
              >
                {formatTime(secondsLeft)}
              </Text>
            </View>
          </View>

          {/* Wave Escalation Notice if Wave 2 */}
          {currentWave === 2 && (
            <View style={styles.wave2AlertBanner}>
              <AppIcon icon={{ set: "ion", name: "flash" }} size={16} color={colors.slate700} style={styles.wave2AlertIcon} />
              <Text style={styles.wave2AlertText}>
                {strings.waveEscalatedNotice}
              </Text>
            </View>
          )}
        </View>

        {/* DISPATCH WAVES PROGRESS INDICATOR */}
        <View style={styles.wavesCard}>
          <Text style={styles.wavesSectionHeader}>
            {strings.wavesSectionTitle}
          </Text>

          <View style={styles.wavesTrackerContainer}>
            {/* Wave 1: 0-3 km */}
            <View style={styles.waveItem}>
              <View style={styles.waveIndicatorColumn}>
                <View
                  style={[
                    styles.waveStepCircle,
                    currentWave === 1
                      ? styles.waveStepCircleActive
                      : styles.waveStepCircleCompleted,
                  ]}
                >
                  <Text
                    style={[
                      styles.waveStepNumber,
                      currentWave === 1
                        ? styles.waveStepNumberActive
                        : styles.waveStepNumberCompleted,
                    ]}
                  >
                    {currentWave === 1 ? (
                    "1"
                  ) : (
                    <AppIcon icon={{ set: "ion", name: "checkmark" }} size={13} />
                  )}
                  </Text>
                </View>
                <View
                  style={[
                    styles.waveConnectingLine,
                    currentWave === 2 && styles.waveConnectingLineActive,
                  ]}
                />
              </View>

              <View style={styles.waveDetailsColumn}>
                <View style={styles.waveTitleRow}>
                  <Text style={styles.waveTitleText}>{strings.wave1Title}</Text>
                  <View
                    style={[
                      styles.waveStatusTag,
                      currentWave === 1
                        ? styles.waveStatusTagActive
                        : styles.waveStatusTagCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.waveStatusTagText,
                        currentWave === 1
                          ? styles.waveStatusTagTextActive
                          : styles.waveStatusTagTextCompleted,
                      ]}
                    >
                      {currentWave === 1 ? "ACTIVE" : "ELAPSED"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.waveSubtitleText}>
                  {strings.wave1Subtitle}
                </Text>
                <Text style={styles.waveStatusDescription}>
                  {currentWave === 1
                    ? strings.wave1StatusActive
                    : strings.wave1StatusCompleted}
                </Text>
              </View>
            </View>

            {/* Wave 2: 3-6 km */}
            <View style={styles.waveItem}>
              <View style={styles.waveIndicatorColumn}>
                <View
                  style={[
                    styles.waveStepCircle,
                    currentWave === 2
                      ? styles.waveStepCircleActive
                      : styles.waveStepCirclePending,
                  ]}
                >
                  <Text
                    style={[
                      styles.waveStepNumber,
                      currentWave === 2
                        ? styles.waveStepNumberActive
                        : styles.waveStepNumberPending,
                    ]}
                  >
                    2
                  </Text>
                </View>
              </View>

              <View style={styles.waveDetailsColumn}>
                <View style={styles.waveTitleRow}>
                  <Text style={styles.waveTitleText}>{strings.wave2Title}</Text>
                  <View
                    style={[
                      styles.waveStatusTag,
                      currentWave === 2
                        ? styles.waveStatusTagActive
                        : styles.waveStatusTagPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.waveStatusTagText,
                        currentWave === 2
                          ? styles.waveStatusTagTextActive
                          : styles.waveStatusTagTextPending,
                      ]}
                    >
                      {currentWave === 2 ? "ACTIVE" : "NEXT"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.waveSubtitleText}>
                  {strings.wave2Subtitle}
                </Text>
                <Text style={styles.waveStatusDescription}>
                  {currentWave === 2
                    ? strings.wave2StatusActive
                    : strings.wave2StatusPending}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* MISSION CONTEXT CARD */}
        <View style={styles.contextCard}>
          <View style={styles.contextRow}>
            <View style={styles.contextIconBadge}>
              <AppIcon icon={{ set: "mci", name: "ambulance" }} size={18} color={colors.slate700} style={styles.contextIcon} />
            </View>
            <View style={styles.contextInfoGroup}>
              <Text style={styles.contextLabel}>
                {strings.requestedVehicleLabel}
              </Text>
              <Text style={styles.contextMainValue}>
                {vehicleType.replace(/_/g, " ")}
              </Text>
              <Text style={styles.contextSubValue}>
                {strings.lifeSupportTelemetry}
              </Text>
            </View>
          </View>

          <View style={styles.contextDivider} />

          <View style={styles.contextRow}>
            <View style={styles.contextIconBadge}>
              <AppIcon icon={{ set: "ion", name: "location" }} size={18} color={colors.slate700} style={styles.contextIcon} />
            </View>
            <View style={styles.contextInfoGroup}>
              <Text style={styles.contextLabel}>
                {strings.pickupLocationLabel}
              </Text>
              <Text style={styles.contextMainValue} numberOfLines={2}>
                {pickupAddress}
              </Text>
              <Text style={styles.contextSubValue}>
                GPS: {pickupCoords.latitude.toFixed(4)}° N,{" "}
                {pickupCoords.longitude.toFixed(4)}° E
              </Text>
            </View>
          </View>
        </View>

        {/* IMMEDIATE CANCEL BUTTON */}
        <View style={styles.actionContainer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.cancelButtonText}
            accessibilityHint="Cancels active ambulance search request"
            style={styles.immediateCancelButton}
            onPress={() => setIsCancelModalVisible(true)}
          >
            <Text style={styles.immediateCancelButtonText}>
              {strings.cancelButtonText}
            </Text>
          </Pressable>

          {/* SIMULATION HOOK FOR DEMO TESTING */}
          {onSimulateMatch && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Simulate Driver Acceptance"
              style={styles.simulateButton}
              onPress={onSimulateMatch}
            >
              <Text style={styles.simulateButtonText}>
                <AppIcon icon={{ set: "ion", name: "flash" }} size={14} />{" "}
                Simulate Driver Acceptance (Test Flow)
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* PROMINENT EMERGENCY 108 CALL FALLBACK FLOATING PILL */}
      <View style={styles.floatingPillContainer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${strings.fallbackPillTitle} - ${strings.fallbackPillSubtitle}`}
          accessibilityHint="Directly dials national 108 ambulance emergency helpline"
          style={styles.floating108Pill}
          onPress={handleCall108}
        >
          <View style={styles.pillIconCircle}>
            <AppIcon icon={{ set: "ion", name: "call" }} size={18} color={colors.slate700} style={styles.pillPhoneIcon} />
          </View>
          <View style={styles.pillTextGroup}>
            <Text style={styles.pillTitleText}>
              {strings.fallbackPillTitle}
            </Text>
            <Text style={styles.pillSubtitleText}>
              {strings.fallbackPillSubtitle}
            </Text>
          </View>
          <View style={styles.pillCallBadge}>
            <Text style={styles.pillCallBadgeText}>{strings.callBadgeLabel}</Text>
          </View>
        </Pressable>
      </View>

      {/* CANCELLATION SAFETY CONFIRMATION MODAL */}
      <Modal
        visible={isCancelModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalWarningIconBadge}>
              <AppIcon icon={{ set: "ion", name: "warning" }} size={24} color={colors.slate700} style={styles.modalWarningIcon} />
            </View>

            <Text style={styles.modalTitle}>{strings.cancelModalTitle}</Text>
            <Text style={styles.modalDescription}>
              {strings.cancelModalDescription}
            </Text>

            <Text style={styles.modalSectionLabel}>
              {strings.cancelReasonTitle}
            </Text>

            {/* Reason Selector Radio Options */}
            <View style={styles.reasonsList}>
              {cancellationReasons.map((reason) => (
                <Pressable
                  key={reason.key}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: selectedReasonKey === reason.key,
                  }}
                  style={[
                    styles.reasonItem,
                    selectedReasonKey === reason.key &&
                      styles.reasonItemSelected,
                  ]}
                  onPress={() => setSelectedReasonKey(reason.key)}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      selectedReasonKey === reason.key &&
                        styles.radioCircleSelected,
                    ]}
                  >
                    {selectedReasonKey === reason.key && (
                      <View style={styles.radioDot} />
                    )}
                  </View>
                  <Text style={styles.reasonLabel}>{reason.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.confirmCancelButton}
                style={styles.modalConfirmCancelBtn}
                onPress={handleConfirmCancel}
              >
                <Text style={styles.modalConfirmCancelBtnText}>
                  {strings.confirmCancelButton}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.keepSearchingButton}
                style={styles.modalKeepSearchingBtn}
                onPress={() => setIsCancelModalVisible(false)}
              >
                <Text style={styles.modalKeepSearchingBtnText}>
                  {strings.keepSearchingButton}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.slate100,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    ...shadows.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  pulseDotWrapper: {
    width: 22,
    height: 22,
    borderRadius: radii.full,
    backgroundColor: colors.emergencyLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  pulseDotCore: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    backgroundColor: colors.emergency,
  },
  headerTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerStateBadge: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
  },
  langToggleContainer: {
    flexDirection: "row",
    backgroundColor: colors.slate100,
    borderRadius: radii.md,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  langButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  langButtonActive: {
    backgroundColor: colors.emergency,
  },
  langButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
  langButtonTextActive: {
    color: colors.white,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 110, // room for floating 108 pill
    gap: spacing.base,
  },

  // ---------------------------------------------------------------------------
  // RADAR CANVAS
  // ---------------------------------------------------------------------------
  radarCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    alignItems: "center",
    ...shadows.sm,
  },
  radarViewport: {
    width: 230,
    height: 230,
    borderRadius: radii.full,
    backgroundColor: colors.slate50,
    borderWidth: 2,
    borderColor: colors.slate300,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    marginVertical: spacing.sm,
  },
  rangeRingOuter: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderStyle: "dashed",
  },
  rangeRingInner: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  rangeRingOuterLabel: {
    position: "absolute",
    top: 6,
    right: 20,
    fontSize: 9,
    fontWeight: "800",
    color: colors.slate500,
  },
  rangeRingInnerLabel: {
    position: "absolute",
    top: 50,
    right: 56,
    fontSize: 9,
    fontWeight: "800",
    color: colors.slate500,
  },
  radarCrosshairHorizontal: {
    position: "absolute",
    width: "100%",
    height: 1,
    backgroundColor: colors.slate200,
  },
  radarCrosshairVertical: {
    position: "absolute",
    width: 1,
    height: "100%",
    backgroundColor: colors.slate200,
  },
  animatedWaveRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2.5,
    borderColor: colors.emergency,
    backgroundColor: "rgba(220, 38, 38, 0.08)",
  },
  centerBeacon: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.emergencyLight,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    borderWidth: 2,
    borderColor: colors.emergency,
    ...shadows.sm,
  },
  centerPinIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.emergency,
    justifyContent: "center",
    alignItems: "center",
  },
  centerPinEmoji: {
    fontSize: 16,
  },
  ambulanceBlip: {
    position: "absolute",
    alignItems: "center",
    zIndex: 5,
  },
  ambulanceBlipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.info,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  blipWave2: {
    backgroundColor: colors.warning,
  },
  ambulanceBlipText: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.slate700,
    backgroundColor: colors.white,
    paddingHorizontal: 2,
    borderRadius: 2,
    marginTop: 1,
  },
  radarFooter: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  broadcastingTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergencyLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  blinkingRedLight: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.emergency,
    marginRight: 6,
  },
  broadcastingTagText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
    letterSpacing: 0.5,
  },
  fleetCountText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },

  // ---------------------------------------------------------------------------
  // COUNTDOWN CARD
  // ---------------------------------------------------------------------------
  countdownCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  countdownHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countdownTitleGroup: {
    flex: 1,
    marginRight: spacing.md,
  },
  countdownTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginBottom: 2,
  },
  countdownSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: 16,
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.slate300,
  },
  countdownBadgeUrgent: {
    backgroundColor: colors.emergencyLight,
    borderColor: colors.emergency,
  },
  countdownClockIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  countdownTimeText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: 0.5,
  },
  countdownTimeTextUrgent: {
    color: colors.emergencyDark,
  },
  wave2AlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  wave2AlertIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  wave2AlertText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.warning,
    flex: 1,
  },

  // ---------------------------------------------------------------------------
  // DISPATCH WAVES PROGRESS TRACKER
  // ---------------------------------------------------------------------------
  wavesCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  wavesSectionHeader: {
    fontSize: 11,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate600,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  wavesTrackerContainer: {
    gap: 0,
  },
  waveItem: {
    flexDirection: "row",
  },
  waveIndicatorColumn: {
    alignItems: "center",
    width: 32,
  },
  waveStepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    zIndex: 2,
  },
  waveStepCircleActive: {
    backgroundColor: colors.emergency,
    borderColor: colors.emergencyDark,
  },
  waveStepCircleCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  waveStepCirclePending: {
    backgroundColor: colors.slate100,
    borderColor: colors.slate300,
  },
  waveStepNumber: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
  },
  waveStepNumberActive: {
    color: colors.white,
  },
  waveStepNumberCompleted: {
    color: colors.white,
  },
  waveStepNumberPending: {
    color: colors.slate500,
  },
  waveConnectingLine: {
    width: 2,
    height: 48,
    backgroundColor: colors.slate300,
    marginVertical: -2,
  },
  waveConnectingLineActive: {
    backgroundColor: colors.emergency,
  },
  waveDetailsColumn: {
    flex: 1,
    marginLeft: spacing.md,
    paddingBottom: spacing.lg,
  },
  waveTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  waveTitleText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  waveStatusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  waveStatusTagActive: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergency,
  },
  waveStatusTagCompleted: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success,
  },
  waveStatusTagPending: {
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  waveStatusTagText: {
    fontSize: 9,
    fontWeight: "800",
  },
  waveStatusTagTextActive: {
    color: colors.emergencyDark,
  },
  waveStatusTagTextCompleted: {
    color: colors.success,
  },
  waveStatusTagTextPending: {
    color: colors.slate600,
  },
  waveSubtitleText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.slate700,
    marginTop: 2,
  },
  waveStatusDescription: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 2,
  },

  // ---------------------------------------------------------------------------
  // MISSION CONTEXT CARD
  // ---------------------------------------------------------------------------
  contextCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  contextIconBadge: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  contextIcon: {
    fontSize: 18,
  },
  contextInfoGroup: {
    flex: 1,
  },
  contextLabel: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate600,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  contextMainValue: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  contextSubValue: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 2,
  },
  contextDivider: {
    height: 1,
    backgroundColor: colors.slate200,
    marginVertical: spacing.md,
  },

  // ---------------------------------------------------------------------------
  // ACTIONS & CANCEL
  // ---------------------------------------------------------------------------
  actionContainer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  immediateCancelButton: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.slate800,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  immediateCancelButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  simulateButton: {
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  simulateButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
  },

  // ---------------------------------------------------------------------------
  // PROMINENT 108 EMERGENCY FLOATING PILL
  // ---------------------------------------------------------------------------
  floatingPillContainer: {
    position: "absolute",
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 99,
  },
  floating108Pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergency,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderWidth: 2,
    borderColor: colors.emergencyDark,
    ...shadows.lg,
    elevation: 8,
  },
  pillIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  pillPhoneIcon: {
    fontSize: 18,
  },
  pillTextGroup: {
    flex: 1,
  },
  pillTitleText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
    letterSpacing: 0.2,
  },
  pillSubtitleText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.medium,
    color: colors.emergencyLight,
    marginTop: 1,
  },
  pillCallBadge: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  pillCallBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.emergencyDark,
    letterSpacing: 0.4,
  },

  // ---------------------------------------------------------------------------
  // CANCELLATION MODAL
  // ---------------------------------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.white,
    borderRadius: radii["2xl"],
    padding: spacing.xl,
    ...shadows.lg,
    elevation: 10,
  },
  modalWarningIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.emergencyLight,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  modalWarningIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  modalDescription: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: spacing.base,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate700,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  reasonsList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.slate50,
  },
  reasonItemSelected: {
    borderColor: colors.emergency,
    backgroundColor: colors.emergencyLight,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.slate400,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  radioCircleSelected: {
    borderColor: colors.emergency,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emergency,
  },
  reasonLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
    flex: 1,
  },
  modalActions: {
    gap: spacing.sm,
  },
  modalConfirmCancelBtn: {
    backgroundColor: colors.emergency,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  modalConfirmCancelBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  modalKeepSearchingBtn: {
    backgroundColor: colors.slate100,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  modalKeepSearchingBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
});
