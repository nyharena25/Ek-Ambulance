import { useState, type Ref } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ScrollView,
  Linking,
  Modal,
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
  /** Test-flow hook: fires SERVER_TRANSPORT_STARTED via the lifecycle
   *  machine, mocking the driver confirming patient pickup ahead of
   *  Centrifugo. Mirrors ActiveMatchingScreen.onSimulateMatch. */
  onSimulateTransportStart?: () => void;
  /** Mission pickup (lat/lon route params); the map centres on it. */
  pickup?: GeoPoint;
  /** OSRM route hub -> pickup, fetched once by booking/[id].tsx. */
  route?: MapRoute | null;
  /** Live pings move the marker through this handle, so no screen re-renders per ping. */
  driverMarkerRef?: Ref<DriverMarkerHandle>;
  /** First ambulance position (dispatch hub) until the first ping glides it. */
  driverStart?: GeoPoint;
  /** Safe-for-text live speed, throttled upstream to at most one update
   *  every ~2s - see useMissionChannel's throttledTelemetry. */
  liveSpeedKmh?: number | null;
  /** From machine context (SERVER_DRIVER_ARRIVED) - true once the driver
   *  has physically reached the pickup point. Same screen throughout
   *  (tracking never changes state.value for this), just a different
   *  step in the progression pill below. */
  driverHasArrived?: boolean;
  /** Test-flow hook: fires SERVER_DRIVER_ARRIVED via the lifecycle machine.
   *  Mirrors onSimulateTransportStart / ActiveMatchingScreen.onSimulateMatch. */
  onSimulateDriverArrival?: () => void;
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
  missionId = "MSN-DL-2026-8921",
  vehicleType = "TYPE_D_ALS",
  triagedSymptom = "chest_pain",
  initialLanguage = "en",
  onCallDriver,
  onCall108,
  onBack,
  onSimulateTransportStart,
  pickup = DEFAULT_PICKUP,
  route,
  driverMarkerRef,
  driverStart = pickup,
  liveSpeedKmh,
  driverHasArrived = false,
  onSimulateDriverArrival,
}: MissionTrackingScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [isGuideExpanded, setIsGuideExpanded] = useState<boolean>(true);
  const [isChatModalVisible, setIsChatModalVisible] = useState<boolean>(false);
  const [chatToastMessage, setChatToastMessage] = useState<string | null>(null);

  // ETA/distance are still static illustrative figures: DriverTelemetry carries no eta/distance and the
  // route's own distance/duration is not wired in yet (HANDOVER §23).
  const etaMinutes = 5;
  const distanceKm = 1.8;

  const strings = trackingStrings[language];

  // Resolve symptom guide
  const symptomKey =
    triagedSymptom in strings.guidesBySymptom
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
    // Telephony masked relay number (Exotel / Twilio privacy proxy)
    const maskedTel = "tel:+911140840000";
    Linking.canOpenURL(maskedTel)
      .then((supported) => {
        if (supported) {
          Linking.openURL(maskedTel);
        } else {
          Alert.alert(
            strings.callDriverButton,
            "Masked Privacy Relay: +91 11 4084 0000 (Ext: 892)"
          );
        }
      })
      .catch(() => {
        Alert.alert(strings.callDriverButton, "Calling Driver Relay...");
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

  // ---------------------------------------------------------------------------
  // EMERGENCY QUICK PRESETS CHAT
  // ---------------------------------------------------------------------------
  const handleSendQuickMessage = (text: string) => {
    setIsChatModalVisible(false);
    setChatToastMessage(text);
    setTimeout(() => {
      setChatToastMessage(null);
    }, 4000);
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
            TOP HALF: INTERACTIVE MAP VIEWPORT
           =================================================================== */}
        <MapViewPort
          pickup={pickup}
          route={route}
          driverMarkerRef={driverMarkerRef}
          driverStart={driverStart}
          speedLabel={strings.speedIndicator(liveSpeedKmh ?? 46)}
          onCall108={handleCall108}
          overlays={
            <>
              {/* Centrifugo WebSocket Live Status Pill */}
              <View style={styles.centrifugoBadge}>
                <View style={styles.centrifugoPulseDot} />
                <Text style={styles.centrifugoBadgeText}>
                  {strings.centrifugoLiveBadge}
                </Text>
              </View>

              {/* LIVE TRAFFIC ETA BANNER OVERLAY */}
              <View style={styles.trafficEtaCard}>
                <View style={styles.trafficEtaTopRow}>
                  <Text style={styles.trafficEtaMain}>
                    {strings.trafficEtaLabel(
                      etaMinutes,
                      distanceKm
                    )}
                  </Text>
                  <View style={styles.trafficStatusBadge}>
                    <Text style={styles.trafficStatusBadgeText}>{strings.liveGpsBadge}</Text>
                  </View>
                </View>
                <Text style={styles.trafficCorridorNoticeText}>
                  {strings.trafficCorridorNotice}
                </Text>
              </View>
            </>
          }
        />

        {/* ===================================================================
            LOWER HALF: EMERGENCY INFORMATION SHEET
           =================================================================== */}
        <View style={styles.sheetContainer}>
          {/* TOAST CONFIRMATION BANNER */}
          {chatToastMessage && (
            <View style={styles.toastBanner}>
              <AppIcon icon={{ set: "ion", name: "checkmark" }} size={18} style={styles.toastIcon} />
              <View style={styles.toastTextGroup}>
                <Text style={styles.toastTitle}>
                  {strings.messageSentConfirmation}
                </Text>
                <Text style={styles.toastContent}>{chatToastMessage}</Text>
              </View>
            </View>
          )}

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

          {/* 2. DRIVER PROFILE & CREDENTIALS CARD */}
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>
              {strings.driverSectionTitle}
            </Text>
            <View style={styles.driverProfileRow}>
              <View style={styles.driverAvatarBadge}>
                <AppIcon icon={{ set: "ion", name: "man" }} size={26} color={colors.slate700} style={styles.driverAvatarEmoji} />
                <View style={styles.driverOnlineDot} />
              </View>

              <View style={styles.driverInfoColumn}>
                <View style={styles.driverNameRow}>
                  <Text style={styles.driverNameText}>{strings.driverName}</Text>
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedBadgeText}>{strings.verifiedBadgeShort}</Text>
                  </View>
                </View>

                <Text style={styles.driverRoleText}>
                  {strings.driverRoleBadge}
                </Text>
                <Text style={styles.driverRatingText}>
                  {strings.driverRatingText(4.95, 1240)}
                </Text>
              </View>
            </View>
          </View>

          {/* 3. AMBULANCE LICENSE PLATE & AIS-125 CARE TIER */}
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>
              {strings.vehicleSectionTitle}
            </Text>

            <View style={styles.vehicleRow}>
              {/* Indian High-Security Registration Plate (HSRP) */}
              <View style={styles.hsrpPlate}>
                <View style={styles.hsrpIndStrip}>
                  <Text style={styles.hsrpIndText}>IND</Text>
                </View>
                <Text style={styles.hsrpNumberText}>
                  {strings.licensePlateNumber}
                </Text>
              </View>

              {/* AIS-125 Tier Tag */}
              <View style={styles.careTierPill}>
                <Text style={styles.careTierPillText}>
                  {vehicleType.replace(/_/g, " ")}
                </Text>
              </View>
            </View>

            {/* Equipment Badges */}
            <View style={styles.equipmentGrid}>
              <View style={styles.equipmentItem}>
                <Text style={styles.equipmentItemText}>
                  {strings.equipmentVentilator}
                </Text>
              </View>
              <View style={styles.equipmentItem}>
                <Text style={styles.equipmentItemText}>
                  {strings.equipmentDefibrillator}
                </Text>
              </View>
              <View style={styles.equipmentItem}>
                <Text style={styles.equipmentItemText}>
                  {strings.equipmentOxygen}
                </Text>
              </View>
              <View style={styles.equipmentItem}>
                <Text style={styles.equipmentItemText}>
                  {strings.equipmentParamedic}
                </Text>
              </View>
            </View>
          </View>

          {/* 4. COMMUNICATION ACTIONS (MASKED PHONE & EMERGENCY CHAT) */}
          <View style={styles.actionButtonsRow}>
            {/* One-Touch Masked Phone Call Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.callDriverButton}
              accessibilityHint="Calls the driver via a privacy-masked phone relay"
              style={styles.callDriverBtn}
              onPress={handleCallDriver}
            >
              <View style={styles.btnIconWrapper}>
                <AppIcon icon={{ set: "ion", name: "call" }} size={18} color={colors.slate700} style={styles.btnIcon} />
              </View>
              <View style={styles.btnTextGroup}>
                <Text style={styles.btnMainTitle}>
                  {strings.callDriverButton}
                </Text>
                <Text style={styles.btnSubtitle}>
                  {strings.callDriverSubtitle}
                </Text>
              </View>
            </Pressable>

            {/* Emergency Chat Trigger */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.emergencyChatButton}
              accessibilityHint="Opens rapid emergency preset messages modal"
              style={styles.chatTriggerBtn}
              onPress={() => setIsChatModalVisible(true)}
            >
              <View style={styles.btnIconWrapperChat}>
                <AppIcon icon={{ set: "ion", name: "chatbubble-ellipses" }} size={18} color={colors.slate700} style={styles.btnIconChat} />
              </View>
              <View style={styles.btnTextGroup}>
                <Text style={styles.btnMainTitleChat}>
                  {strings.emergencyChatButton}
                </Text>
                <Text style={styles.btnSubtitleChat}>
                  {strings.emergencyChatSubtitle}
                </Text>
              </View>
            </Pressable>
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

          {/* SIMULATION HOOKS FOR DEMO TESTING */}
          {onSimulateDriverArrival && !driverHasArrived && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Simulate Driver Arrival"
              style={styles.simulateButton}
              onPress={onSimulateDriverArrival}
            >
              <Text style={styles.simulateButtonText}>
                <AppIcon icon={{ set: "ion", name: "flash" }} size={14} />{" "}
                Simulate Driver Arrival (Test Flow)
              </Text>
            </Pressable>
          )}
          {onSimulateTransportStart && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Simulate Patient Onboard"
              style={styles.simulateButton}
              onPress={onSimulateTransportStart}
            >
              <Text style={styles.simulateButtonText}>
                <AppIcon icon={{ set: "ion", name: "flash" }} size={14} />{" "}
                Simulate Patient Onboard (Test Flow)
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ===================================================================
          EMERGENCY QUICK PRESETS CHAT MODAL
         =================================================================== */}
      <Modal
        visible={isChatModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsChatModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.chatModalCard}>
            <View style={styles.modalDragBar} />

            <View style={styles.chatModalHeaderRow}>
              <View style={styles.chatModalIconBadge}>
                <AppIcon icon={{ set: "ion", name: "chatbubble-ellipses" }} size={22} color={colors.slate700} style={styles.chatModalHeaderIcon} />
              </View>
              <View style={styles.chatModalTitleGroup}>
                <Text style={styles.chatModalTitle}>
                  {strings.chatModalTitle}
                </Text>
                <Text style={styles.chatModalDescription}>
                  {strings.chatModalDescription}
                </Text>
              </View>
            </View>

            {/* Quick Message Options */}
            <View style={styles.presetsList}>
              <Pressable
                accessibilityRole="button"
                style={styles.presetButton}
                onPress={() => handleSendQuickMessage(strings.quickPresetGate)}
              >
                <Text style={styles.presetButtonText}>
                  {strings.quickPresetGate}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={styles.presetButton}
                onPress={() =>
                  handleSendQuickMessage(strings.quickPresetElevator)
                }
              >
                <Text style={styles.presetButtonText}>
                  {strings.quickPresetElevator}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={styles.presetButton}
                onPress={() =>
                  handleSendQuickMessage(strings.quickPresetOxygen)
                }
              >
                <Text style={styles.presetButtonText}>
                  {strings.quickPresetOxygen}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={styles.presetButton}
                onPress={() =>
                  handleSendQuickMessage(strings.quickPresetUnconscious)
                }
              >
                <Text style={styles.presetButtonText}>
                  {strings.quickPresetUnconscious}
                </Text>
              </Pressable>
            </View>

            {/* Close Action */}
            <Pressable
              accessibilityRole="button"
              style={styles.closeModalBtn}
              onPress={() => setIsChatModalVisible(false)}
            >
              <Text style={styles.closeModalBtnText}>
                {strings.closeChatModal}
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
  trafficStatusBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.success,
  },
  trafficStatusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.success,
  },
  trafficCorridorNoticeText: {
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
  toastTextGroup: {
    flex: 1,
  },
  toastTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
  },
  toastContent: {
    fontSize: 11,
    color: colors.slate800,
    marginTop: 1,
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
  card: {
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
  driverProfileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  driverAvatarBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.slate100,
    borderWidth: 2,
    borderColor: colors.slate300,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
    position: "relative",
  },
  driverAvatarEmoji: {
    fontSize: 26,
  },
  driverOnlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
  },
  driverInfoColumn: {
    flex: 1,
  },
  driverNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  driverNameText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  verifiedBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.success,
  },
  verifiedBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.success,
  },
  driverRoleText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.slate700,
    marginTop: 2,
  },
  driverRatingText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.warning,
    marginTop: 2,
  },

  // Ambulance Specs
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
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
  equipmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.xs,
  },
  equipmentItem: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  equipmentItemText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },

  // Action Buttons
  actionButtonsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  callDriverBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergency,
    borderRadius: radii.xl,
    padding: spacing.md,
    ...shadows.sm,
    minHeight: 64,
  },
  btnIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  btnIcon: {
    fontSize: 18,
  },
  btnTextGroup: {
    flex: 1,
  },
  btnMainTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
  },
  btnSubtitle: {
    fontSize: 10,
    color: colors.emergencyLight,
    marginTop: 1,
  },
  chatTriggerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.slate800,
    ...shadows.sm,
    minHeight: 64,
  },
  btnIconWrapperChat: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  btnIconChat: {
    fontSize: 18,
  },
  btnMainTitleChat: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  btnSubtitleChat: {
    fontSize: 10,
    color: colors.slate600,
    marginTop: 1,
  },

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
  simulateButton: {
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  simulateButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "flex-end",
  },
  chatModalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii["2xl"],
    borderTopRightRadius: radii["2xl"],
    padding: spacing.xl,
    ...shadows.lg,
  },
  modalDragBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate300,
    alignSelf: "center",
    marginBottom: spacing.base,
  },
  chatModalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  chatModalIconBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  chatModalHeaderIcon: {
    fontSize: 22,
  },
  chatModalTitleGroup: {
    flex: 1,
  },
  chatModalTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  chatModalDescription: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 2,
  },
  presetsList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  presetButton: {
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  presetButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },
  closeModalBtn: {
    backgroundColor: colors.slate100,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  closeModalBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
});
