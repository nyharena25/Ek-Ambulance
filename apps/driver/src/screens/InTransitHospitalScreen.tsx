import { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  PanResponder,
  TextInput,
  Dimensions,
  Platform,
  StatusBar,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, semanticColors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { CompleteMissionPayload, ConfirmArrivalHospitalPayload, GeoPoint } from "@sahayak/domain";
import { driverTransportStrings } from "../i18n/driverTransportStrings";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { getServerAdapter } from "../state/driverLifecycle.store";

import { distanceKm as distanceKmBetween } from "../hooks/hospitalSelection.core";
import { AppIcon, DriverMap, NavigateInGoogleMapsButton } from "../components";
import { IS_DEV } from "../config/env";
// __DEV__ only: a release build reaching this screen without a real hospital selection falls back to the
// driver's own current position (distance 0) rather than a fixed, confidently-wrong location.
const DEMO_HOSPITAL: GeoPoint = { latitude: 28.5355, longitude: 77.391 };

export interface InTransitHospitalScreenProps {
  missionId?: string;
  initialLanguage?: SupportedLanguage;
  hospitalName?: string;
  hospitalCoordinates?: GeoPoint;
  /** Fired when the ER handoff slider completes - transitions transporting -> arrivedHospital. */
  onConfirmArrivalHospital?: (payload: ConfirmArrivalHospitalPayload) => void;
  /** Fired only after sign-off + receipt are confirmed - transitions arrivedHospital -> standby. */
  onCompleteMission?: (payload: CompleteMissionPayload) => void;
  onFinishSignOff?: () => void;
  onBackToStandby?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDER_THUMB_SIZE = 58;
const SLIDER_TRACK_PADDING = 4;

// Sum of the two simulated legs (DriverNavigationScreen's initial 1.8km
// en-route + this screen's initial 3.8km transport) - GPS is simulated
// throughout the driver app, so this is the same class of demo constant as
// DEFAULT_DISPATCH_DISTANCE_KM in the patient app's fare engine, not a
// live-tracked odometer reading.

export default function InTransitHospitalScreen({
  missionId = "MSN-2026-8819",
  initialLanguage = "en",
  hospitalName = "Jaypee Hospital (Sector 128, Noida)",
  hospitalCoordinates,
  onConfirmArrivalHospital,
  onCompleteMission,
  onFinishSignOff,
  onBackToStandby,
}: InTransitHospitalScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const gps = useDriverStandbyStore((st) => st.gps);
  const currentSpeed = Math.round(gps.speedKmh);
  const driverPos = useMemo(() => ({ latitude: gps.latitude, longitude: gps.longitude }), [gps.latitude, gps.longitude]);
  const hospitalTarget = hospitalCoordinates ?? (IS_DEV ? DEMO_HOSPITAL : driverPos);
  const distanceKm = distanceKmBetween(driverPos, hospitalTarget);
  const [isCompletedAtHospital, setIsCompletedAtHospital] = useState(false);
  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState(false);
  const [isReceiptView, setIsReceiptView] = useState(false);

  // Sign-Off Form Fields
  // D-UX-03: a statutory sign-off starts empty and unticked. It used to be pre-filled with a named physician, a registration
  // number and every box ticked, so a driver could "sign off" without typing or checking anything.
  const [physicianName, setPhysicianName] = useState("");
  const [medicalRegNo, setMedicalRegNo] = useState("");
  const [department, setDepartment] = useState("");
  const [isEmtSigned, setIsEmtSigned] = useState(false);
  const [checklistBed, setChecklistBed] = useState(false);
  const [checklistVentilator, setChecklistVentilator] = useState(false);
  const [checklistEmr, setChecklistEmr] = useState(false);
  const [isSubmittingSignOff, setIsSubmittingSignOff] = useState(false);
  const isSignOffComplete = physicianName.trim() !== "" && medicalRegNo.trim() !== "" && department.trim() !== "";

  const strings = driverTransportStrings[language];

  // Slider animation values
  const sliderWidth = SCREEN_WIDTH - spacing.base * 2;
  const maxDragDistance = sliderWidth - SLIDER_THUMB_SIZE - SLIDER_TRACK_PADDING * 2;
  const panX = useRef(new Animated.Value(0)).current;

  // PanResponder for 'Slide to Complete Mission at Hospital ER'
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isCompletedAtHospital,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !isCompletedAtHospital && Math.abs(gestureState.dx) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (isCompletedAtHospital) return;
        const clampedX = Math.max(0, Math.min(gestureState.dx, maxDragDistance));
        panX.setValue(clampedX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isCompletedAtHospital) return;

        // Completion threshold: Must drag at least 80% across track
        const completionRatio = gestureState.dx / maxDragDistance;

        if (completionRatio >= 0.8) {
          // Latch permanently to the end (Irreversible!)
          Animated.timing(panX, {
            toValue: maxDragDistance,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
            setIsCompletedAtHospital(true);

            const arrivalPayload: ConfirmArrivalHospitalPayload = {
              missionId,
              driverId: getServerAdapter()?.userId ?? "DRV-DL-8821",
              location: hospitalTarget,
              arrivedAt: new Date().toISOString(),
            };

            if (onConfirmArrivalHospital) {
              onConfirmArrivalHospital(arrivalPayload);
            }

            // Automatically open statutory sign-off form
            setTimeout(() => {
              setIsSignOffModalOpen(true);
            }, 600);
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

  // Handle statutory sign-off submission - moves into the receipt view;
  // the mission is not actually completed (COMPLETE_MISSION) until the
  // driver confirms the receipt below.
  const handleSubmitSignOff = async () => {
    if (!isSignOffComplete) return;
    setIsSubmittingSignOff(true);
    await new Promise((res) => setTimeout(res, 900));

    setIsSubmittingSignOff(false);
    setIsReceiptView(true);
  };

  // Statutory receipt confirmed - this is where the mission actually
  // completes (arrivedHospital -> standby) and daily shift metrics update.
  const handleCompleteAndReturn = () => {
    useDriverStandbyStore.setState((state) => ({
      dailyMetrics: { ...state.dailyMetrics, completedMissions: state.dailyMetrics.completedMissions + 1 },
    }));

    // The fare is computed by the server from the measured transport leg (D-2); the driver never sends one.
    const payload: CompleteMissionPayload = {
      missionId,
      driverId: getServerAdapter()?.userId ?? "DRV-DL-8821",
      completedAt: new Date().toISOString(),
      handoff: {
        physicianName: physicianName.trim(),
        registrationNumber: medicalRegNo.trim(),
        department: department.trim(),
        emtSigned: isEmtSigned,
        checklist: { bedReady: checklistBed, ventilatorReady: checklistVentilator, emrHanded: checklistEmr },
      },
    };

    if (onCompleteMission) {
      onCompleteMission(payload);
    }

    setIsSignOffModalOpen(false);

    if (onFinishSignOff) {
      onFinishSignOff();
    } else if (onBackToStandby) {
      onBackToStandby();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.slate950} />

      {/* TOP HEADER */}
      <View style={styles.topHeader}>
        <View style={styles.headerStatusRow}>
          <View style={styles.liveFlashingDot} />
          <Text style={styles.headerStatusText}>{strings.stateBadge}</Text>
        </View>

        <Pressable
          style={styles.langPill}
          onPress={() => setLanguage(language === "en" ? "hi" : "en")}
        >
          <Text style={styles.langPillText}>
            {language === "en" ? "हिन्दी" : "EN"}
          </Text>
        </Pressable>
      </View>

      <NavigateInGoogleMapsButton
        destination={hospitalTarget}
        target="hospital"
        language={language}
      />

      {/* DESTINATION + DISTANCE + SPEED (directions open in Google Maps) */}
      <View style={styles.navOverlayCard}>
        <View style={styles.destinationTitleRow}>
          <AppIcon icon={{ set: "mci", name: "hospital-building" }} size={22} color={colors.white} />
          <View style={styles.destinationTextBox}>
            <Text style={styles.destinationHeading}>{strings.destinationHeading}</Text>
            <Text style={styles.destinationHospitalName}>{hospitalName || strings.destinationHospitalName}</Text>
          </View>
        </View>

        <View style={styles.telemetryBar}>
          <View style={styles.speedCol}>
            <Text style={styles.speedNumeral}>{currentSpeed}</Text>
            <Text style={styles.speedUnit}>{strings.currentSpeedUnit}</Text>
          </View>
          <View style={styles.etaCol}>
            <Text style={styles.etaNumeral}>{isCompletedAtHospital ? "0.0" : distanceKm.toFixed(1)} km</Text>
            <Text style={styles.etaDist}>{language === "hi" ? "सीधी दूरी" : "straight line"}</Text>
          </View>
        </View>
      </View>

      {/* FULL-SCREEN TACTICAL NAVIGATION CANVAS */}
      <View style={styles.mapCanvas} pointerEvents="box-none">
        <DriverMap style={StyleSheet.absoluteFill} driver={driverPos} headingDeg={gps.heading} controlsBottom={56} />
      </View>

      {/* PERSISTENT BOTTOM ACTION BAR: SECURE COMPLETION SLIDER */}
      <View style={styles.bottomBar}>
        <Text style={styles.sliderSafetyHelper}>
          {strings.sliderSafetyNotice}
        </Text>

        <View
          style={[
            styles.sliderTrack,
            isCompletedAtHospital && styles.sliderTrackCompleted,
          ]}
        >
          {/* Dynamically expanding background fill */}
          <Animated.View
            style={[
              styles.sliderFill,
              {
                width: isCompletedAtHospital
                  ? sliderWidth
                  : panX.interpolate({
                      inputRange: [0, maxDragDistance],
                      outputRange: [SLIDER_THUMB_SIZE, sliderWidth],
                    }),
              },
            ]}
          />

          <Text
            style={[
              styles.sliderPromptText,
              isCompletedAtHospital && styles.sliderPromptTextCompleted,
            ]}
          >
            {isCompletedAtHospital
              ? strings.sliderConfirmedComplete
              : strings.sliderPromptComplete}
          </Text>

          {/* Moving Draggable Thumb */}
          <Animated.View
            style={[
              styles.sliderThumb,
              isCompletedAtHospital && styles.sliderThumbCompleted,
              {
                transform: [
                  {
                    translateX: isCompletedAtHospital ? maxDragDistance : panX,
                  },
                ],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <Text style={styles.sliderThumbEmoji}>
              <AppIcon
                icon={
                  isCompletedAtHospital
                    ? { set: "ion", name: "checkmark" }
                    : { set: "mci", name: "hospital-building" }
                }
                size={20}
              />
            </Text>
          </Animated.View>
        </View>
      </View>

      {/* STATUTORY MISSION SIGN-OFF FORM MODAL */}
      <Modal
        visible={isSignOffModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.signOffCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.signOffScrollContent}
            >
              {!isReceiptView && (
              <>
              {/* Form Title & Legal Subtitle */}
              <View style={styles.signOffHeader}>
                <View style={styles.signOffEmblem}>
                  <AppIcon icon={{ set: "ion", name: "scale" }} size={22} color={colors.slate700} style={styles.signOffEmblemText} />
                </View>
                <View style={styles.signOffHeaderTextWrap}>
                  <Text style={styles.signOffTitle}>{strings.signOffTitle}</Text>
                  <Text style={styles.signOffSubtitle}>
                    {strings.signOffSubtitle}
                  </Text>
                </View>
              </View>

              {/* 1. Receiving Physician Details */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionHeading}>
                  <AppIcon icon={{ set: "ion", name: "man" }} />{" "}{strings.physicianSectionHeading}
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>
                    {strings.physicianNameLabel}
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={physicianName}
                    onChangeText={setPhysicianName}
                    placeholder={strings.physicianNamePlaceholder}
                    placeholderTextColor={colors.slate400}
                  />
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>
                      {strings.medicalRegNoLabel}
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      value={medicalRegNo}
                      onChangeText={setMedicalRegNo}
                      placeholder={strings.medicalRegNoPlaceholder}
                      placeholderTextColor={colors.slate400}
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>
                      {strings.physicianDepartmentLabel}
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      value={department}
                      onChangeText={setDepartment}
                      placeholder={strings.physicianDepartmentPlaceholder}
                      placeholderTextColor={colors.slate400}
                    />
                  </View>
                </View>
              </View>

              {/* 2. EMT / Paramedic Digital Signature */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionHeading}>
                  <AppIcon icon={{ set: "ion", name: "create" }} />{" "}{strings.emtSignatureHeading}
                </Text>

                <View style={styles.emtProfileBox}>
                  <Text style={styles.emtNameText}>{strings.emtNameLabel}</Text>
                  <Text style={styles.emtRegText}>
                    {strings.emtRegNumberLabel}
                  </Text>
                  <Text style={styles.emtTimestampText}>
                    {strings.emtSignTimestampLabel(new Date().toLocaleTimeString())}
                  </Text>
                </View>

                {/* Digital Signature Confirmation Checkbox */}
                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setIsEmtSigned(!isEmtSigned)}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      isEmtSigned && styles.checkboxBoxChecked,
                    ]}
                  >
                    {isEmtSigned && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={12} style={styles.checkboxTick} />}
                  </View>
                  <Text style={styles.checkboxLabelText}>
                    {strings.emtSignConfirmCheckbox}
                  </Text>
                </Pressable>
              </View>

              {/* 3. Clinical Handover Checklist */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionHeading}>
                  <AppIcon icon={{ set: "ion", name: "clipboard" }} />{" "}{strings.handoverChecklistHeading}
                </Text>

                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setChecklistBed(!checklistBed)}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      checklistBed && styles.checkboxBoxChecked,
                    ]}
                  >
                    {checklistBed && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={12} style={styles.checkboxTick} />}
                  </View>
                  <Text style={styles.checkboxLabelText}>
                    {strings.checklistBedTransfer}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setChecklistVentilator(!checklistVentilator)}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      checklistVentilator && styles.checkboxBoxChecked,
                    ]}
                  >
                    {checklistVentilator && (
                      <AppIcon icon={{ set: "ion", name: "checkmark" }} size={12} style={styles.checkboxTick} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabelText}>
                    {strings.checklistVentilatorTransfer}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setChecklistEmr(!checklistEmr)}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      checklistEmr && styles.checkboxBoxChecked,
                    ]}
                  >
                    {checklistEmr && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={12} style={styles.checkboxTick} />}
                  </View>
                  <Text style={styles.checkboxLabelText}>
                    {strings.checklistEmrPacket}
                  </Text>
                </Pressable>
              </View>

              {/* 4. Statutory Tariff Summary */}
              <View style={styles.tariffCard}>
                <Text style={styles.tariffHeading}>
                  {strings.statutoryTariffHeading}
                </Text>
                <Text style={styles.dpdpNotice}>{strings.dpdpNotice}</Text>
              </View>

              {/* Action Button */}
              <Pressable
                style={[
                  styles.submitSignOffBtn,
                  (isSubmittingSignOff || !isSignOffComplete) && styles.submitSignOffBtnDisabled,
                ]}
                onPress={handleSubmitSignOff}
                disabled={isSubmittingSignOff || !isSignOffComplete}
              >
                <Text style={styles.submitSignOffBtnText}>
                  {isSubmittingSignOff
                    ? strings.btnSubmitting
                    : strings.btnSubmitSignOff}
                </Text>
              </Pressable>
              </>
              )}

              {isReceiptView && (
              <>
              {/* STATUTORY MISSION SUMMARY RECEIPT */}
              <View style={styles.signOffHeader}>
                <View style={styles.signOffEmblem}>
                  <AppIcon icon={{ set: "ion", name: "receipt" }} size={22} color={colors.slate700} style={styles.signOffEmblemText} />
                </View>
                <View style={styles.signOffHeaderTextWrap}>
                  <Text style={styles.signOffTitle}>{strings.receiptTitle}</Text>
                  <Text style={styles.signOffSubtitle}>{strings.receiptSubtitle}</Text>
                </View>
              </View>

              <View style={styles.tariffCard}>
                <Text style={styles.tariffLine}>
                  {strings.receiptSignedByLabel(physicianName, department)}
                </Text>
                <Text style={styles.tariffLine}>{medicalRegNo}</Text>
                {isEmtSigned && (
                  <Text style={styles.tariffLine}>
                    <AppIcon icon={{ set: "ion", name: "checkmark" }} size={12} />{" "}{strings.receiptEmtConfirmedLabel}
                  </Text>
                )}
              </View>

              <Pressable style={styles.submitSignOffBtn} onPress={handleCompleteAndReturn}>
                <Text style={styles.submitSignOffBtnText}>{strings.btnCompleteAndReturn}</Text>
              </Pressable>
              </>
              )}
            </ScrollView>
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

  // ER Integration Alert Banner
  erAlertBanner: {
    backgroundColor: semanticColors.triage.green.textAccessible, // High-contrast clinical green
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: semanticColors.triage.green.border,
    gap: 4,
  },
  erAlertHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  integrationPulseDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.triageGreen,
  },
  erAlertTitle: {
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  erAlertSub: {
    color: colors.triageGreenSurface, // nearest existing light-green token
    fontSize: 10,
    lineHeight: 14,
  },
  erStatusChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  erStatusChip: {
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  erStatusChipText: {
    color: colors.triageGreen, // nearest existing token
    fontSize: 9,
    fontWeight: typography.fontWeights.bold,
  },
  erStatusChipHighlight: {
    backgroundColor: colors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  erStatusChipHighlightText: {
    color: semanticColors.triage.green.textAccessible,
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
  },
  vitalsStreamBar: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    marginTop: 2,
  },
  vitalsStreamText: {
    color: colors.triageGreenSurface, // nearest existing light-green token
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
  },

  // Navigation Overlay Card
  navOverlayCard: {
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
  destinationTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  destinationIcon: {
    fontSize: 20,
  },
  destinationTextBox: {
    flex: 1,
  },
  destinationHeading: {
    fontSize: 10,
    color: colors.slate400,
    fontWeight: typography.fontWeights.bold,
    textTransform: "uppercase",
  },
  destinationHospitalName: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
    lineHeight: typography.lineHeights.base,
  },
  destinationRampAccess: {
    fontSize: typography.fontSizes.xs,
    color: semanticColors.status.statutoryBorder, // nearest existing token (no cyan in the design system)
    lineHeight: typography.lineHeights.xs,
    marginTop: 2,
  },
  telemetryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.slate950,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate800,
  },
  speedCol: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  speedNumeral: {
    fontSize: 26,
    fontWeight: typography.fontWeights.extrabold,
    color: semanticColors.status.statutoryBorder, // nearest existing token (no cyan in the design system)
  },
  speedUnit: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate400,
  },
  corridorCenterBox: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 6,
  },
  corridorBadgeText: {
    color: colors.triageGreen, // nearest existing token
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    textAlign: "center",
  },
  etaCol: {
    alignItems: "flex-end",
  },
  etaNumeral: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.triageGreen,
  },
  etaDist: {
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
  floatingControls: {
    position: "absolute",
    bottom: 12,
    left: spacing.base,
    right: spacing.base,
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  telemetryLockPill: {
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.slate700,
  },
  telemetryLockText: {
    color: colors.triageGreen, // nearest existing token
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
  },

  // Bottom Persistent Bar
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
  sliderSafetyHelper: {
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
  sliderTrackCompleted: {
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
  sliderPromptTextCompleted: {
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
  sliderThumbCompleted: {
    backgroundColor: colors.white,
  },
  sliderThumbEmoji: {
    fontSize: 26,
  },

  // Sign-Off Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    justifyContent: "flex-end",
  },
  signOffCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii["2xl"],
    borderTopRightRadius: radii["2xl"],
    padding: spacing.xl,
    maxHeight: "92%",
    ...shadows.md,
  },
  signOffScrollContent: {
    gap: spacing.md,
    paddingBottom: 24,
  },
  signOffHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    paddingBottom: spacing.sm,
  },
  signOffEmblem: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  signOffEmblemText: {
    fontSize: 22,
  },
  signOffHeaderTextWrap: {
    flex: 1,
  },
  signOffTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  signOffSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 2,
  },
  formSection: {
    backgroundColor: colors.slate50,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    gap: spacing.sm,
  },
  formSectionHeading: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginBottom: 4,
  },
  formGroup: {
    gap: 4,
  },
  formRow: {
    flexDirection: "row",
    gap: 10,
  },
  fieldLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
  },
  textInput: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    fontSize: typography.fontSizes.sm,
    color: colors.slate900,
  },
  emtProfileBox: {
    backgroundColor: colors.white,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate300,
    gap: 2,
  },
  emtNameText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  emtRegText: {
    fontSize: 11,
    color: colors.slate700,
  },
  emtTimestampText: {
    fontSize: 10,
    color: colors.info,
    fontWeight: typography.fontWeights.semibold,
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.slate400,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.emergency,
    borderColor: colors.emergency,
  },
  checkboxTick: {
    color: colors.white,
    fontSize: 12,
    fontWeight: typography.fontWeights.bold,
  },
  checkboxLabelText: {
    flex: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate800,
    lineHeight: typography.lineHeights.xs,
  },

  // Tariff Card
  tariffCard: {
    backgroundColor: colors.slate100,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  tariffHeading: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  tariffLine: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
  },
  tariffTotalDivider: {
    height: 1,
    backgroundColor: colors.slate300,
    marginVertical: 4,
  },
  tariffTotal: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.success,
  },
  dpdpNotice: {
    fontSize: 9,
    color: colors.slate500,
    lineHeight: 12,
    marginTop: 4,
  },
  submitSignOffBtn: {
    backgroundColor: colors.emergency,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    ...shadows.emergency,
  },
  submitSignOffBtnDisabled: {
    opacity: 0.7,
  },
  submitSignOffBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
  },
});
