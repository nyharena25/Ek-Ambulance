import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Linking,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Alert } from "../lib/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { formatBoardTimer, type AIS125VehicleType } from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { matchingStrings } from "../i18n/matchingStrings";

import { AppIcon } from "../components";
export interface ActiveMatchingScreenProps {
  vehicleType?: AIS125VehicleType;
  pickupAddress?: string;
  pickupCoords?: { latitude: number; longitude: number };
  initialLanguage?: SupportedLanguage;
  /** When the server created the request (ms). The timer counts from it, like the drivers' card; defaults to when this screen mounted. */
  startedAtMs?: number;
  onCancel?: (reason: string) => void;
  onBack?: () => void;
  onCall108?: () => void;
}

/**
 * Searching state: the server has the request (create_mission succeeded) and no driver has accepted yet. Shows only
 * what is known - request received, time since the server created it, ambulance type, pickup - plus Cancel and 108.
 * The route (booking/matching.tsx) moves on when the server's DRIVER_ACCEPTED or cancellation arrives.
 */
export default function ActiveMatchingScreen({
  vehicleType,
  pickupAddress = "",
  pickupCoords,
  initialLanguage = "en",
  startedAtMs,
  onCancel,
  onBack,
  onCall108,
}: ActiveMatchingScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState<boolean>(false);
  const [selectedReasonKey, setSelectedReasonKey] = useState<string>("alternative");

  const strings = matchingStrings[language];

  // Only facts the app actually has: the server's creation time and how long ago that was. Which dispatch wave the server
  // is on is not sent to the patient, so no radius, countdown or progress is shown - a guess could be wrong (empty waves
  // are skipped at once). The screen changes when the server's DRIVER_ACCEPTED or cancellation arrives.
  const mountedAtMs = useRef(Date.now()).current;
  const startedAt = startedAtMs ?? mountedAtMs;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const requestedAt = startedAtMs !== undefined ? new Date(startedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

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
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle} numberOfLines={2}>{strings.screenTitle}</Text>
            <Text style={styles.headerStateBadge} numberOfLines={1}>{strings.stateMachineState}</Text>
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
        {/* REQUEST RECEIVED + SEARCHING */}
        <View style={styles.searchCard} accessibilityLiveRegion="polite">
          <View style={styles.receivedRow}>
            <AppIcon icon={{ set: "ion", name: "checkmark-circle" }} size={22} color={colors.success} />
            <Text style={styles.receivedText}>{strings.receivedTitle}</Text>
          </View>
          <View style={styles.findingRow}>
            <ActivityIndicator size="large" color={colors.emergency} />
            <Text style={styles.findingTitle}>{strings.findingTitle}</Text>
          </View>
          <Text style={styles.findingSubtitle}>{strings.findingSubtitle}</Text>
          <Text style={styles.elapsedText}>{strings.searchingFor(formatBoardTimer(elapsedSeconds))}</Text>
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
              <Text style={styles.contextMainValue} numberOfLines={2}>
                {vehicleType ? (strings.vehicleTypeName[vehicleType] ?? vehicleType) : "—"}
              </Text>
              <Text style={styles.contextSubValue}>
                {strings.lifeSupportTelemetry}
              </Text>
              {requestedAt && (
                <Text style={styles.contextSubValue}>
                  {strings.requestedAtLabel} {requestedAt}
                </Text>
              )}
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
              {pickupCoords && (
                <Text style={styles.contextSubValue}>
                  GPS: {pickupCoords.latitude.toFixed(4)}° N,{" "}
                  {pickupCoords.longitude.toFixed(4)}° E
                </Text>
              )}
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
  searchCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  receivedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  receivedText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.success,
  },
  findingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  findingTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes["2xl"],
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  findingSubtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
    lineHeight: 20,
  },
  elapsedText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate600,
  },
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
  // flex + minWidth 0 so a long title truncates instead of running under the language switch
  headerTitleGroup: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
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
    paddingBottom: 150, // room for the floating 108 pill (taller once it becomes the primary action)
    gap: spacing.base,
  },

  // ---------------------------------------------------------------------------
  // COUNTDOWN CARD
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // DISPATCH WAVES PROGRESS TRACKER
  // ---------------------------------------------------------------------------

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
  // Once every zone has been searched, calling 108 is the action: taller, darker, white-edged.
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
    fontSize: typography.fontSizes.xs,
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
