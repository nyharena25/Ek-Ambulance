import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import {
  driverMissionOfferStrings,
  TriageBadgeDetails,
} from "../i18n/driverMissionOfferStrings";
import { driverOnboardingStrings } from "../i18n/driverOnboardingStrings";
import { offerSecondsLeft, type UrgencyTier, type AIS125VehicleType } from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import {
  OFFER_WINDOW_SECONDS,
  tickOfferCountdown,
  isSwipeAcceptanceComplete,
  isVehicleTierEligible,
} from "../hooks/dispatchOffer.core";

import { AppIcon } from "../components";
export interface IncomingMissionModalProps {
  visible?: boolean;
  initialLanguage?: SupportedLanguage;
  initialAcuity?: UrgencyTier;
  missionId?: string;
  /** Required AIS-125 category for this mission, per the dispatch wave payload. */
  requiredVehicleType?: AIS125VehicleType;
  /** The signed-in driver's own registered vehicle tier (driverStandby.store). */
  registeredVehicleType?: AIS125VehicleType;
  pickupAddress?: string;
  pickupLandmark?: string;
  distanceKm?: number;
  etaMinutes?: number;
  /** Server time this offer expires (offer.expiresAt). The countdown is derived from it, not from a local counter (rule 11). */
  expiresAt?: string;
  /** serverNow - localNow measured when the offer arrived. */
  clockOffsetMs?: number;
  /** The only clinical content the driver sees. Absent fields are not shown; nothing is invented. */
  patientSummary?: { primaryComplaint?: string; derivedFlags?: string[]; ageBand?: string; sex?: string };
  onAccept?: (missionId: string) => void;
  onDecline?: (reason: string) => void;
  onTimeout?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDER_TRACK_PADDING = 4;
const SLIDER_THUMB_SIZE = 56;

export default function IncomingMissionModal({
  visible = true,
  initialLanguage = "en",
  initialAcuity = "CAT_1_IMMEDIATE",
  missionId = "",
  requiredVehicleType = "TYPE_D_ALS",
  registeredVehicleType = "TYPE_D_ALS",
  pickupAddress,
  pickupLandmark,
  distanceKm,
  etaMinutes,
  expiresAt,
  clockOffsetMs = 0,
  patientSummary,
  onAccept,
  onDecline,
  onTimeout,
}: IncomingMissionModalProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const acuity = initialAcuity;
  const [secondsLeft, setSecondsLeft] = useState(OFFER_WINDOW_SECONDS);
  const [isSirenMuted, setIsSirenMuted] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [isDeclineSheetOpen, setIsDeclineSheetOpen] = useState(false);
  const [selectedDeclineReason, setSelectedDeclineReason] = useState<string>("");

  const strings = driverMissionOfferStrings[language];
  const triageInfo: TriageBadgeDetails = strings.triageBadges[acuity];
  const isCat1 = acuity === "CAT_1_IMMEDIATE";
  const isCat3 = acuity === "CAT_3_DELAYED";

  // Vehicle-tier eligibility gate: a mismatch disables Swipe-to-Accept
  // outright rather than silently auto-declining (a driver-visible block,
  // not a background system action).
  const isTierEligible = isVehicleTierEligible(requiredVehicleType, registeredVehicleType);
  const ais125Categories = driverOnboardingStrings[language].ais125Categories;
  const requiredVehicleLabel =
    ais125Categories.find((c) => c.id === requiredVehicleType)?.name ?? requiredVehicleType;
  const registeredVehicleLabel =
    ais125Categories.find((c) => c.id === registeredVehicleType)?.name ?? registeredVehicleType;

  // Dynamic slider track width
  const sliderWidth = SCREEN_WIDTH - spacing.base * 2;
  const maxDragDistance = sliderWidth - SLIDER_THUMB_SIZE - SLIDER_TRACK_PADDING * 2;

  // Animated values for Swipe to Accept slider
  const panX = useRef(new Animated.Value(0)).current;
  const timerProgressAnim = useRef(new Animated.Value(1)).current;

  // Flashing pulse animation for emergency header
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 15-second countdown timer effect
  useEffect(() => {
    if (!visible || isAccepted) return;

    // Rule 11: with a server expiry the window is whatever is left of it; the local 15 s is only the no-server fallback.
    const windowSeconds = expiresAt ? offerSecondsLeft(expiresAt, Date.now(), clockOffsetMs) : OFFER_WINDOW_SECONDS;
    setSecondsLeft(windowSeconds);
    timerProgressAnim.setValue(1);

    // Smooth animation from 1 to 0 over the same window the numeral counts down
    Animated.timing(timerProgressAnim, {
      toValue: 0,
      duration: Math.max(windowSeconds, 1) * 1000,
      useNativeDriver: false,
    }).start();

    // Pulse animation for header
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        // Recomputed from the server expiry each tick, so a suspended JS thread cannot leave a stale "8 s" on screen.
        const next = expiresAt ? offerSecondsLeft(expiresAt, Date.now(), clockOffsetMs) : tickOfferCountdown(prev).secondsLeft;
        const expired = prev > 0 && next === 0;
        if (expired) {
          clearInterval(interval);
          if (onTimeout) onTimeout();
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      timerProgressAnim.stopAnimation();
      pulseAnim.stopAnimation();
    };
  }, [visible, isAccepted, onTimeout]);

  // PanResponder for Swipe-to-Accept Slider (Accidental-Tap Prevention)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTierEligible,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        isTierEligible && Math.abs(gestureState.dx) > 5,
      onPanResponderGrant: () => {
        // Driver grabbed slider thumb
      },
      onPanResponderMove: (_, gestureState) => {
        if (isAccepted || !isTierEligible) return;
        const clampedX = Math.max(0, Math.min(gestureState.dx, maxDragDistance));
        panX.setValue(clampedX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isAccepted) return;

        if (isTierEligible && isSwipeAcceptanceComplete(gestureState.dx, maxDragDistance)) {
          // Trigger acceptance!
          Animated.timing(panX, {
            toValue: maxDragDistance,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
            setIsAccepted(true);
            setTimeout(() => {
              if (onAccept) onAccept(missionId);
            }, 600);
          });
        } else {
          // Snap back to origin if released prematurely (cancelling accidental swipes)
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

  const handleConfirmDecline = (reasonText: string) => {
    setIsDeclineSheetOpen(false);
    if (onDecline) {
      onDecline(reasonText);
    }
  };

  if (!visible) return null;

  // Countdown timer color calculation
  const getTimerColor = () => {
    if (secondsLeft > 7) return colors.emergency;
    if (secondsLeft > 3) return colors.warning;
    return colors.emergencyDark; // Deep flashing red for final 3s
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.emergencyDeep} />

        {/* TOP EMERGENCY FLASHER BANNER */}
        <Animated.View
          style={[
            styles.emergencyBanner,
            {
              backgroundColor: isCat1
                ? colors.emergencyDeep
                : isCat3
                  ? colors.triageGreenText
                  : colors.warning,
              opacity: pulseAnim,
            },
          ]}
        >
          <View style={styles.bannerRow}>
            <View style={styles.bannerTitleBox}>
              <AppIcon icon={{ set: "mci", name: "car-emergency" }} size={26} color={colors.slate700} style={styles.bannerSirenIcon} />
              <View>
                <Text style={styles.bannerTitle}>{strings.alertBannerTitle}</Text>
                <Text style={styles.bannerWaveTag}>{strings.alertWaveTag}</Text>
              </View>
            </View>

            {/* Language and Siren Control */}
            <View style={styles.bannerActions}>
              <Pressable
                style={styles.sirenToggleBtn}
                onPress={() => setIsSirenMuted(!isSirenMuted)}
              >
                <Text style={styles.sirenToggleIcon}>
                  <AppIcon
                icon={
                  isSirenMuted
                    ? { set: "ion", name: "volume-mute" }
                    : { set: "ion", name: "volume-high" }
                }
                size={20}
              />
                </Text>
              </Pressable>

              <Pressable
                style={styles.langPill}
                onPress={() => setLanguage(language === "en" ? "hi" : "en")}
              >
                <Text style={styles.langPillText}>
                  {language === "en" ? "हिन्दी" : "EN"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* SCROLLABLE MISSION OVERVIEW BODY */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* RADIAL 15-SECOND COUNTDOWN CLOCK CARD */}
          <View style={styles.countdownCard}>
            <View style={styles.clockContainer}>
              {/* Animated Circular Progress Outline Ring */}
              <View style={[styles.clockOuterRing, { borderColor: getTimerColor() }]}>
                <View style={styles.clockInnerCircle}>
                  <Text style={[styles.clockNumeral, { color: getTimerColor() }]}>
                    {secondsLeft}
                  </Text>
                  <Text style={styles.clockUnit}>SEC</Text>
                </View>
              </View>
            </View>

            <View style={styles.clockNoticeWrap}>
              <Text style={styles.clockHeading}>
                {strings.incomingOfferHeading}
              </Text>
              <Text style={styles.clockSub}>
                {strings.timerAutoEscalateNotice}
              </Text>
              <View style={styles.waveEscalateBar}>
                <Animated.View
                  style={[
                    styles.waveEscalateProgress,
                    {
                      width: timerProgressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                      backgroundColor: getTimerColor(),
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* PATIENT TRIAGE URGENCY BADGE */}
          <View
            style={[
              styles.triageCard,
              isCat1
                ? styles.triageCardRed
                : isCat3
                  ? styles.triageCardGreen
                  : styles.triageCardYellow,
            ]}
          >
            <View style={styles.triageTopRow}>
              <View
                style={[
                  styles.triagePill,
                  isCat1
                    ? styles.triagePillRed
                    : isCat3
                      ? styles.triagePillGreen
                      : styles.triagePillYellow,
                ]}
              >
                <Text style={styles.triagePillDot}>•</Text>
                <Text
                  style={[
                    styles.triagePillText,
                    styles.triagePillTextOnFill,
                  ]}
                >
                  {triageInfo.badge}
                </Text>
              </View>
              <Text style={styles.missionIdTag}>#{missionId}</Text>
            </View>

            <Text
              style={[
                styles.triageTitle,
                isCat1
                  ? styles.triageTitleRed
                  : isCat3
                    ? styles.triageTitleGreen
                    : styles.triageTitleYellow,
              ]}
            >
              {triageInfo.title}
            </Text>
            <Text style={styles.triageDesc}>{triageInfo.description}</Text>

            {/* Crew Requirement Pill */}
            <View style={styles.crewNoticeBox}>
              <AppIcon icon={{ set: "ion", name: "people" }} size={14} color={colors.slate700} style={styles.crewIcon} />
              <Text style={styles.crewText}>{triageInfo.crewRequirement}</Text>
            </View>

          </View>

          {/* PICKUP LOCATION ADDRESS & DRIVING DISTANCE / ETA */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <AppIcon icon={{ set: "ion", name: "location" }} size={18} color={colors.slate700} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>{strings.pickupSectionTitle}</Text>
            </View>

            {/* Distance & ETA Hero Pill */}
            {(distanceKm !== undefined || etaMinutes !== undefined) && (
              <View style={styles.navigationHeroPill}>
                {distanceKm !== undefined && (
                  <View style={styles.navMetricCol}>
                    <Text style={styles.navMetricLabel}>{strings.pickupDistanceLabel}</Text>
                    <Text style={styles.navMetricValue}>{distanceKm.toFixed(1)} km</Text>
                  </View>
                )}
                {distanceKm !== undefined && etaMinutes !== undefined && <View style={styles.navDivider} />}
                {etaMinutes !== undefined && (
                  <View style={styles.navMetricCol}>
                    <Text style={styles.navMetricLabel}>{strings.pickupEtaLabel}</Text>
                    <Text style={styles.navMetricValueGreen}>{etaMinutes} mins ETA</Text>
                  </View>
                )}
              </View>
            )}

            {/* Street Address: only what the offer carried */}
            {(pickupAddress || pickupLandmark) && (
              <View style={styles.addressBox}>
                {pickupAddress ? <Text style={styles.addressMain}>{pickupAddress}</Text> : null}
                {pickupLandmark ? <Text style={styles.addressLandmark}>{pickupLandmark}</Text> : null}
              </View>
            )}
          </View>

          {/* REQUIRED AIS-125 VEHICLE CATEGORY & TIER-ELIGIBILITY GATE */}
          <View
            style={[
              styles.sectionCard,
              !isTierEligible && styles.tierMismatchCard,
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <AppIcon
                icon={{ set: "mci", name: "ambulance" }}
                size={18}
                color={colors.slate700}
                style={styles.sectionIcon}
              />
              <Text style={styles.sectionTitle}>{strings.requiredVehicleSectionTitle}</Text>
            </View>
            <View style={styles.vehicleTierRow}>
              <Text style={styles.vehicleTierLabel}>{strings.requiredVehicleLabel}:</Text>
              <Text style={styles.vehicleTierValue}>{requiredVehicleLabel}</Text>
            </View>
            <View style={styles.vehicleTierRow}>
              <Text style={styles.vehicleTierLabel}>{strings.yourVehicleLabel}:</Text>
              <Text
                style={[
                  styles.vehicleTierValue,
                  !isTierEligible && styles.vehicleTierValueMismatch,
                ]}
              >
                {registeredVehicleLabel}
              </Text>
            </View>
            {!isTierEligible && (
              <View style={styles.tierMismatchBanner}>
                <AppIcon icon={{ set: "ion", name: "warning" }} size={16} color={colors.slate700} style={styles.tierMismatchIcon} />
                <Text style={styles.tierMismatchText}>{strings.vehicleTierMismatchBanner}</Text>
              </View>
            )}
          </View>

          {/* PATIENT PRIMARY SYMPTOM SUMMARY */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <AppIcon icon={{ set: "mci", name: "stethoscope" }} size={18} color={colors.slate700} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>{strings.patientSectionTitle}</Text>
            </View>

            {/* Primary Symptom Headline */}
            <View style={styles.symptomHighlightBox}>
              <Text style={styles.symptomCategoryLabel}>
                {strings.symptomSummaryLabel}:
              </Text>
              {/* D-UX-02: only reported content. The former fixed headline and "42, Male" were chosen by tier, not by the patient. */}
              {patientSummary?.primaryComplaint ? (
                <Text style={styles.symptomHeadline}>{patientSummary.primaryComplaint.replace(/_/g, " ")}</Text>
              ) : (
                <Text style={styles.symptomHeadline}>{strings.symptomNotProvided}</Text>
              )}
              {patientSummary?.derivedFlags && patientSummary.derivedFlags.length > 0 && (
                <Text style={styles.demographicsText}>{patientSummary.derivedFlags.map((f) => f.replace(/_/g, " ")).join(" · ")}</Text>
              )}
              {patientSummary?.ageBand && patientSummary.sex && (
                <Text style={styles.demographicsText}>
                  <AppIcon icon={{ set: "ion", name: "person" }} />{" "}{patientSummary.sex} · {patientSummary.ageBand}
                </Text>
              )}
            </View>
          </View>
        </ScrollView>

        {/* BOTTOM ACTION BAR WITH SWIPE-TO-ACCEPT SLIDER */}
        <View style={styles.bottomBar}>
          {/* Notice to prevent accidental taps */}
          <Text style={styles.sliderHelperNotice}>
            {strings.sliderAccidentalTapNotice}
          </Text>

          {/* SWIPE-TO-ACCEPT HORIZONTAL SLIDER */}
          <View
            style={[
              styles.sliderTrack,
              isAccepted && styles.sliderTrackAccepted,
              !isTierEligible && styles.sliderTrackDisabled,
            ]}
          >
            {/* Background Revealing Fill */}
            <Animated.View
              style={[
                styles.sliderFill,
                {
                  width: panX.interpolate({
                    inputRange: [0, maxDragDistance],
                    outputRange: [SLIDER_THUMB_SIZE, sliderWidth],
                  }),
                },
              ]}
            />

            {/* Center Track Prompt */}
            <Text style={styles.sliderPromptText}>
              {isAccepted
                ? strings.sliderConfirmed
                : !isTierEligible
                ? strings.vehicleTierMismatchSliderPrompt
                : strings.sliderTrackPrompt}
            </Text>

            {/* Moving Draggable Thumb */}
            <Animated.View
              style={[
                styles.sliderThumb,
                {
                  transform: [{ translateX: panX }],
                },
              ]}
              {...panResponder.panHandlers}
            >
              <Text style={styles.sliderThumbIcon}>
                <AppIcon
                icon={
                  isAccepted
                    ? { set: "ion", name: "checkmark" }
                    : !isTierEligible
                    ? { set: "ion", name: "close" }
                    : { set: "mci", name: "ambulance" }
                }
                size={20}
              />
              </Text>
            </Animated.View>
          </View>

          {/* DECLINE / BUSY SECONDARY BUTTON */}
          <Pressable
            style={styles.declineSecondaryBtn}
            onPress={() => setIsDeclineSheetOpen(true)}
            disabled={isAccepted}
          >
            <Text style={styles.declineSecondaryBtnText}>
              <AppIcon icon={{ set: "ion", name: "close" }} />{" "}{strings.btnDecline}
            </Text>
          </Pressable>
        </View>

        {/* DECLINE REASONS ACTION SHEET MODAL */}
        <Modal
          visible={isDeclineSheetOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsDeclineSheetOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.declineSheetCard}>
              <View style={styles.declineIconCircle}>
                <AppIcon icon={{ set: "ion", name: "warning" }} size={22} color={colors.slate700} style={styles.declineIcon} />
              </View>
              <Text style={styles.declineSheetTitle}>
                {strings.declineSheetTitle}
              </Text>
              <Text style={styles.declineSheetSub}>
                {strings.declineSheetSubtitle}
              </Text>

              {/* Decline Reason Choices */}
              <View style={styles.reasonsList}>
                {[
                  strings.declineReasonTraffic,
                  strings.declineReasonMaintenance,
                  strings.declineReasonPatientOnboard,
                  strings.declineReasonOther,
                ].map((reason, idx) => (
                  <Pressable
                    key={idx}
                    style={[
                      styles.reasonOption,
                      selectedDeclineReason === reason && styles.reasonOptionSelected,
                    ]}
                    onPress={() => setSelectedDeclineReason(reason)}
                  >
                    <Text
                      style={[
                        styles.reasonOptionText,
                        selectedDeclineReason === reason &&
                          styles.reasonOptionTextSelected,
                      ]}
                    >
                      • {reason}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Confirm Decline Button */}
              <Pressable
                style={styles.confirmDeclineActionBtn}
                onPress={() =>
                  handleConfirmDecline(
                    selectedDeclineReason || strings.declineReasonTraffic
                  )
                }
              >
                <Text style={styles.confirmDeclineActionBtnText}>
                  {strings.btnConfirmDecline}
                </Text>
              </Pressable>

              {/* Keep Reviewing Button */}
              <Pressable
                style={styles.cancelDeclineBtn}
                onPress={() => setIsDeclineSheetOpen(false)}
              >
                <Text style={styles.cancelDeclineBtnText}>
                  {strings.btnCancelDecline}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.slate950,
  },

  // Emergency Top Banner
  emergencyBanner: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: colors.white,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bannerTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bannerSirenIcon: {
    fontSize: 26,
  },
  bannerTitle: {
    flexShrink: 1,
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.8,
  },
  bannerWaveTag: {
    flexShrink: 1,
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
  },
  bannerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sirenToggleBtn: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  sirenToggleIcon: {
    fontSize: 14,
  },
  langPill: {
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  langPillText: {
    color: colors.slate900,
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
  },

  // Scroll Area
  scrollView: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: 24,
    gap: spacing.base,
  },

  // 15s Radial Countdown Card
  countdownCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 2,
    borderColor: colors.slate300,
    gap: spacing.md,
    ...shadows.md,
  },
  clockContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  clockOuterRing: {
    width: 76,
    height: 76,
    borderRadius: radii.full,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate50,
  },
  clockInnerCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
  clockNumeral: {
    fontSize: 26,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: 30,
  },
  clockUnit: {
    fontSize: 9,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
  },
  clockNoticeWrap: {
    flex: 1,
  },
  clockHeading: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  clockSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2,
    marginBottom: 6,
  },
  waveEscalateBar: {
    height: 4,
    backgroundColor: colors.slate200,
    borderRadius: radii.full,
    overflow: "hidden",
  },
  waveEscalateProgress: {
    height: "100%",
    borderRadius: radii.full,
  },

  // Triage Urgency Card
  triageCard: {
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 2,
    gap: 8,
    ...shadows.md,
  },
  triageCardRed: {
    backgroundColor: colors.emergencyLight,
    borderColor: colors.emergencyBorder,
  },
  triageCardYellow: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
  },
  triageCardGreen: {
    backgroundColor: colors.triageGreenSurface,
    borderColor: colors.triageGreen,
  },
  triageTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  triagePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    gap: 4,
  },
  triagePillRed: {
    backgroundColor: colors.emergency,
  },
  triagePillYellow: {
    backgroundColor: colors.warning,
  },
  triagePillGreen: {
    backgroundColor: colors.triageGreen,
  },
  triagePillDot: {
    color: colors.white,
    fontSize: 12,
  },
  triagePillText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  triagePillTextOnFill: {
    color: colors.white,
  },
  missionIdTag: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
  },
  triageTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: typography.lineHeights.lg,
  },
  triageTitleRed: {
    color: colors.emergencyDark,
  },
  triageTitleYellow: {
    color: semanticColors.triage.yellow.textAccessible, // nearest existing high-contrast amber token
  },
  triageTitleGreen: {
    color: colors.triageGreenText,
  },
  triageDesc: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate800,
    lineHeight: typography.lineHeights.sm,
  },
  crewNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    padding: spacing.sm,
    borderRadius: radii.md,
    gap: 6,
    marginTop: 2,
  },
  crewIcon: {
    fontSize: 14,
  },
  crewText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  // Section Cards
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.slate300,
    gap: spacing.sm,
    ...shadows.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },

  // Required Vehicle Tier & Mismatch Gate
  tierMismatchCard: {
    borderColor: colors.emergencyBorder,
    backgroundColor: colors.emergencyLight,
  },
  vehicleTierRow: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  vehicleTierLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
  },
  vehicleTierValue: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  vehicleTierValueMismatch: {
    color: colors.emergencyDark,
  },
  tierMismatchBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 6,
    marginTop: 2,
  },
  tierMismatchIcon: {
    fontSize: 16,
  },
  tierMismatchText: {
    flex: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.emergencyDark,
  },

  // Navigation Metric Hero
  navigationHeroPill: {
    flexDirection: "row",
    backgroundColor: colors.slate900,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  navMetricCol: {
    flex: 1,
    alignItems: "center",
  },
  navMetricLabel: {
    flexShrink: 1,
    fontSize: 10,
    color: colors.slate400,
    fontWeight: typography.fontWeights.medium,
  },
  navMetricValue: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
    marginTop: 2,
  },
  navMetricValueGreen: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.triageGreen, // nearest existing token
    marginTop: 2,
  },
  navDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  addressBox: {
    backgroundColor: colors.slate50,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  addressMain: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  addressLandmark: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    lineHeight: typography.lineHeights.xs,
  },
  trafficRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  trafficDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.success,
  },
  trafficText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    color: colors.success,
  },

  // Symptom Card
  symptomHighlightBox: {
    backgroundColor: colors.slate50,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  symptomCategoryLabel: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
    textTransform: "uppercase",
  },
  symptomHeadline: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  demographicsText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    marginTop: 2,
  },
  vitalsListWrap: {
    gap: 6,
    marginTop: 2,
  },
  vitalsHeader: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  vitalBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  vitalBadge: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  vitalBadgeText: {
    fontSize: 11,
    color: colors.slate900,
    fontWeight: typography.fontWeights.medium,
  },

  // Bottom Action Bar & Swipe Slider
  bottomBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? 24 : spacing.base,
    borderTopWidth: 2,
    borderTopColor: colors.slate200,
    gap: 8,
    ...shadows.emergency,
  },
  sliderHelperNotice: {
    fontSize: 10,
    color: colors.slate600,
    textAlign: "center",
  },
  sliderTrack: {
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.slate900,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    padding: SLIDER_TRACK_PADDING,
  },
  sliderTrackAccepted: {
    backgroundColor: colors.success,
  },
  sliderTrackDisabled: {
    backgroundColor: colors.slate400,
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
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
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
  sliderThumbIcon: {
    fontSize: 26,
  },
  declineSecondaryBtn: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  declineSecondaryBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
  },

  // Decline Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.base,
  },
  declineSheetCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    ...shadows.md,
  },
  declineIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.warning,
  },
  declineIcon: {
    fontSize: 22,
  },
  declineSheetTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
  },
  declineSheetSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    textAlign: "center",
    lineHeight: typography.lineHeights.xs,
  },
  reasonsList: {
    width: "100%",
    gap: 6,
  },
  reasonOption: {
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  reasonOptionSelected: {
    borderColor: colors.emergency,
    backgroundColor: colors.emergencyLight,
  },
  reasonOptionText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate800,
    fontWeight: typography.fontWeights.medium,
  },
  reasonOptionTextSelected: {
    color: colors.emergencyDark,
    fontWeight: typography.fontWeights.bold,
  },
  confirmDeclineActionBtn: {
    width: "100%",
    backgroundColor: colors.emergency,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    ...shadows.emergency,
  },
  confirmDeclineActionBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  cancelDeclineBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelDeclineBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
  },
});
