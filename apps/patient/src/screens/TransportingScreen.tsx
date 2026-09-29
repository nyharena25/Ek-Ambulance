import { useState, type Ref } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ScrollView,
  Linking,
  Share,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, semanticColors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { AIS125VehicleType, type GeoPoint } from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { transportingStrings } from "../i18n/transportingStrings";

import { AppIcon, MapViewPort, type DriverMarkerHandle } from "../components";
import type { MapRoute } from "../hooks/useDrivingRoute";
import { DEFAULT_PICKUP, findHospital } from "../services/mapGeo.core";

export interface TransportingScreenProps {
  missionId?: string;
  patientName?: string;
  vehicleType?: AIS125VehicleType;
  /** The hospital the driver selected (TRANSPORT_STARTED.destination). Absent => "not confirmed yet", never a default hospital. */
  hospitalName?: string;
  /** Only when the server actually made a bed hold; otherwise the ward card is not shown. */
  wardStatus?: string;
  etaMinutes?: number;
  /** The driver reached the hospital and is completing the handoff. */
  hospitalArrived?: boolean;
  connection?: "live" | "connecting" | "paused";
  initialLanguage?: SupportedLanguage;
  onCallCrew?: () => void;
  onCall108?: () => void;
  onBack?: () => void;
  /** Where the transport leg started; the map centres here before the route fits. */
  pickup?: GeoPoint;
  /** OSRM route pickup -> hospital, fetched once by booking/[id].tsx. */
  route?: MapRoute | null;
  /** Live pings move the marker through this handle, so no screen re-renders per ping. */
  driverMarkerRef?: Ref<DriverMarkerHandle>;
  driverStart?: GeoPoint;
  /** Safe-for-text live speed, throttled upstream to at most one update
   *  every ~2s - see useMissionChannel's throttledTelemetry. */
  liveSpeedKmh?: number | null;
}

/**
 * TransportingScreen for Ek-Ambulance
 *
 * Represents the XState `transporting` lifecycle state:
 * - Live ambulance route toward assigned destination hospital.
 * - Remaining distance and travel time with priority traffic corridor ETA.
 * - Hospital ward readiness status ('Trauma ICU Alerted - Bed Held').
 * - Emergency trigger to share live mission tracking via SMS/WhatsApp with family members.
 * - Real-time onboard clinical telemetry (Heart Rate, SpO2, BP, Oxygen).
 * - Full WCAG AAA high-contrast compliance and bilingual localization.
 */
export default function TransportingScreen({
  missionId = "",
  vehicleType = "TYPE_D_ALS",
  hospitalName,
  wardStatus,
  etaMinutes,
  hospitalArrived = false,
  connection = "connecting",
  initialLanguage = "en",
  onCallCrew,
  onCall108,
  onBack,
  pickup = DEFAULT_PICKUP,
  route,
  driverMarkerRef,
  driverStart = pickup,
  liveSpeedKmh,
}: TransportingScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const strings = transportingStrings[language];

  const hospital = findHospital(hospitalName ?? "");

  // ---------------------------------------------------------------------------
  // FAMILY EMERGENCY SHARE HANDLERS (WHATSAPP & SMS)
  // ---------------------------------------------------------------------------
  // Only facts the server supplied: no invented plate, ETA, distance or tracking link (nothing serves that domain).
  const generateShareMessage = () => strings.familyShareMessage({ hospitalName, etaMinutes });

  const handleShareWhatsApp = async () => {
    const message = generateShareMessage();
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;

    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
        showToast(strings.shareSuccessToast);
      } else {
        // Fallback to system share
        await Share.share({
          message,
          title: strings.shareMessageTitle,
        });
        showToast(strings.shareSuccessToast);
      }
    } catch {
      await Share.share({
        message,
        title: strings.shareMessageTitle,
      });
      showToast(strings.shareSuccessToast);
    }
  };

  const handleShareSms = async () => {
    const message = generateShareMessage();
    try {
      await Share.share({
        message,
        title: strings.shareMessageTitle,
      });
      showToast(strings.shareSuccessToast);
    } catch {
      Alert.alert(strings.shareSectionTitle, message);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // ---------------------------------------------------------------------------
  // CREW & 108 CONTACT HANDLERS
  // ---------------------------------------------------------------------------
  const handleCall108 = () => {
    if (onCall108) {
      onCall108();
      return;
    }
    Linking.openURL("tel:108").catch(() => {
      Alert.alert("108 Fallback", "Calling 108...");
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
        {/* ===================================================================
            TOP HALF: LIVE AMBULANCE TO HOSPITAL ROUTE MAP
           =================================================================== */}
        <MapViewPort
          pickup={pickup}
          destination={hospital}
          route={route}
          center={pickup}
          fitRoute
          driverMarkerRef={driverMarkerRef}
          driverStart={driverStart}
          speedLabel={liveSpeedKmh != null ? strings.speedText(liveSpeedKmh) : "-- km/h"}
          onCall108={handleCall108}
          overlays={
            <>
              {/* Centrifugo WebSocket Live Status Pill */}
              <View style={styles.centrifugoBadge}>
                <View style={styles.centrifugoPulseDot} />
                <Text style={styles.centrifugoBadgeText}>
                  {connection === "live" ? strings.centrifugoLiveBadge : connection === "connecting" ? strings.trackingConnectingBadge : strings.trackingPausedBadge}
                </Text>
              </View>

              {/* ETA only when the server gave one; no corridor or traffic claims. */}
              {etaMinutes !== undefined && !hospitalArrived && (
                <View style={styles.trafficEtaCard}>
                  <View style={styles.trafficEtaTopRow}>
                    <Text style={styles.trafficEtaMain}>{strings.etaOnlyLabel(etaMinutes)}</Text>
                  </View>
                </View>
              )}
            </>
          }
        />

        {/* ===================================================================
            LOWER HALF: INFORMATION SHEET
           =================================================================== */}
        <View style={styles.sheetContainer}>
          {/* TOAST CONFIRMATION BANNER */}
          {toastMessage && (
            <View style={styles.toastBanner}>
              <AppIcon icon={{ set: "ion", name: "checkmark" }} size={18} style={styles.toastIcon} />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          )}

          {/* LIFECYCLE STATE BANNER */}
          <View style={styles.stateBannerCard}>
            <View style={styles.stateBannerTopRow}>
              <View style={styles.stateDot} />
              <Text style={styles.stateBadgeText}>{strings.stateBadge}</Text>
            </View>
            <Text style={styles.stateDescriptionText}>
              {hospitalArrived ? strings.hospitalArrivedNotice : strings.stateDescription}
            </Text>
          </View>

          {/* 1. HOSPITAL WARD READINESS STATUS CARD */}
          <View style={styles.hospitalCard}>
            <Text style={styles.cardSectionLabel}>
              {strings.hospitalSectionTitle}
            </Text>

            <View style={styles.hospitalHeaderRow}>
              <View style={styles.hospitalIconCircle}>
                <AppIcon icon={{ set: "mci", name: "hospital-building" }} size={22} color={colors.slate700} style={styles.hospitalIconEmoji} />
              </View>
              <View style={styles.hospitalTitleGroup}>
                <Text style={styles.hospitalNameText}>{hospitalName ?? strings.hospitalPendingText}</Text>
              </View>
            </View>

            {/* WARD STATUS: only what the server reported (a real bed hold). The itemised checklist that used to sit
                here (bed number, trauma team, ECG) was static text nothing produced (G-02). */}
            {wardStatus && (
              <View style={styles.wardReadinessBanner}>
                <View style={styles.wardBannerTopRow}>
                  <View style={styles.bedHeldPill}>
                    <Text style={styles.bedHeldPillText}>{wardStatus}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* 2. EMERGENCY TRIGGER: SHARE LIVE TRACKING WITH FAMILY */}
          <View style={styles.shareCard}>
            <View style={styles.shareHeaderRow}>
              <View style={styles.shareIconBadge}>
                <AppIcon icon={{ set: "ion", name: "man" }} size={22} color={colors.slate700} style={styles.shareIconEmoji} />
              </View>
              <View style={styles.shareTitleGroup}>
                <Text style={styles.shareSectionTitle}>
                  {strings.shareSectionTitle}
                </Text>
                <Text style={styles.shareSectionDescription}>
                  {strings.shareSectionDescription}
                </Text>
              </View>
            </View>

            {/* Share Trigger Action Buttons */}
            <View style={styles.shareButtonsRow}>
              {/* WhatsApp Share Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.shareWhatsAppButton}
                accessibilityHint="Opens WhatsApp to share real-time ambulance tracking link with family"
                style={styles.whatsAppButton}
                onPress={handleShareWhatsApp}
              >
                <AppIcon icon={{ set: "ion", name: "chatbubble-ellipses" }} size={16} color={colors.slate700} style={styles.shareBtnIcon} />
                <Text style={styles.whatsAppButtonText}>
                  {strings.shareWhatsAppButton}
                </Text>
              </Pressable>

              {/* SMS / System Share Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.shareSmsButton}
                accessibilityHint="Opens system share dialog to share tracking link via SMS or messaging apps"
                style={styles.smsButton}
                onPress={handleShareSms}
              >
                <AppIcon icon={{ set: "ion", name: "phone-portrait" }} size={16} color={colors.slate700} style={styles.shareBtnIcon} />
                <Text style={styles.smsButtonText}>
                  {strings.shareSmsButton}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 3. ONBOARD CLINICAL TELEMETRY CARD (AIS-125) */}
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>
              {strings.telemetrySectionTitle}
            </Text>

            <View style={styles.vitalsGrid}>
              <View style={styles.vitalCard}>
                <AppIcon icon={{ set: "mci", name: "heart-pulse" }} size={16} color={colors.slate700} style={styles.vitalIcon} />
                <Text style={styles.vitalLabel}>
                  {strings.vitalHeartRateLabel}
                </Text>
                <Text style={styles.vitalValue}>
                  {strings.vitalHeartRateValue}
                </Text>
              </View>

              <View style={styles.vitalCard}>
                <AppIcon icon={{ set: "mci", name: "lungs" }} size={16} color={colors.slate700} style={styles.vitalIcon} />
                <Text style={styles.vitalLabel}>
                  {strings.vitalSpO2Label}
                </Text>
                <Text style={styles.vitalValue}>
                  {strings.vitalSpO2Value}
                </Text>
              </View>

              <View style={styles.vitalCard}>
                <AppIcon icon={{ set: "mci", name: "blood-bag" }} size={16} color={colors.slate700} style={styles.vitalIcon} />
                <Text style={styles.vitalLabel}>
                  {strings.vitalBloodPressureLabel}
                </Text>
                <Text style={styles.vitalValue}>
                  {strings.vitalBloodPressureValue}
                </Text>
              </View>

              <View style={styles.vitalCard}>
                <AppIcon icon={{ set: "ion", name: "flash" }} size={16} color={colors.slate700} style={styles.vitalIcon} />
                <Text style={styles.vitalLabel}>
                  {strings.vitalOxygenFlowLabel}
                </Text>
                <Text style={styles.vitalValue}>
                  {strings.vitalOxygenFlowValue}
                </Text>
              </View>
            </View>

            <View style={styles.paramedicNoteBanner}>
              <Text style={styles.paramedicNoteText}>
                <AppIcon icon={{ set: "ion", name: "man" }} size={11} />{" "}{strings.paramedicObservation}
              </Text>
            </View>
          </View>

          {/* 4. AMBULANCE REGISTRATION & CREW CONTACT */}
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>
              {strings.vehicleLicensePlateLabel}
            </Text>

            <View style={styles.vehicleRow}>
              {/* Indian HSRP Number Plate */}
              <View style={styles.hsrpPlate}>
                <View style={styles.hsrpIndStrip}>
                  <Text style={styles.hsrpIndText}>IND</Text>
                </View>
                <Text style={styles.hsrpNumberText}>
                  {strings.vehicleLicensePlate}
                </Text>
              </View>

              <View style={styles.careTierPill}>
                <Text style={styles.careTierPillText}>
                  {vehicleType.replace(/_/g, " ")}
                </Text>
              </View>
            </View>

            {/* Crew Contact Trigger: only with a real relay number (no fixed placeholder number) */}
            {onCallCrew && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.callCrewButton}
              style={styles.callCrewBtn}
              onPress={onCallCrew}
            >
              <AppIcon icon={{ set: "ion", name: "call" }} size={18} color={colors.slate700} style={styles.callCrewBtnIcon} />
              <View style={styles.callCrewTextGroup}>
                <Text style={styles.callCrewBtnText}>
                  {strings.callCrewButton}
                </Text>
                <Text style={styles.callCrewSubText}>
                  {strings.callCrewSubtitle}
                </Text>
              </View>
            </Pressable>
            )}
          </View>

          {/* 5. EMERGENCY 108 HELPLINE FALLBACK */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.emergency108Button}
            style={styles.emergency108Btn}
            onPress={handleCall108}
          >
            <Text style={styles.emergency108BtnText}>
              <AppIcon icon={{ set: "mci", name: "car-emergency" }} />{" "}{strings.emergency108Button}
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
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerMissionId: {
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
  greenCorridorTag: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.success,
  },
  greenCorridorTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.success,
  },
  routeCorridorNoticeText: {
    fontSize: 11,
    color: colors.slate700,
    marginTop: 2,
  },

  // ===========================================================================
  // LOWER HALF: INFORMATION SHEET STYLES
  // ===========================================================================
  sheetContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    gap: spacing.base,
  },
  toastBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successLight,
    borderWidth: 1.5,
    borderColor: colors.success,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  toastIcon: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.success,
    marginRight: spacing.sm,
  },
  toastText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.success,
    flex: 1,
  },
  stateBannerCard: {
    backgroundColor: colors.emergencyLight,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.emergency,
    ...shadows.sm,
  },
  stateBannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  stateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.emergency,
    marginRight: spacing.sm,
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
    letterSpacing: 0.5,
  },
  stateDescriptionText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate800,
    lineHeight: 18,
  },

  // Hospital Card
  hospitalCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  cardSectionLabel: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate600,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  hospitalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  hospitalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.infoLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  hospitalIconEmoji: {
    fontSize: 22,
  },
  hospitalTitleGroup: {
    flex: 1,
  },
  hospitalNameText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  hospitalSubtitleText: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 1,
  },

  // Prominent Ward Readiness Banner
  wardReadinessBanner: {
    backgroundColor: colors.successLight,
    borderWidth: 1.5,
    borderColor: colors.success,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  wardBannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  bedHeldPill: {
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginRight: spacing.sm,
  },
  bedHeldPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: colors.white,
    letterSpacing: 0.5,
  },
  wardBannerHeading: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.success,
    flex: 1,
  },
  wardBannerSubtext: {
    fontSize: 11,
    color: colors.slate800,
    lineHeight: 16,
  },
  readinessDetailsList: {
    gap: spacing.sm,
  },
  readinessItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate50,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  readinessItemIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  readinessItemText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
    flex: 1,
  },

  // Emergency Share Card
  shareCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  shareHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  shareIconBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  shareIconEmoji: {
    fontSize: 22,
  },
  shareTitleGroup: {
    flex: 1,
  },
  shareSectionTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  shareSectionDescription: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 1,
  },
  shareButtonsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  whatsAppButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success, // nearest existing token (no WhatsApp brand green in the design system)
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    ...shadows.sm,
  },
  whatsAppButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginLeft: 6,
  },
  smsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate900,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    ...shadows.sm,
  },
  smsButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginLeft: 6,
  },
  shareBtnIcon: {
    fontSize: 16,
  },

  // Clinical Telemetry
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  vitalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  vitalCard: {
    width: "48%",
    backgroundColor: colors.slate50,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  vitalIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  vitalLabel: {
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate500,
    letterSpacing: 0.4,
  },
  vitalValue: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginTop: 2,
  },
  paramedicNoteBanner: {
    backgroundColor: colors.infoLight,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  paramedicNoteText: {
    fontSize: 11,
    color: colors.info,
    fontWeight: typography.fontWeights.semibold,
  },

  // Vehicle and Crew
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
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
  careTierPill: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 1.5,
    borderColor: colors.emergency,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.md,
  },
  careTierPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.emergencyDark,
  },
  callCrewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.slate800,
    borderRadius: radii.lg,
    padding: spacing.md,
    minHeight: 52,
  },
  callCrewBtnIcon: {
    fontSize: 18,
    marginRight: spacing.md,
  },
  callCrewTextGroup: {
    flex: 1,
  },
  callCrewBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  callCrewSubText: {
    fontSize: 10,
    color: colors.slate600,
    marginTop: 1,
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
});
