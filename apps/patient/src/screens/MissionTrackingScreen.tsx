import { useState, type Ref } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, semanticColors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { AIS125VehicleType, TriageSymptomFlag, type GeoPoint } from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { trackingStrings } from "../i18n/trackingStrings";

import { AppIcon, MapViewPort, type DriverMarkerHandle } from "../components";
import type { MapRoute } from "../hooks/useDrivingRoute";
import { DEFAULT_PICKUP } from "../services/mapGeo.core";

export interface MissionTrackingScreenProps {
  missionId?: string;
  vehicleType?: AIS125VehicleType;
  triagedSymptom?: TriageSymptomFlag;
  initialLanguage?: SupportedLanguage;
  onCallDriver?: () => void;
  onCall108?: () => void;
  onBack?: () => void;
  /** Mission pickup (lat/lon route params); the map centres on it. */
  pickup?: GeoPoint;
  /** Road route to the pickup, when one is known (never from a made-up ambulance position). */
  route?: MapRoute | null;
  /** Live pings move the marker through this handle, so no screen re-renders per ping. */
  driverMarkerRef?: Ref<DriverMarkerHandle>;
  /** The ambulance's last real position; without one the marker waits for the first live ping. */
  driverStart?: GeoPoint;
  /** Safe-for-text live speed, throttled upstream to at most one update
   *  every ~2s - see useMissionChannel's throttledTelemetry. */
  liveSpeedKmh?: number | null;
  /** From machine context (SERVER_DRIVER_ARRIVED) - true once the driver
   *  has physically reached the pickup point. Same screen throughout
   *  (tracking never changes state.value for this), just a different
   *  step in the progression pill below. */
  driverHasArrived?: boolean;
  /** Server-supplied (DRIVER_ACCEPTED.data). Every field is optional and a missing one is hidden, never invented. */
  assignedDriver?: { displayName?: string; vehicleRegistration?: string; ais125Type?: string; makeModel?: string; color?: string; crewCount?: number };
  /** Virtual relay number provisioned for this mission. No number => no call button (no fixed placeholder number). */
  maskedCall?: { number: string; extension?: string };
  /** Routed ETA from the server; absent => the ETA card is not shown. */
  etaMinutes?: number;
  /** The mission's statutory booking estimate (server fare_details); omitted when unknown. */
  estimatedFareInr?: number;
  /** Feed health from useMissionChannel: the "live" badge is only shown when this is `live`. */
  connection?: "live" | "connecting" | "awaitingGps" | "paused";
}

/**
 * MissionTrackingScreen for Ek-Ambulance
 *
 * Represents the XState `en_route_to_patient` (or `tracking`) mission state:
 * - Top Half: Interactive Mapbox/Google Map style canvas with pickup location,
 *   live driver vehicle marker updating via Centrifugo WebSocket streams,
 *   traffic-colored route polyline, and live traffic ETA banner.
 * - Lower Half: Comprehensive emergency information sheet:
 *   - Current mission state pill: 'Driver Assigned' -> 'En Route' -> 'Arrived on Scene'
 *   - Verified paramedic driver profile, photo, rating, and dispatch record.
 *   - Ambulance HSRP license plate, AIS-125 tier badge, and equipment inventory.
 *   - One-touch privacy-masked phone call button and emergency chat trigger.
 *   - Expandable 'Preparation Guide' with symptom-specific pre-arrival first-aid protocol.
 *   - Emergency 108 government fallback dialer.
 * - WCAG AAA compliance, high-contrast typography, and bilingual i18n.
 */
export default function MissionTrackingScreen({
  missionId = "",
  vehicleType,
  triagedSymptom,
  initialLanguage = "en",
  onCallDriver,
  onCall108,
  onBack,
  pickup = DEFAULT_PICKUP,
  route,
  driverMarkerRef,
  driverStart,
  liveSpeedKmh,
  driverHasArrived = false,
  assignedDriver,
  maskedCall,
  etaMinutes,
  estimatedFareInr,
  connection = "connecting",
}: MissionTrackingScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [isGuideExpanded, setIsGuideExpanded] = useState<boolean>(true);

  const strings = trackingStrings[language];

  // Resolve symptom guide
  const symptomKey =
    // Unknown symptom (e.g. resumed after a restart): the general guide, never another condition's instructions.
    triagedSymptom && triagedSymptom in strings.guidesBySymptom
      ? (triagedSymptom as keyof typeof strings.guidesBySymptom)
      : "default";
  const guideData = strings.guidesBySymptom[symptomKey] || strings.guidesBySymptom.default;

  // ---------------------------------------------------------------------------
  // PHONE CALL HANDLER (MASKED RELAY)
  // ---------------------------------------------------------------------------
  const handleCallDriver = () => {
    if (onCallDriver) {
      onCallDriver();
      return;
    }
    // Only ever the number the server provisioned for this mission; the button is not rendered without one.
    if (!maskedCall) return;
    const maskedTel = `tel:${maskedCall.number}${maskedCall.extension ? `,${maskedCall.extension}` : ""}`;
    Linking.openURL(maskedTel).catch(() => {
      Alert.alert(strings.callDriverButton, maskedCall.number);
    });
  };

  // ---------------------------------------------------------------------------
  // 108 EMERGENCY HELPLINE HANDLER
  // ---------------------------------------------------------------------------
  const handleCall108 = () => {
    if (onCall108) {
      onCall108();
      return;
    }
    const tel108 = "tel:108";
    Linking.canOpenURL(tel108)
      .then((supported) => {
        if (supported) {
          Linking.openURL(tel108);
        } else {
          Alert.alert("108 Fallback", "Govt. Emergency Helpline: 108");
        }
      })
      .catch(() => {
        Alert.alert("108 Fallback", "Dialing 108...");
      });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP HEADER */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeftGroup}>
          {onBack && (
            <Pressable
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.backButton}
              onPress={onBack}
            >
              <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={20} style={styles.backArrow} />
            </Pressable>
          )}
          <View>
            <Text style={styles.headerTitle}>{strings.screenTitle}</Text>
            <Text style={styles.headerMissionId}>
              {strings.missionIdLabel(missionId)}
            </Text>
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
        nestedScrollEnabled
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* AMBULANCE MATCHED: everything here comes from the server's DRIVER_ACCEPTED / DRIVER_ARRIVED events
            (context.assignedDriver, driverHasArrived) or the booked vehicle type; a field the server did not send is
            left out, never filled in. */}
        <View style={styles.heroCard} accessibilityRole="summary">
          <Text style={styles.heroStatus}>{driverHasArrived ? strings.arrivedTitle : strings.matchedTitle}</Text>
          <Text style={styles.heroType} numberOfLines={2}>
            {(() => {
              const t = assignedDriver?.ais125Type ?? vehicleType;
              return t ? (strings.vehicleTypeName[t] ?? t) : "—";
            })()}
          </Text>
          {etaMinutes !== undefined && !driverHasArrived && (
            <View style={styles.heroEtaRow}>
              <Text style={styles.heroEtaLabel}>{strings.etaLabel}</Text>
              <Text style={styles.heroEtaValue}>{strings.etaOnlyLabel(etaMinutes)}</Text>
            </View>
          )}
          {assignedDriver?.vehicleRegistration && (
            <View style={styles.heroRow}>
              <Text style={styles.heroLabel}>{strings.vehicleLabel}</Text>
              <View style={styles.hsrpPlate}>
                <View style={styles.hsrpIndStrip}>
                  <Text style={styles.hsrpIndText}>IND</Text>
                </View>
                <Text style={styles.hsrpNumberText} numberOfLines={1}>{assignedDriver.vehicleRegistration}</Text>
              </View>
            </View>
          )}
          {(assignedDriver?.makeModel || assignedDriver?.color) && (
            <Text style={styles.heroDetail} numberOfLines={2}>{[assignedDriver.makeModel, assignedDriver.color].filter(Boolean).join(" · ")}</Text>
          )}
          {assignedDriver?.displayName && (
            <View style={styles.heroRow}>
              <Text style={styles.heroLabel}>{strings.driverLabel}</Text>
              <Text style={styles.heroValue} numberOfLines={1}>{assignedDriver.displayName}</Text>
            </View>
          )}
          {assignedDriver?.crewCount !== undefined && <Text style={styles.heroDetail}>{strings.crewSize(assignedDriver.crewCount)}</Text>}
          {estimatedFareInr !== undefined && (
            <View style={styles.heroRow}>
              <Text style={styles.heroLabel}>{strings.estimatedFareLabel}</Text>
              <Text style={styles.heroValue} numberOfLines={1}>₹{Math.round(estimatedFareInr)}</Text>
            </View>
          )}
          {/* Only when the server provisioned a relay number for this mission. */}
          {(maskedCall || onCallDriver) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.callDriverButton}
              accessibilityHint={strings.callDriverSubtitle}
              style={styles.heroCallBtn}
              onPress={handleCallDriver}
            >
              <AppIcon icon={{ set: "ion", name: "call" }} size={20} color={colors.white} />
              <Text style={styles.heroCallText}>{strings.callDriverButton}</Text>
            </Pressable>
          )}
        </View>

        {/* ===================================================================
            TOP HALF: INTERACTIVE MAP VIEWPORT
           =================================================================== */}
        <MapViewPort
          pickup={pickup}
          route={route}
          driverMarkerRef={driverMarkerRef}
          driverStart={driverStart}
          speedLabel={liveSpeedKmh != null ? strings.speedIndicator(liveSpeedKmh) : "-- km/h"}
          onCall108={handleCall108}
          overlays={
            <>
              {/* Centrifugo WebSocket Live Status Pill */}
              <View style={styles.centrifugoBadge}>
                <View style={styles.centrifugoPulseDot} />
                <Text style={styles.centrifugoBadgeText}>
                  {connection === "live" ? strings.centrifugoLiveBadge : connection === "connecting" ? strings.trackingConnectingBadge : connection === "awaitingGps" ? strings.trackingAwaitingGpsBadge : strings.trackingPausedBadge}
                </Text>
              </View>

              {/* ETA is shown only when the server supplied one; no traffic or corridor claims are made. */}
              {etaMinutes !== undefined && (
                <View style={styles.trafficEtaCard}>
                  <View style={styles.trafficEtaTopRow}>
                    <Text style={styles.trafficEtaMain}>{strings.etaOnlyLabel(etaMinutes)}</Text>
                    {connection === "live" && (
                      <View style={styles.trafficStatusBadge}>
                        <Text style={styles.trafficStatusBadgeText}>{strings.liveGpsBadge}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          }
        />

        {/* ===================================================================
            LOWER HALF: EMERGENCY INFORMATION SHEET
           =================================================================== */}
        <View style={styles.sheetContainer}>
          {/* 1. CURRENT MISSION STATE PROGRESSION PILL */}
          <View style={styles.stateTrackerCard}>
            <View style={styles.stateStepperRow}>
              {/* Step 1: Driver Assigned (Completed) */}
              <View style={styles.stateStepItem}>
                <View style={[styles.stateCircle, styles.stateCircleCompleted]}>
                  <AppIcon icon={{ set: "ion", name: "checkmark" }} size={12} style={styles.stateCircleText} />
                </View>
                <Text style={styles.stateStepText}>
                  {strings.stateStepAssigned}
                </Text>
              </View>

              <View style={[styles.stateLine, styles.stateLineActive]} />

              {/* Step 2: En Route */}
              <View style={styles.stateStepItem}>
                <View
                  style={[
                    styles.stateCircle,
                    driverHasArrived ? styles.stateCircleCompleted : styles.stateCircleActive,
                  ]}
                >
                  {driverHasArrived ? (
                    <AppIcon icon={{ set: "ion", name: "checkmark" }} size={12} style={styles.stateCircleText} />
                  ) : (
                    <View style={styles.statePulsingDot} />
                  )}
                </View>
                <Text
                  style={[
                    styles.stateStepText,
                    !driverHasArrived && styles.stateStepTextActive,
                  ]}
                >
                  {strings.stateStepEnRoute}
                </Text>
              </View>

              <View style={[styles.stateLine, driverHasArrived && styles.stateLineActive]} />

              {/* Step 3: Arrived on Scene - active once SERVER_DRIVER_ARRIVED
                  has fired (context.driverHasArrived), still upcoming until then */}
              <View style={styles.stateStepItem}>
                <View
                  style={[
                    styles.stateCircle,
                    driverHasArrived ? styles.stateCircleActive : styles.stateCirclePending,
                  ]}
                >
                  {driverHasArrived ? (
                    <View style={styles.statePulsingDot} />
                  ) : (
                    <Text style={styles.stateCircleTextPending}>3</Text>
                  )}
                </View>
                <Text
                  style={
                    driverHasArrived
                      ? [styles.stateStepText, styles.stateStepTextActive]
                      : styles.stateStepTextPending
                  }
                >
                  {strings.stateStepArrived}
                </Text>
              </View>
            </View>

            <View style={styles.stateNoticeBanner}>
              <AppIcon icon={{ set: "mci", name: "car-emergency" }} size={16} color={colors.slate700} style={styles.stateNoticeIcon} />
              <Text style={styles.stateNoticeText}>
                {strings.activeStatusBanner}
              </Text>
            </View>
          </View>

          {/* 5. EXPANDABLE PREPARATION GUIDE (FIRST-AID STEPS) */}
          <View style={styles.guideCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${strings.guideHeaderTitle} - ${guideData.symptomName}`}
              accessibilityState={{ expanded: isGuideExpanded }}
              style={styles.guideHeaderTouchable}
              onPress={() => setIsGuideExpanded((prev) => !prev)}
            >
              <View style={styles.guideHeaderIconBadge}>
                <AppIcon icon={{ set: "ion", name: "shield-checkmark" }} size={20} color={colors.slate700} style={styles.guideHeaderIcon} />
              </View>

              <View style={styles.guideHeaderTextGroup}>
                <Text style={styles.guideHeaderTitle}>
                  {strings.guideHeaderTitle}
                </Text>
                <Text style={styles.guideHeaderSubtitle}>
                  {guideData.symptomName}
                </Text>
              </View>

              <View style={styles.guideToggleBadge}>
                <Text style={styles.guideToggleArrow}>
                  <AppIcon
                icon={
                  isGuideExpanded
                    ? { set: "ion", name: "caret-up" }
                    : { set: "ion", name: "caret-down" }
                }
                size={12}
              />
                </Text>
              </View>
            </Pressable>

            {/* Expandable Content */}
            {isGuideExpanded && (
              <View style={styles.guideBody}>
                <View style={styles.guideSymptomBanner}>
                  <Text style={styles.guideSymptomBadgeText}>
                    {guideData.badge}
                  </Text>
                </View>

                {/* Numbered Steps */}
                <View style={styles.stepsList}>
                  {guideData.instructions.map((step) => (
                    <View key={step.stepNumber} style={styles.stepCard}>
                      <View style={styles.stepNumberBadge}>
                        <Text style={styles.stepNumberText}>
                          {step.stepNumber}
                        </Text>
                      </View>
                      <View style={styles.stepContentGroup}>
                        <View style={styles.stepTitleRow}>
                          <AppIcon
                            icon={step.icon}
                            size={14}
                            color={colors.slate700}
                            style={styles.stepIcon}
                          />
                          <Text style={styles.stepTitle}>{step.title}</Text>
                        </View>
                        <Text style={styles.stepDescription}>
                          {step.description}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Crucial Clinical Warning Callout */}
                <View style={styles.guideWarningCallout}>
                  <Text style={styles.guideWarningText}>
                    {guideData.warningText}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* 6. EMERGENCY 108 HELPLINE FALLBACK DIALER */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.fallback108Button}
            style={styles.emergency108Btn}
            onPress={handleCall108}
          >
            <Text style={styles.emergency108BtnText}>
              <AppIcon icon={{ set: "mci", name: "car-emergency" }} />{" "}{strings.fallback108Button}
            </Text>
          </Pressable>

        </View>
      </ScrollView>

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
  headerLeftGroup: {
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
  backArrow: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.slate900,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerMissionId: {
    flexShrink: 1,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing["3xl"],
  },
  heroCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.base,
    marginBottom: spacing.base,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    ...shadows.sm,
  },
  heroStatus: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.success,
  },
  heroType: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  heroEtaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  heroEtaLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate600,
  },
  heroEtaValue: {
    fontSize: typography.fontSizes["2xl"],
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  heroLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate600,
    minWidth: 56,
  },
  heroValue: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate900,
  },
  heroDetail: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
  },
  heroCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 56,
    marginTop: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.success,
  },
  heroCallText: {
    color: colors.white,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },





  // Overlays
  centrifugoBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
    zIndex: 20,
  },
  centrifugoPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: semanticColors.status.verifiedBorder,
    marginRight: 6,
  },
  centrifugoBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.white,
  },
  trafficEtaCard: {
    position: "absolute",
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.md,
    zIndex: 20,
  },
  trafficEtaTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trafficEtaMain: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
    letterSpacing: 0.3,
  },
  trafficStatusBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.success,
  },
  trafficStatusBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: "800",
    color: colors.success,
  },

  // ===========================================================================
  // LOWER HALF: INFORMATION SHEET STYLES
  // ===========================================================================
  sheetContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    gap: spacing.base,
  },

  // Mission State Progress Tracker
  stateTrackerCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  stateStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stateStepItem: {
    alignItems: "center",
    width: 80,
  },
  stateCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    marginBottom: 4,
  },
  stateCircleCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stateCircleActive: {
    backgroundColor: colors.emergencyLight,
    borderColor: colors.emergency,
  },
  stateCirclePending: {
    backgroundColor: colors.slate100,
    borderColor: colors.slate300,
  },
  stateCircleText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.white,
  },
  stateCircleTextPending: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.slate500,
  },
  statePulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.emergency,
  },
  stateLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.slate300,
    marginHorizontal: 4,
    marginBottom: 16,
  },
  stateLineActive: {
    backgroundColor: colors.emergency,
  },
  stateStepText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
    textAlign: "center",
  },
  stateStepTextActive: {
    color: colors.emergencyDark,
    fontWeight: typography.fontWeights.extrabold,
  },
  stateStepTextPending: {
    color: colors.slate400,
  },
  stateNoticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergencyLight,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  stateNoticeIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  stateNoticeText: {
    fontSize: typography.fontSizes.xs,
    color: colors.emergencyDark,
    fontWeight: typography.fontWeights.semibold,
    flex: 1,
  },

  // Driver Card

  // Ambulance Specs
  hsrpPlate: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.slate900,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
    ...shadows.sm,
  },
  hsrpIndStrip: {
    backgroundColor: colors.info, // nearest existing token
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
    marginRight: 6,
  },
  hsrpIndText: {
    fontSize: 8,
    fontWeight: "900",
    color: colors.white,
  },
  hsrpNumberText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: 1,
  },

  // Action Buttons

  // Preparation Guide
  guideCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    overflow: "hidden",
    ...shadows.sm,
  },
  guideHeaderTouchable: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.base,
    backgroundColor: colors.slate50,
  },
  guideHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.infoLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  guideHeaderIcon: {
    fontSize: 20,
  },
  guideHeaderTextGroup: {
    flex: 1,
  },
  guideHeaderTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  guideHeaderSubtitle: {
    fontSize: 11,
    color: colors.info,
    fontWeight: typography.fontWeights.semibold,
    marginTop: 2,
  },
  guideToggleBadge: {
    padding: spacing.xs,
  },
  guideToggleArrow: {
    fontSize: 12,
    color: colors.slate600,
    fontWeight: "bold",
  },
  guideBody: {
    padding: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  guideSymptomBanner: {
    alignSelf: "flex-start",
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.info,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  guideSymptomBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.info,
    letterSpacing: 0.5,
  },
  stepsList: {
    gap: spacing.md,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.slate50,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  stepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.slate900,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.white,
  },
  stepContentGroup: {
    flex: 1,
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  stepIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  stepTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    flex: 1,
  },
  stepDescription: {
    fontSize: 11,
    color: colors.slate700,
    lineHeight: 17,
  },
  guideWarningCallout: {
    backgroundColor: colors.warningLight,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  guideWarningText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    color: colors.warning,
    lineHeight: 16,
  },

  // Emergency 108 Action
  emergency108Btn: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  emergency108BtnText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },

  // Modal
});
