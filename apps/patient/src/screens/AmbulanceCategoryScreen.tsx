import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import {
  AIS125VehicleType,
  CareLevel,
  UrgencyTier,
  computeVehiclePricingEstimate,
  VehiclePricingEstimateResponse,
} from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import {
  categoryStrings,
  AIS125_VEHICLES,
  VehicleCategoryMetadata,
} from "../i18n/categoryStrings";

import { AppIcon } from "../components";
export interface AmbulanceCategoryScreenProps {
  triageCareLevel?: CareLevel; // e.g. "ALS" | "BLS" | "PTA"
  urgencyTier?: UrgencyTier;   // e.g. "CAT_1_IMMEDIATE" | "CAT_2_URGENT" | "CAT_3_DELAYED"
  /** Known routed distance; omitted before a route exists, and the cards then show the statutory starting fare. */
  estimatedDistanceKm?: number;
  initialLanguage?: SupportedLanguage;
  onConfirmCategory?: (selection: {
    vehicleType: AIS125VehicleType;
    careLevel: CareLevel;
    pricing: VehiclePricingEstimateResponse;
  }) => void;
  onBack?: () => void;
}

export default function AmbulanceCategoryScreen({
  triageCareLevel = "ALS",
  urgencyTier = "CAT_1_IMMEDIATE",
  estimatedDistanceKm,
  initialLanguage = "en",
  onConfirmCategory,
  onBack,
}: AmbulanceCategoryScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = categoryStrings[language];

  // Helper to determine clinical eligibility based on triage
  const isVehicleEligible = (type: AIS125VehicleType): boolean => {
    switch (triageCareLevel) {
      case "ALS":
        // Patient requires Advanced Life Support; only Type D is clinically safe
        return type === "TYPE_D_ALS";
      case "BLS":
        // Patient requires BLS; Type C and upgraded Type D are safe
        return type === "TYPE_C_BLS" || type === "TYPE_D_ALS";
      case "PTA":
      default:
        // Patient transport; Type B, C, and D are eligible (Type A lacks stretcher)
        return type !== "TYPE_A_MFR";
    }
  };

  // Determine initial valid vehicle selection
  const defaultSelection: AIS125VehicleType = useMemo(() => {
    if (triageCareLevel === "ALS") return "TYPE_D_ALS";
    if (triageCareLevel === "BLS") return "TYPE_C_BLS";
    return "TYPE_B_PTA";
  }, [triageCareLevel]);

  const [selectedVehicle, setSelectedVehicle] =
    useState<AIS125VehicleType>(defaultSelection);

  // Compute pricing estimate for all 4 categories
  const pricingEstimates = useMemo(() => {
    const map: Record<AIS125VehicleType, VehiclePricingEstimateResponse> = {
      TYPE_D_ALS: computeVehiclePricingEstimate({
        vehicleType: "TYPE_D_ALS",
        jurisdiction: null,
        distanceKm: estimatedDistanceKm ?? 0,
      }),
      TYPE_C_BLS: computeVehiclePricingEstimate({
        vehicleType: "TYPE_C_BLS",
        jurisdiction: null,
        distanceKm: estimatedDistanceKm ?? 0,
      }),
      TYPE_B_PTA: computeVehiclePricingEstimate({
        vehicleType: "TYPE_B_PTA",
        jurisdiction: null,
        distanceKm: estimatedDistanceKm ?? 0,
      }),
      TYPE_A_MFR: computeVehiclePricingEstimate({
        vehicleType: "TYPE_A_MFR",
        jurisdiction: null,
        distanceKm: estimatedDistanceKm ?? 0,
      }),
    };
    return map;
  }, [estimatedDistanceKm]);

  const selectedPricing = pricingEstimates[selectedVehicle];
  const selectedVehicleMeta = AIS125_VEHICLES.find(
    (v) => v.id === selectedVehicle
  )!;

  const handleSelect = (vehicle: VehicleCategoryMetadata) => {
    if (!isVehicleEligible(vehicle.id)) return;
    setSelectedVehicle(vehicle.id);
  };

  const handleConfirm = () => {
    if (onConfirmCategory) {
      onConfirmCategory({
        vehicleType: selectedVehicle,
        careLevel: selectedPricing.careLevel,
        pricing: selectedPricing,
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP HEADER: Navigation & Persistent Bilingual Toggle */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.backButton}
              onPress={onBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={20} style={styles.backArrow} />
            </Pressable>
          )}
          <View>
            <Text style={styles.headerTitle}>{strings.headerTitle}</Text>
            <Text style={styles.headerTagline}>{strings.headerTagline}</Text>
          </View>
        </View>

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TRIAGE CONTEXT PROTOCOL BANNER */}
        <View
          style={[
            styles.triageContextCard,
            triageCareLevel === "ALS"
              ? styles.triageCardALS
              : triageCareLevel === "BLS"
              ? styles.triageCardBLS
              : styles.triageCardPTA,
          ]}
          accessible={true}
          accessibilityRole="summary"
        >
          <View style={styles.triageHeaderRow}>
            <View style={styles.triagePill}>
              <Text style={styles.triagePillText}>
                {strings.triageAcuityLabel}: {triageCareLevel}
              </Text>
            </View>
            <Text style={styles.triageTierTag}>
              {urgencyTier.replace(/_/g, " ")}
            </Text>
          </View>
          <Text style={styles.triageNoticeText}>
            {strings.triageMandateNotice(triageCareLevel)}
          </Text>
        </View>

        {/* FOUR AIS-125 COMPLIANT VEHICLE CARDS */}
        <View style={styles.cardsContainer}>
          {AIS125_VEHICLES.map((vehicle) => {
            const isEligible = isVehicleEligible(vehicle.id);
            const isSelected = selectedVehicle === vehicle.id;
            const pricing = pricingEstimates[vehicle.id];

            // Lockout explanation message
            const getLockoutMessage = () => {
              if (triageCareLevel === "ALS") return strings.lockoutCat1;
              if (triageCareLevel === "BLS") return strings.lockoutCat2;
              return strings.lockoutCat3;
            };

            return (
              <Pressable
                key={vehicle.id}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: isSelected,
                  disabled: !isEligible,
                }}
                accessibilityLabel={`${
                  language === "hi" ? vehicle.hindiTitle : vehicle.title
                }. ${isEligible ? "Available" : "Disabled by Clinical Triage"}`}
                style={({ pressed }) => [
                  styles.card,
                  isSelected && styles.cardSelected,
                  !isEligible && styles.cardDisabled,
                  pressed && isEligible && styles.cardPressed,
                ]}
                onPress={() => handleSelect(vehicle)}
              >
                {/* Header Row: Vehicle Name, Badge, & Radio */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.vehicleIconBadge}>
                    <AppIcon
                      icon={vehicle.icon}
                      size={22}
                      color={isSelected ? colors.emergency : colors.slate700}
                    />
                  </View>

                  <View style={styles.titleTextGroup}>
                    <View style={styles.titleLine}>
                      <Text
                        style={[
                          styles.vehicleTitle,
                          !isEligible && styles.textDisabled,
                        ]}
                      >
                        {language === "hi"
                          ? vehicle.hindiTitle
                          : vehicle.title}
                      </Text>
                      <View
                        style={[
                          styles.categoryCodeBadge,
                          isSelected && styles.categoryCodeBadgeSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryCodeText,
                            isSelected && styles.categoryCodeTextSelected,
                          ]}
                        >
                          {language === "hi"
                            ? vehicle.hindiBadge
                            : vehicle.badge}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[
                        styles.vehicleSubtitle,
                        !isEligible && styles.textDisabled,
                      ]}
                    >
                      {language === "hi"
                        ? vehicle.hindiSubtitle
                        : vehicle.subtitle}
                    </Text>
                  </View>

                  {/* Radio Button */}
                  <View
                    style={[
                      styles.radioCircle,
                      isSelected && styles.radioCircleSelected,
                      !isEligible && styles.radioCircleDisabled,
                    ]}
                  >
                    {isSelected && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.radioCheckmark} />}
                  </View>
                </View>

                {/* CLINICAL LOCKOUT WARNING (IF DISABLED BY TRIAGE) */}
                {!isEligible && (
                  <View
                    style={styles.lockoutBanner}
                    accessible={true}
                    accessibilityRole="alert"
                  >
                    <Text style={styles.lockoutText}>
                      {getLockoutMessage()}
                    </Text>
                  </View>
                )}

                {/* METRICS ROW: Regulated Fare. No ETA or distance here: nothing is known about the nearest ambulance until the
                    server matches one, so none is invented. */}
                <View style={styles.metricsRow}>
                  {/* Statutory Regulated Fare */}
                  <View style={styles.fareContainer}>
                    <Text style={styles.fareTotalText}>
                      {estimatedDistanceKm === undefined ? strings.fareFromPrefix : ""}₹{pricing.estimatedTotalInr}
                    </Text>
                    <Text style={styles.fareBreakdownText}>
                      (₹{pricing.baseFareInr} + ₹{pricing.perKmRateInr}/km)
                    </Text>
                  </View>
                </View>

                <View style={styles.cardDivider} />

                {/* EQUIPMENT BADGES */}
                <View style={styles.equipmentSection}>
                  <Text style={styles.equipmentTitle}>
                    {strings.equipmentHeading}:
                  </Text>
                  <View style={styles.equipmentPillsWrap}>
                    {(language === "hi"
                      ? vehicle.hindiEquipment
                      : vehicle.equipment
                    ).map((eq, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.equipmentPill,
                          isSelected && styles.equipmentPillSelected,
                          !isEligible && styles.equipmentPillDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.equipmentPillText,
                            isSelected && styles.equipmentPillTextSelected,
                            !isEligible && styles.textDisabled,
                          ]}
                        >
                          <AppIcon icon={{ set: "ion", name: "checkmark" }} />{" "}{eq}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* PERSISTENT CONFIRMATION ACTION DOCK */}
      <View style={styles.actionDock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.confirmButtonText(
            selectedVehicleMeta.code,
            selectedPricing.estimatedTotalInr
          )}
          accessibilityHint="Proceeds to review statutory estimate and dispatch ambulance"
          style={({ pressed }) => [
            styles.confirmButton,
            pressed && styles.confirmButtonPressed,
          ]}
          onPress={handleConfirm}
        >
          <View style={styles.confirmTextContainer}>
            <Text style={styles.confirmButtonTitle}>
              {strings.confirmButtonText(
                selectedVehicleMeta.code,
                selectedPricing.estimatedTotalInr
              )}
            </Text>
            <Text style={styles.confirmButtonSubtitle}>
              {strings.confirmButtonSubtitle}
            </Text>
          </View>
          <AppIcon icon={{ set: "ion", name: "arrow-forward" }} size={22} style={styles.confirmArrow} />
        </Pressable>

        <Text style={styles.tariffFootnote}>
          {strings.statutoryRegulationFootnote}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },

  /* HEADER */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
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
  backArrow: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.slate900,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerTagline: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    minHeight: 32,
  },
  langButtonActive: {
    backgroundColor: colors.slate900,
  },
  langButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
  langButtonTextActive: {
    color: colors.white,
  },
  langDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.slate300,
  },

  /* SCROLL CONTENT */
  scrollView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing["2xl"],
  },

  /* TRIAGE CONTEXT PROTOCOL BANNER */
  triageContextCard: {
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    marginBottom: spacing.base,
  },
  triageCardALS: {
    backgroundColor: colors.emergencyLight,
    borderColor: colors.emergency,
  },
  triageCardBLS: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
  },
  triageCardPTA: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  triageHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  triagePill: {
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  triagePillText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  triageTierTag: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.slate700,
    textTransform: "uppercase",
  },
  triageNoticeText: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
    color: colors.slate800,
    fontWeight: typography.fontWeights.medium,
  },

  /* VEHICLE CARDS */
  cardsContainer: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  cardSelected: {
    borderColor: colors.emergency,
    borderWidth: 2,
    backgroundColor: colors.slate50,
    ...shadows.md,
  },
  cardDisabled: {
    backgroundColor: colors.slate100,
    borderColor: colors.slate300,
    opacity: 0.72,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  vehicleIconBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  vehicleIcon: {
    fontSize: 22,
  },
  titleTextGroup: {
    flex: 1,
    marginRight: spacing.sm,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  vehicleTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  categoryCodeBadge: {
    backgroundColor: colors.slate200,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  categoryCodeBadgeSelected: {
    backgroundColor: colors.emergencyLight,
  },
  categoryCodeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.slate800,
  },
  categoryCodeTextSelected: {
    color: colors.emergencyDark,
  },
  vehicleSubtitle: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 16,
    color: colors.slate600,
  },
  textDisabled: {
    color: colors.slate500,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.slate400,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  radioCircleSelected: {
    borderColor: colors.emergency,
    backgroundColor: colors.emergency,
  },
  radioCircleDisabled: {
    borderColor: colors.slate400,
    backgroundColor: colors.slate200,
  },
  radioCheckmark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },

  /* LOCKOUT BANNER */
  lockoutBanner: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergencyDark,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  lockoutText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
    lineHeight: 16,
  },

  /* METRICS: ETA & FARE */
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  etaBadge: {
    backgroundColor: colors.slate100,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  etaText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  fareContainer: {
    alignItems: "flex-end",
  },
  fareTotalText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  fareBreakdownText: {
    fontSize: 10,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.slate200,
    marginBottom: spacing.sm,
  },

  /* EQUIPMENT BADGES */
  equipmentSection: {
    marginTop: 2,
  },
  equipmentTitle: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  equipmentPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  equipmentPill: {
    backgroundColor: colors.slate100,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  equipmentPillSelected: {
    backgroundColor: colors.white,
    borderColor: colors.slate300,
  },
  equipmentPillDisabled: {
    backgroundColor: colors.slate200,
    borderColor: colors.slate300,
  },
  equipmentPillText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },
  equipmentPillTextSelected: {
    color: colors.slate900,
  },

  /* ACTION DOCK */
  actionDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.base,
    backgroundColor: colors.white,
    borderTopWidth: 1.5,
    borderTopColor: colors.slate200,
    ...shadows.md,
  },
  confirmButton: {
    backgroundColor: colors.emergency,
    borderRadius: radii.xl,
    paddingVertical: 14,
    paddingHorizontal: spacing.base,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  confirmButtonPressed: {
    backgroundColor: colors.emergencyDeep,
    transform: [{ scale: 0.99 }],
  },
  confirmTextContainer: {
    flex: 1,
  },
  confirmButtonTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  confirmButtonSubtitle: {
    fontSize: 10,
    color: colors.emergencyLight,
    fontWeight: typography.fontWeights.medium,
    marginTop: 1,
  },
  confirmArrow: {
    fontSize: 22,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginLeft: spacing.sm,
  },
  tariffFootnote: {
    fontSize: 10,
    color: colors.slate600,
    textAlign: "center",
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
});
