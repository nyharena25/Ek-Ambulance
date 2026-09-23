import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ScrollView,
  Switch,
  Modal,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import {
  ItemizedStatutoryFare,
  computeItemizedStatutoryFare,
} from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { completionStrings } from "../i18n/completionStrings";

import { AppIcon } from "../components";
export interface MissionCompletionScreenProps {
  missionId?: string;
  pickupAddress?: string;
  hospitalName?: string;
  /** Statutory receipt breakdown, computed once at booking time (never
   *  recomputed here) - the same shared domain contract StatutoryFareBottomSheet
   *  emits via onConfirmAndRequest. */
  fareDetails?: ItemizedStatutoryFare;
  initialLanguage?: SupportedLanguage;
  onReturnHome?: () => void;
  onDisputeFare?: () => void;
}

const DEFAULT_FARE_DETAILS: ItemizedStatutoryFare = computeItemizedStatutoryFare({
  vehicleType: "TYPE_D_ALS",
  jurisdiction: "DL",
  distanceKm: 8.4,
});

/**
 * MissionCompletionScreen for Ek-Ambulance
 *
 * Represents the XState `awaitingReceipt` / `receiptConfirmed` lifecycle state:
 * - Statutory Regulated Receipt Details:
 *   - Final distance traveled, base rate with initial km threshold, total fare, payment status.
 *   - Zero surge pricing guarantee under State Mandate.
 * - DPDP Data Fiduciary Privacy Panel (DPDP Act 2023 & DPDP 2025 Rules):
 *   - Itemized processed data inventory (GPS telemetry, triage, vitals, masked audio, handoff).
 *   - 'Download Emergency Medical Record (EMR) Handoff PDF' action.
 *   - Explicit toggle: 'Request Premature Deletion of Personal Journey Data'.
 *   - Transparent legal disclosure of 72-hour purge vs statutory financial retention.
 * - WCAG AAA compliant high-contrast tokens and bilingual localization.
 */
export default function MissionCompletionScreen({
  missionId = "MSN-DL-2026-8921",
  pickupAddress = "AIIMS New Delhi, Main Emergency Ward",
  hospitalName = "Jai Prakash Narayan Apex Trauma Center, AIIMS",
  fareDetails = DEFAULT_FARE_DETAILS,
  initialLanguage = "en",
  onReturnHome,
  onDisputeFare,
}: MissionCompletionScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [isDeletionRequested, setIsDeletionRequested] = useState<boolean>(false);
  const [isDeletionModalVisible, setIsDeletionModalVisible] =
    useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const strings = completionStrings[language];

  // ---------------------------------------------------------------------------
  // TOAST HANDLER
  // ---------------------------------------------------------------------------
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // ---------------------------------------------------------------------------
  // DOWNLOAD EMR HANDOFF PDF HANDLER
  // ---------------------------------------------------------------------------
  const handleDownloadEmr = async () => {
    showToast(strings.downloadingToast);
    try {
      await Share.share({
        title: "EMR Handoff Record - Ek-Ambulance",
        message:
          `📄 [Official Emergency Medical Record (EMR) Handoff Summary]\n\n` +
          `Mission ID: ${missionId}\n` +
          `Patient: Safely Transferred to ${hospitalName}\n` +
          `Fleet Vehicle: ${fareDetails.vehicleType.replace(/_/g, " ")} (DL 1E AM 4092)\n` +
          `Triage: Category 1 Immediate (Cardiac / Trauma)\n` +
          `In-Transit Vitals: HR 84 bpm | SpO2 98% | BP 122/80\n` +
          `Receiving Bay: Resuscitation Bay #04\n\n` +
          `Official Encrypted PDF Link: https://receipts.ek-ambulance.in/${missionId}/emr-handoff.pdf`,
      });
    } catch {
      // Ignored or dismissed
    }
  };

  // ---------------------------------------------------------------------------
  // PREMATURE DELETION TOGGLE HANDLER (DPDP 2025 RULES)
  // ---------------------------------------------------------------------------
  const handleToggleDeletion = (value: boolean) => {
    if (value) {
      // Open legal explanation modal before committing deletion request
      setIsDeletionModalVisible(true);
    } else {
      setIsDeletionRequested(false);
    }
  };

  const handleConfirmDeletion = () => {
    setIsDeletionModalVisible(false);
    setIsDeletionRequested(true);
    showToast(strings.deletionQueuedToast);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP HEADER */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeftGroup}>
          <View style={styles.headerShieldIconBadge}>
            <AppIcon icon={{ set: "ion", name: "shield-checkmark" }} size={18} color={colors.slate700} style={styles.headerShieldIcon} />
          </View>
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
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TOAST CONFIRMATION BANNER */}
        {toastMessage && (
          <View style={styles.toastBanner}>
            <AppIcon icon={{ set: "ion", name: "checkmark" }} size={18} style={styles.toastIcon} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        )}

        {/* ===================================================================
            1. MISSION COMPLETION HERO BANNER
           =================================================================== */}
        <View style={styles.completionBannerCard}>
          <View style={styles.completionBadgeRow}>
            <View style={styles.completedTag}>
              <Text style={styles.completedTagText}>
                {strings.completionBannerBadge}
              </Text>
            </View>
            <Text style={styles.timestampText}>
              22 Sep 2026, 08:35 IST
            </Text>
          </View>

          <Text style={styles.completionBannerTitle}>
            {strings.completionBannerTitle}
          </Text>
          <Text style={styles.completionBannerSubtitle}>
            {strings.completionBannerSubtitle}
          </Text>
        </View>

        {/* ===================================================================
            2. STATUTORY REGULATED RECEIPT CARD
           =================================================================== */}
        <View style={styles.receiptCard}>
          <View style={styles.receiptHeaderRow}>
            <View style={styles.receiptIconBadge}>
              <AppIcon icon={{ set: "ion", name: "receipt" }} size={22} color={colors.slate700} style={styles.receiptIcon} />
            </View>
            <View style={styles.receiptTitleGroup}>
              <Text style={styles.receiptHeading}>
                {strings.receiptHeading}
              </Text>
              <Text style={styles.receiptSubtitle}>
                {strings.mandateCitation}
              </Text>
            </View>
          </View>

          {/* Mission Overview Context */}
          <View style={styles.missionContextGrid}>
            <View style={styles.contextItem}>
              <Text style={styles.contextItemLabel}>
                {strings.pickupLocationLabel}
              </Text>
              <Text style={styles.contextItemValue} numberOfLines={2}>
                {pickupAddress}
              </Text>
            </View>

            <View style={styles.contextItem}>
              <Text style={styles.contextItemLabel}>
                {strings.destinationHospitalLabel}
              </Text>
              <Text style={styles.contextItemValue} numberOfLines={2}>
                {hospitalName}
              </Text>
            </View>

            <View style={styles.contextItemHalf}>
              <Text style={styles.contextItemLabel}>
                {strings.vehicleLabel}
              </Text>
              <Text style={styles.contextItemValue}>
                {fareDetails.vehicleType.replace(/_/g, " ")} (DL 1E AM 4092)
              </Text>
            </View>

            <View style={styles.contextItemHalf}>
              <Text style={styles.contextItemLabel}>{strings.crewLabel}</Text>
              <Text style={styles.contextItemValue}>
                Rajesh Kumar (Govt. EMT)
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Itemized Statutory Breakdown Table */}
          <View style={styles.tableContainer}>
            {/* Final Distance Row */}
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>
                {strings.finalDistanceRow(fareDetails.totalDistanceKm)}
              </Text>
              <Text style={styles.tableValueBold}>
                {fareDetails.totalDistanceKm.toFixed(1)} km
              </Text>
            </View>

            {/* Base Ambulance Tariff */}
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>
                {strings.baseFareRow(fareDetails.initialIncludedKm)}
              </Text>
              <Text style={styles.tableValue}>
                ₹{fareDetails.baseFareInr.toFixed(2)}
              </Text>
            </View>

            {/* Additional Distance Tariff */}
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>
                {strings.additionalDistanceRow(
                  fareDetails.billableAdditionalKm,
                  fareDetails.perKmRateInr
                )}
              </Text>
              <Text style={styles.tableValue}>
                ₹{fareDetails.additionalDistanceFareInr.toFixed(2)}
              </Text>
            </View>

            {/* EMT Paramedic Staffing */}
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>
                {strings.emtStaffingRow}
              </Text>
              <View style={styles.statutoryIncludedPill}>
                <Text style={styles.statutoryIncludedText}>
                  {strings.emtStaffingValue}
                </Text>
              </View>
            </View>

            {/* Zero Surge Multiplier */}
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>
                {strings.surgeMultiplierRow}
              </Text>
              <View style={styles.zeroSurgePill}>
                <Text style={styles.zeroSurgeText}>
                  {strings.surgeMultiplierValue}
                </Text>
              </View>
            </View>

            <View style={styles.totalDivider} />

            {/* Total Fare */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {strings.totalFareRow}
              </Text>
              <Text style={styles.totalAmount}>
                ₹{fareDetails.estimatedTotalInr.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Payment Status Badge */}
          <View style={styles.paymentStatusCard}>
            <View style={styles.paymentStatusRow}>
              <View style={styles.paymentSuccessIconCircle}>
                <AppIcon icon={{ set: "ion", name: "checkmark" }} size={16} style={styles.paymentSuccessIcon} />
              </View>
              <View style={styles.paymentTextGroup}>
                <Text style={styles.paymentStatusHeading}>
                  {strings.paymentStatusValue}
                </Text>
                <Text style={styles.paymentRefText}>
                  {strings.transactionRefLabel("TXN-DL-2026-982104")} • Direct
                  Bank Settlement
                </Text>
              </View>
            </View>
          </View>

          {/* Dispute Fare Affordance */}
          {onDisputeFare && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.disputeFareButton}
              style={styles.disputeButton}
              onPress={onDisputeFare}
            >
              <Text style={styles.disputeButtonText}>
                <AppIcon icon={{ set: "ion", name: "warning" }} size={11} />{" "}{strings.disputeFareButton}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ===================================================================
            3. DPDP PRIVACY PANEL (DPDP ACT 2023 & DPDP 2025 RULES)
           =================================================================== */}
        <View style={styles.dpdpCard}>
          <View style={styles.dpdpHeaderRow}>
            <View style={styles.dpdpTag}>
              <Text style={styles.dpdpTagText}>{strings.dpdpPanelTag}</Text>
            </View>
          </View>

          <Text style={styles.dpdpHeading}>{strings.dpdpPanelHeading}</Text>
          <Text style={styles.dpdpDescription}>
            {strings.dpdpPanelDescription}
          </Text>

          {/* EMR HANDOFF PDF DOWNLOAD BUTTON */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.downloadEmrButton}
            accessibilityHint="Downloads certified Emergency Medical Record handoff summary PDF"
            style={styles.downloadEmrBtn}
            onPress={handleDownloadEmr}
          >
            <View style={styles.downloadEmrIconWrapper}>
              <AppIcon icon={{ set: "ion", name: "download" }} size={18} color={colors.slate700} style={styles.downloadEmrIcon} />
            </View>
            <View style={styles.downloadEmrTextGroup}>
              <Text style={styles.downloadEmrTitle}>
                {strings.downloadEmrButton}
              </Text>
              <Text style={styles.downloadEmrSubtitle}>
                {strings.downloadEmrSubtitle}
              </Text>
            </View>
            <Text style={styles.pdfBadge}>PDF</Text>
          </Pressable>

          <View style={styles.divider} />

          {/* Processed Data Inventory */}
          <Text style={styles.inventoryHeading}>
            {strings.collectedDataHeading}
          </Text>

          <View style={styles.inventoryList}>
            {strings.collectedDataItems.map((item) => (
              <View key={item.id} style={styles.inventoryItem}>
                <View style={styles.inventoryIconBadge}>
                  <AppIcon icon={item.icon} size={16} color={colors.slate600} />
                </View>
                <View style={styles.inventoryInfoGroup}>
                  <View style={styles.inventoryTitleRow}>
                    <Text style={styles.inventoryTitle}>{item.title}</Text>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>
                        {item.category}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.inventoryDescription}>
                    {item.description}
                  </Text>
                  <Text style={styles.retentionNotice}>
                    ⏱️ {item.retentionPeriod}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          {/* PREMATURE DELETION TOGGLE (DPDP 2025 RULES) */}
          <View style={styles.deletionToggleCard}>
            <View style={styles.deletionToggleHeaderRow}>
              <View style={styles.deletionTextGroup}>
                <Text style={styles.deletionToggleLabel}>
                  {strings.deletionToggleLabel}
                </Text>
                <Text style={styles.deletionToggleSubtitle}>
                  {strings.deletionToggleSubtitle}
                </Text>
              </View>

              <Switch
                value={isDeletionRequested}
                onValueChange={handleToggleDeletion}
                trackColor={{ false: colors.slate300, true: colors.emergency }}
                thumbColor={colors.white}
                accessibilityRole="switch"
                accessibilityLabel={strings.deletionToggleLabel}
              />
            </View>

            {/* Active Erasure Status Badge */}
            {isDeletionRequested && (
              <View style={styles.deletionStatusBanner}>
                <AppIcon icon={{ set: "ion", name: "trash" }} size={14} color={colors.slate700} style={styles.deletionStatusIcon} />
                <Text style={styles.deletionStatusText}>
                  {strings.deletionQueuedBadge("DPDP-DEL-2026-8921")}
                </Text>
              </View>
            )}
          </View>

          {/* DPO Contact Footnote */}
          <Text style={styles.dpoNoticeText}>
            {strings.dpoNotice("dpo@ek-ambulance.in")}
          </Text>
        </View>

        {/* ===================================================================
            4. PRIMARY ACTION BUTTON
           =================================================================== */}
        {onReturnHome && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.returnHomeButton}
            style={styles.returnHomeButton}
            onPress={onReturnHome}
          >
            <Text style={styles.returnHomeButtonText}>
              {strings.returnHomeButton}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ===================================================================
          DPDP 2025 RULES PREMATURE DELETION CONFIRMATION MODAL
         =================================================================== */}
      <Modal
        visible={isDeletionModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDeletionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalWarningIconBadge}>
              <AppIcon icon={{ set: "ion", name: "scale" }} size={24} color={colors.slate700} style={styles.modalWarningIcon} />
            </View>

            <Text style={styles.modalTitle}>
              {strings.deletionModalTitle}
            </Text>
            <Text style={styles.modalDescription}>
              {strings.deletionModalDescription}
            </Text>

            {/* What is Purged */}
            <View style={styles.legalSection}>
              <Text style={styles.legalSectionHeadingPurged}>
                {strings.deletionWhatIsPurgedTitle}
              </Text>
              {strings.deletionPurgedList.map((item, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <AppIcon icon={{ set: "ion", name: "checkmark" }} size={10} style={styles.bulletPurged} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Mandatory Statutory Retention */}
            <View style={styles.legalSection}>
              <Text style={styles.legalSectionHeadingRetained}>
                {strings.deletionStatutoryRetainedTitle}
              </Text>
              {strings.deletionRetainedList.map((item, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <Text style={styles.bulletRetained}>ℹ️</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.deletionConfirmButton}
                style={styles.modalConfirmBtn}
                onPress={handleConfirmDeletion}
              >
                <Text style={styles.modalConfirmBtnText}>
                  {strings.deletionConfirmButton}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.deletionCancelButton}
                style={styles.modalCancelBtn}
                onPress={() => setIsDeletionModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>
                  {strings.deletionCancelButton}
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
  headerLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerShieldIconBadge: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.successLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  headerShieldIcon: {
    fontSize: 18,
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing["3xl"],
    gap: spacing.base,
  },

  // Toast Banner
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

  // Completion Hero Banner
  completionBannerCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.success,
    ...shadows.sm,
  },
  completionBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  completedTag: {
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  completedTagText: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.white,
    letterSpacing: 0.5,
  },
  timestampText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.medium,
    color: colors.slate600,
  },
  completionBannerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginTop: spacing.xs,
  },
  completionBannerSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    marginTop: 2,
    lineHeight: 18,
  },

  // Statutory Receipt Card
  receiptCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  receiptHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  receiptIconBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  receiptIcon: {
    fontSize: 22,
  },
  receiptTitleGroup: {
    flex: 1,
  },
  receiptHeading: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  receiptSubtitle: {
    fontSize: 11,
    color: colors.emergencyDark,
    fontWeight: typography.fontWeights.semibold,
    marginTop: 1,
  },

  // Mission Overview Context
  missionContextGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  contextItem: {
    width: "100%",
    backgroundColor: colors.slate50,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  contextItemHalf: {
    width: "48%",
    backgroundColor: colors.slate50,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  contextItemLabel: {
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate500,
    letterSpacing: 0.4,
  },
  contextItemValue: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.slate200,
    marginVertical: spacing.md,
  },

  // Table
  tableContainer: {
    gap: spacing.sm,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tableLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    flex: 1,
    paddingRight: spacing.sm,
  },
  tableValue: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate900,
  },
  tableValueBold: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  statutoryIncludedPill: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.success,
  },
  statutoryIncludedText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success,
  },
  zeroSurgePill: {
    backgroundColor: colors.infoLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.info,
  },
  zeroSurgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.info,
  },
  totalDivider: {
    height: 2,
    backgroundColor: colors.slate900,
    marginVertical: spacing.xs,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  totalLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  totalAmount: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },

  // Payment Status Card
  paymentStatusCard: {
    backgroundColor: colors.successLight,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.success,
    marginTop: spacing.md,
  },
  paymentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  paymentSuccessIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  paymentSuccessIcon: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.white,
  },
  paymentTextGroup: {
    flex: 1,
  },
  paymentStatusHeading: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.success,
  },
  paymentRefText: {
    fontSize: 10,
    color: colors.slate700,
    marginTop: 2,
  },
  disputeButton: {
    marginTop: spacing.md,
    alignItems: "center",
  },
  disputeButtonText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    color: colors.emergencyDark,
    textDecorationLine: "underline",
  },

  // ===========================================================================
  // DPDP PRIVACY PANEL STYLES
  // ===========================================================================
  dpdpCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  dpdpHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  dpdpTag: {
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.info,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  dpdpTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.info,
    letterSpacing: 0.5,
  },
  dpdpHeading: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginTop: spacing.xs,
  },
  dpdpDescription: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: spacing.md,
  },

  // Download EMR Action
  downloadEmrBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate900,
    borderRadius: radii.xl,
    padding: spacing.md,
    ...shadows.sm,
  },
  downloadEmrIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  downloadEmrIcon: {
    fontSize: 18,
  },
  downloadEmrTextGroup: {
    flex: 1,
  },
  downloadEmrTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  downloadEmrSubtitle: {
    fontSize: 10,
    color: colors.slate300,
    marginTop: 1,
  },
  pdfBadge: {
    backgroundColor: colors.emergency,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: "900",
    color: colors.white,
  },

  // Inventory
  inventoryHeading: {
    fontSize: 11,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate700,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  inventoryList: {
    gap: spacing.sm,
  },
  inventoryItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.slate50,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  inventoryIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  inventoryIcon: {
    fontSize: 16,
  },
  inventoryInfoGroup: {
    flex: 1,
  },
  inventoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inventoryTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: colors.slate200,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  categoryBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.slate700,
  },
  inventoryDescription: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 2,
    lineHeight: 16,
  },
  retentionNotice: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate500,
    marginTop: 4,
  },

  // Deletion Toggle Card
  deletionToggleCard: {
    backgroundColor: colors.slate50,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.slate300,
  },
  deletionToggleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deletionTextGroup: {
    flex: 1,
    marginRight: spacing.md,
  },
  deletionToggleLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  deletionToggleSubtitle: {
    fontSize: 10,
    color: colors.slate600,
    marginTop: 2,
    lineHeight: 14,
  },
  deletionStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergency,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  deletionStatusIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  deletionStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.emergencyDark,
    flex: 1,
  },
  dpoNoticeText: {
    fontSize: 10,
    color: colors.slate500,
    textAlign: "center",
    marginTop: spacing.md,
  },

  // Return Home Button
  returnHomeButton: {
    backgroundColor: colors.slate900,
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    ...shadows.sm,
  },
  returnHomeButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },

  // Modal Styles
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
    backgroundColor: colors.infoLight,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  modalWarningIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: typography.fontSizes.base,
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
  legalSection: {
    backgroundColor: colors.slate50,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  legalSectionHeadingPurged: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.emergencyDark,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  legalSectionHeadingRetained: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.slate700,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  bulletPurged: {
    fontSize: 10,
    fontWeight: "bold",
    color: colors.emergency,
    marginRight: 6,
    marginTop: 1,
  },
  bulletRetained: {
    fontSize: 10,
    marginRight: 6,
    marginTop: 1,
  },
  bulletText: {
    fontSize: 10,
    color: colors.slate800,
    flex: 1,
    lineHeight: 14,
  },
  modalActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalConfirmBtn: {
    backgroundColor: colors.emergency,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  modalConfirmBtnText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  modalCancelBtn: {
    backgroundColor: colors.slate100,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  modalCancelBtnText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
});
