import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  LayoutAnimation,
} from "react-native";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import {
  AIS125VehicleType,
  Jurisdiction,
  ItemizedStatutoryFare,
  computeItemizedStatutoryFare,
} from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { fareStrings } from "../i18n/fareStrings";

import { AppIcon } from "../components";
// No Android UIManager.setLayoutAnimationEnabledExperimental() call: it's a no-op under the New
// Architecture (Fabric, on by default since RN 0.76) and only produced a Metro warning.
// LayoutAnimation.configureNext below still works without it.

export interface StatutoryFareBottomSheetProps {
  vehicleType: AIS125VehicleType;
  // Known only once the server has created the mission (R-12); before that the sheet names no state.
  jurisdiction?: Jurisdiction | null;
  distanceKm?: number;
  initialExpanded?: boolean;
  initialLanguage?: SupportedLanguage;
  onConfirmAndRequest?: (fareDetails: ItemizedStatutoryFare) => void;
}


export default function StatutoryFareBottomSheet({
  vehicleType,
  jurisdiction = null,
  distanceKm = 12.4,
  initialExpanded = true,
  initialLanguage = "en",
  onConfirmAndRequest,
}: StatutoryFareBottomSheetProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded);
  const strings = fareStrings[language];

  // Compute itemized statutory fare per state transport regulations
  const itemizedFare = computeItemizedStatutoryFare({
    vehicleType,
    jurisdiction,
    distanceKm,
  });

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const handleConfirm = () => {
    if (onConfirmAndRequest) {
      onConfirmAndRequest(itemizedFare);
    }
  };

  return (
    <View style={styles.sheetContainer} accessible={false}>
      {/* DRAG HANDLE & TAP-TO-EXPAND HEADER */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isExpanded ? strings.hideBreakdownButton : strings.viewBreakdownButton
        }
        accessibilityHint="Expands or collapses the itemized statutory fare breakdown"
        onPress={toggleExpand}
        style={styles.dragHandleContainer}
      >
        <View style={styles.dragHandleBar} />

        {/* Persistent Language Toggle in Sheet Header */}
        <View style={styles.sheetHeaderTopRow}>
          <Text style={styles.sheetHeaderCategoryTitle}>
            {itemizedFare.vehicleType.replace(/_/g, " ")}
            {itemizedFare.jurisdiction === "DL" ? " • NCT of Delhi" : itemizedFare.jurisdiction === "UP" ? " • Uttar Pradesh" : ""}
          </Text>

          {/* Bilingual Switcher */}
          <View
            style={styles.languageToggleContainer}
            accessible={true}
            accessibilityRole="radiogroup"
          >
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: language === "en" }}
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

            <View style={styles.langDivider} />

            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: language === "hi" }}
              accessibilityLabel="हिन्दी में बदलें"
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
      </Pressable>

      {/* EXPLICIT MANDATE BANNER: REGULATED NON-SURGE EMERGENCY PRICING */}
      <View
        style={styles.mandateBanner}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel={strings.mandateBannerTitle}
      >
        <View style={styles.mandateIconWrapper}>
          <AppIcon icon={{ set: "mci", name: "bank" }} size={20} color={colors.slate700} style={styles.mandateIcon} />
        </View>
        <View style={styles.mandateTextGroup}>
          <Text style={styles.mandateBannerTitle}>
            {language === "hi"
              ? itemizedFare.hindiMandateDeclaration
              : itemizedFare.mandateDeclaration}
          </Text>
          <Text style={styles.mandateBannerSubtitle}>
            {strings.mandateBannerSubtitle}
          </Text>
        </View>
      </View>

      {/* EXPANDABLE ITEMIZED STATUTORY TABLE */}
      {isExpanded ? (
        // Scrolls instead of growing past the screen: an over-tall sheet pushed the CTA under the nav bar.
        <ScrollView style={styles.expandedScroll} contentContainerStyle={styles.expandedSection}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableHeading}>{strings.tableHeading}</Text>
            <Pressable onPress={toggleExpand} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.collapseText}><AppIcon icon={{ set: "ion", name: "caret-up" }} size={11} />{" "}{strings.hideBreakdownButton}</Text>
            </Pressable>
          </View>

          {/* ITEMIZED TABLE */}
          <View style={styles.tableContainer}>
            {/* ROW 1: BASE FARE (Includes initial 5.0 km) */}
            <View style={styles.tableRow}>
              <View style={styles.tableLabelGroup}>
                <Text style={styles.tableRowTitle}>
                  {strings.baseFareRow(itemizedFare.initialIncludedKm)}
                </Text>
                <Text style={styles.tableRowSubtitle}>
                  Statutory minimum block (0 - {itemizedFare.initialIncludedKm.toFixed(1)} km)
                </Text>
              </View>
              <Text style={styles.tableRowValue}>
                ₹{itemizedFare.baseFareInr.toFixed(2)}
              </Text>
            </View>

            {/* ROW 2: PER-KILOMETER STATUTORY RATE */}
            <View style={styles.tableRow}>
              <View style={styles.tableLabelGroup}>
                <Text style={styles.tableRowTitle}>
                  {itemizedFare.billableAdditionalKm > 0
                    ? strings.additionalDistanceRow(
                        itemizedFare.billableAdditionalKm,
                        itemizedFare.perKmRateInr
                      )
                    : strings.additionalDistanceRow(0, itemizedFare.perKmRateInr)}
                </Text>
                <Text style={styles.tableRowSubtitle}>
                  {itemizedFare.billableAdditionalKm > 0
                    ? `${itemizedFare.totalDistanceKm.toFixed(1)} km total trip distance`
                    : strings.noAdditionalDistanceText}
                </Text>
              </View>
              <Text style={styles.tableRowValue}>
                ₹{itemizedFare.additionalDistanceFareInr.toFixed(2)}
              </Text>
            </View>

            {/* ROW 3: EMT / PARAMEDIC CREW (STATUTORY INCLUDED: ₹0) */}
            <View style={styles.tableRow}>
              <View style={styles.tableLabelGroup}>
                <Text style={styles.tableRowTitle}>
                  {strings.emtParamedicRow}
                </Text>
                <Text style={styles.tableRowSubtitle}>
                  Mandatory onboard clinical staffing under AIS-125
                </Text>
              </View>
              <View style={styles.statutoryIncludedBadge}>
                <Text style={styles.statutoryIncludedText}>
                  {strings.emtParamedicValue}
                </Text>
              </View>
            </View>

            {/* ROW 4: ZERO SURGE PRICING GUARANTEE (1.0x MULTIPLIER) */}
            <View style={styles.tableRow}>
              <View style={styles.tableLabelGroup}>
                <Text style={styles.tableRowTitle}>
                  {strings.surgeMultiplierRow}
                </Text>
                <Text style={styles.tableRowSubtitle}>
                  Anti-gouging statutory protection (0% distress fee)
                </Text>
              </View>
              <View style={styles.zeroSurgeBadge}>
                <Text style={styles.zeroSurgeText}>
                  {strings.surgeMultiplierValue}
                </Text>
              </View>
            </View>

            {/* TOTAL STATUTORY ROW */}
            <View style={[styles.tableRow, styles.totalRow]}>
              <View style={styles.tableLabelGroup}>
                <Text style={styles.totalLabel}>{strings.totalFareRow}</Text>
                {itemizedFare.statutoryOrderRef !== "" && (
                  <Text style={styles.totalSubtitle}>{itemizedFare.statutoryOrderRef}</Text>
                )}
              </View>
              <Text style={styles.totalValue}>
                ₹{itemizedFare.estimatedTotalInr.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* STATUTORY DISCLAIMER (P05 MANDATORY NOTICE) */}
          <Text style={styles.indicativeDisclaimerText}>
            * {strings.indicativeDisclaimer}
          </Text>
          <Text style={styles.legalNoticeText}>
            <AppIcon icon={{ set: "ion", name: "scale" }} size={10} />{" "}{strings.zeroSurgeLawGuarantee}
          </Text>
        </ScrollView>
      ) : (
        /* COLLAPSED SUMMARY VIEW */
        <View style={styles.collapsedSummaryRow}>
          <View style={styles.collapsedPriceGroup}>
            <Text style={styles.collapsedFareLabel}>
              {strings.totalFareRow}
            </Text>
            <Text style={styles.collapsedFareValue}>
              ₹{itemizedFare.estimatedTotalInr.toFixed(2)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.viewBreakdownButton}
            onPress={toggleExpand}
            style={styles.expandButton}
          >
            <Text style={styles.expandButtonText}>
              {strings.viewBreakdownButton}{" "}
            <AppIcon icon={{ set: "ion", name: "caret-down" }} size={12} />
            </Text>
          </Pressable>
        </View>
      )}

      {/* PRIMARY ACTION BUTTON: SOLID EMERGENCY RED */}
      <View style={styles.actionDock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${strings.confirmButtonText}. Estimated fare: ${itemizedFare.estimatedTotalInr} rupees.`}
          accessibilityHint="Locks authoritative statutory fare server-side and dispatches nearest ambulance"
          style={({ pressed }) => [
            styles.primaryRedButton,
            pressed && styles.primaryRedButtonPressed,
          ]}
          onPress={handleConfirm}
        >
          <View style={styles.buttonContentRow}>
            <View style={styles.buttonTextGroup}>
              <Text style={styles.buttonTitle}>
                {strings.confirmButtonText}
              </Text>
              <Text style={styles.buttonSubtitle}>
                {strings.confirmButtonSubtitle} • ₹
                {itemizedFare.estimatedTotalInr.toFixed(2)}
              </Text>
            </View>
            <AppIcon icon={{ set: "ion", name: "arrow-forward" }} size={24} style={styles.buttonArrow} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii["2xl"],
    borderTopRightRadius: radii["2xl"],
    borderTopWidth: 1.5,
    borderTopColor: colors.slate300,
    ...shadows.md,
    paddingTop: spacing.xs,
    flexShrink: 1,
  },

  /* DRAG HANDLE */
  dragHandleContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: spacing.lg,
  },
  dragHandleBar: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.slate300,
    marginBottom: 8,
  },
  sheetHeaderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 6,
  },
  sheetHeaderCategoryTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },

  /* BILINGUAL TOGGLE */
  languageToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderRadius: radii.full,
    padding: 2,
    borderWidth: 1.5,
    borderColor: colors.slate300,
  },
  langButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    minHeight: 28,
  },
  langButtonActive: {
    backgroundColor: colors.slate900,
  },
  langButtonText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
  langButtonTextActive: {
    color: colors.white,
  },
  langDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.slate300,
  },

  /* EXPLICIT MANDATE BANNER */
  mandateBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergencyLight,
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  mandateIconWrapper: {
    marginRight: spacing.sm,
  },
  mandateIcon: {
    fontSize: 20,
  },
  mandateTextGroup: {
    flex: 1,
  },
  mandateBannerTitle: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 16,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
    letterSpacing: 0.1,
  },
  mandateBannerSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.slate800,
    fontWeight: typography.fontWeights.medium,
    marginTop: 2,
  },

  /* EXPANDED SECTION */
  expandedScroll: {
    flexShrink: 1,
  },
  expandedSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  tableHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  tableHeading: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  collapseText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },

  /* TABLE */
  tableContainer: {
    backgroundColor: colors.slate50,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  tableLabelGroup: {
    flex: 1,
    marginRight: spacing.sm,
  },
  tableRowTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  tableRowSubtitle: {
    flexShrink: 1,
    fontSize: 10,
    color: colors.slate600,
    marginTop: 1,
  },
  tableRowValue: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },

  /* BADGES */
  statutoryIncludedBadge: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  statutoryIncludedText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success,
  },
  zeroSurgeBadge: {
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.info,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  zeroSurgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.info,
  },

  /* TOTAL ROW */
  totalRow: {
    backgroundColor: colors.white,
    borderBottomWidth: 0,
    paddingVertical: 12,
  },
  totalLabel: {
    flexShrink: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  totalSubtitle: {
    flexShrink: 1,
    fontSize: 9,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
  },
  totalValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
  },

  /* DISCLAIMERS */
  indicativeDisclaimerText: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.emergencyDark,
    fontStyle: "italic",
    marginBottom: 2,
  },
  legalNoticeText: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.slate700,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.xs,
  },

  /* COLLAPSED SUMMARY */
  collapsedSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  collapsedPriceGroup: {
    justifyContent: "center",
  },
  collapsedFareLabel: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate600,
    textTransform: "uppercase",
  },
  collapsedFareValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  expandButton: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  expandButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },

  /* PRIMARY ACTION BUTTON: SOLID RED */
  actionDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.base,
    backgroundColor: colors.white,
  },
  primaryRedButton: {
    backgroundColor: colors.emergency,
    borderRadius: radii.xl,
    paddingVertical: 14,
    paddingHorizontal: spacing.base,
    minHeight: 60,
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  primaryRedButtonPressed: {
    backgroundColor: colors.emergencyDeep,
    transform: [{ scale: 0.99 }],
  },
  buttonContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  buttonTextGroup: {
    flex: 1,
  },
  buttonTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.lg,
    lineHeight: typography.lineHeights.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
    letterSpacing: -0.2,
  },
  buttonSubtitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.emergencyLight,
    fontWeight: typography.fontWeights.medium,
    marginTop: 2,
  },
  buttonArrow: {
    fontSize: 24,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginLeft: spacing.sm,
  },
});
