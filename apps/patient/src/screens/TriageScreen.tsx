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
  computeTriageUrgency,
  TriageInput,
  TriageResult,
  PrimaryComplaintType,
  TraumaBinaryAssessment,
} from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import {
  triageStrings,
  PRIMARY_COMPLAINTS,
} from "../i18n/triageStrings";

import { AppIcon, DescribeEmergencyPanel } from "../components";
import { toTriageInput, TIER_SEVERITY, type TriageExtraction } from "../services/openRouterTriage";
export interface TriageScreenProps {
  onConfirmTriage?: (result: TriageResult) => void;
  onBack?: () => void;
  initialLanguage?: SupportedLanguage;
  initialComplaint?: PrimaryComplaintType;
}

export default function TriageScreen({
  onConfirmTriage,
  onBack,
  initialLanguage = "en",
  initialComplaint = "chest_pain",
}: TriageScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = triageStrings[language];

  // Selected primary complaint (defaults to chest pain for rapid emergency launch)
  const [selectedComplaint, setSelectedComplaint] =
    useState<PrimaryComplaintType>(initialComplaint);

  // START Trauma Binary Assessment State
  const [traumaVitals, setTraumaVitals] = useState<TraumaBinaryAssessment>({
    respiration: "normal",
    severeBleeding: false,
    responsiveness: "alert",
  });

  // Dynamically compute urgency tier based on START & ESI protocols
  const triageResult = useMemo<TriageResult>(() => {
    const input: TriageInput = {
      primaryComplaint: selectedComplaint,
      traumaAssessment:
        selectedComplaint === "severe_trauma" ? traumaVitals : undefined,
    };
    return computeTriageUrgency(input);
  }, [selectedComplaint, traumaVitals]);

  const handleSelectComplaint = (complaintId: PrimaryComplaintType) => {
    setSelectedComplaint(complaintId);
  };

  // The AI only pre-fills the same state the manual buttons drive; the tier still comes from computeTriageUrgency.
  const handleExtracted = (extraction: TriageExtraction): boolean => {
    const input = toTriageInput(extraction);
    setSelectedComplaint(input.primaryComplaint);
    if (input.traumaAssessment) setTraumaVitals(input.traumaAssessment);
    return TIER_SEVERITY[extraction.recommendedTier] > TIER_SEVERITY[computeTriageUrgency(input).tier];
  };

  const handleConfirm = () => {
    if (onConfirmTriage) {
      onConfirmTriage(triageResult);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP HEADER: Navigation, Title & Persistent Bilingual Toggle */}
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
            <View style={styles.protocolBadgeRow}>
              <View style={styles.protocolBadge}>
                <Text style={styles.protocolBadgeText}>
                  {strings.protocolBadge}
                </Text>
              </View>
              <Text style={styles.speedNoticeText}>{strings.speedNotice}</Text>
            </View>
          </View>
        </View>

        {/* Bilingual Language Switcher */}
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

      {/* DYNAMIC TOP URGENCY TIER BANNER */}
      <View
        style={[
          styles.urgencyTierBanner,
          {
            backgroundColor: triageResult.tierBgHex,
            borderColor: triageResult.tierColorHex,
          },
        ]}
        accessible={true}
        accessibilityRole="summary"
        accessibilityLabel={`Triage Tier: ${triageResult.tierName}. Assigned Care Level: ${triageResult.recommendedCareLevel}`}
      >
        <View style={styles.tierHeaderRow}>
          {/* Urgency Badge Pill */}
          <View
            style={[
              styles.tierPillBadge,
              { backgroundColor: triageResult.tierColorHex },
            ]}
          >
            <Text style={styles.tierPillText}>
              {triageResult.tierCategory.toUpperCase()} •{" "}
              {language === "hi"
                ? triageResult.hindiTierName
                : triageResult.tierName}
            </Text>
          </View>

          {/* Recommended Statutory Care Level */}
          <View style={styles.careLevelBadge}>
            <Text style={styles.careLevelLabel}>
              {strings.careLevelPrefix}:{" "}
            </Text>
            <Text style={styles.careLevelValue}>
              {triageResult.recommendedCareLevel}
            </Text>
          </View>
        </View>

        {/* Clinical Rationale Text */}
        <Text style={styles.rationaleText}>
          {language === "hi"
            ? triageResult.hindiClinicalRationale
            : triageResult.clinicalRationale}
        </Text>

        {/* Golden Hour Critical Ticker */}
        {triageResult.goldenHourActive && (
          <View style={styles.goldenHourTicker}>
            <Text style={styles.goldenHourText}>
              {strings.goldenHourActiveBanner}
            </Text>
          </View>
        )}
      </View>

      {/* SCROLLABLE QUESTIONNAIRE */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <DescribeEmergencyPanel language={language} onExtracted={handleExtracted} />

        {/* SECTION 1: PRIMARY COMPLAINTS */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>{strings.complaintsHeading}</Text>
          <Text style={styles.sectionSubheading}>
            {strings.complaintsSubheading}
          </Text>
        </View>

        <View style={styles.complaintsContainer}>
          {PRIMARY_COMPLAINTS.map((item) => {
            const isSelected = selectedComplaint === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${
                  language === "hi" ? item.hindiTitle : item.title
                }. ${language === "hi" ? item.hindiSubtitle : item.subtitle}`}
                style={({ pressed }) => [
                  styles.complaintCard,
                  isSelected && styles.complaintCardSelected,
                  pressed && styles.complaintCardPressed,
                ]}
                onPress={() => handleSelectComplaint(item.id)}
              >
                <View style={styles.complaintIconBox}>
                  <AppIcon
                    icon={item.icon}
                    size={22}
                    color={isSelected ? colors.emergency : colors.slate700}
                  />
                </View>

                <View style={styles.complaintTextGroup}>
                  <View style={styles.complaintTitleRow}>
                    <Text
                      style={[
                        styles.complaintTitle,
                        isSelected && styles.complaintTitleSelected,
                      ]}
                    >
                      {language === "hi" ? item.hindiTitle : item.title}
                    </Text>
                    <View
                      style={[
                        styles.complaintBadge,
                        isSelected && styles.complaintBadgeSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.complaintBadgeText,
                          isSelected && styles.complaintBadgeTextSelected,
                        ]}
                      >
                        {language === "hi"
                          ? item.hindiQuickBadge
                          : item.quickBadge}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.complaintSubtitle}>
                    {language === "hi" ? item.hindiSubtitle : item.subtitle}
                  </Text>
                </View>

                <View
                  style={[
                    styles.radioCheckCircle,
                    isSelected && styles.radioCheckCircleSelected,
                  ]}
                >
                  {isSelected && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.radioCheckmark} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* SECTION 2: TRAUMA START PROTOCOL BINARY SELECTORS (CONDITIONAL) */}
        {selectedComplaint === "severe_trauma" && (
          <View style={styles.traumaCard}>
            <View style={styles.traumaHeaderRow}>
              <View style={styles.traumaAlertBadge}>
                <Text style={styles.traumaAlertText}>{strings.traumaAlertBadgeLabel}</Text>
              </View>
              <Text style={styles.traumaTitle}>
                {strings.traumaSectionHeading}
              </Text>
            </View>
            <Text style={styles.traumaSubtitle}>
              {strings.traumaSectionSubheading}
            </Text>

            {/* Check 1: Respiration Status */}
            <View style={styles.binaryQuestionRow}>
              <Text style={styles.binaryQuestionLabel}>
                {strings.respirationLabel}
              </Text>
              <View style={styles.binaryButtonGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: traumaVitals.respiration === "normal",
                  }}
                  style={[
                    styles.binaryButton,
                    traumaVitals.respiration === "normal" &&
                      styles.binaryButtonActiveNormal,
                  ]}
                  onPress={() =>
                    setTraumaVitals((prev) => ({
                      ...prev,
                      respiration: "normal",
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.binaryButtonText,
                      traumaVitals.respiration === "normal" &&
                        styles.binaryButtonTextActive,
                    ]}
                  >
                    {strings.respirationNormal}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: traumaVitals.respiration === "abnormal",
                  }}
                  style={[
                    styles.binaryButton,
                    traumaVitals.respiration === "abnormal" &&
                      styles.binaryButtonActiveAbnormal,
                  ]}
                  onPress={() =>
                    setTraumaVitals((prev) => ({
                      ...prev,
                      respiration: "abnormal",
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.binaryButtonText,
                      traumaVitals.respiration === "abnormal" &&
                        styles.binaryButtonTextActive,
                    ]}
                  >
                    {strings.respirationAbnormal}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Check 2: Active Severe Bleeding */}
            <View style={styles.binaryQuestionRow}>
              <Text style={styles.binaryQuestionLabel}>
                {strings.bleedingLabel}
              </Text>
              <View style={styles.binaryButtonGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: !traumaVitals.severeBleeding,
                  }}
                  style={[
                    styles.binaryButton,
                    !traumaVitals.severeBleeding &&
                      styles.binaryButtonActiveNormal,
                  ]}
                  onPress={() =>
                    setTraumaVitals((prev) => ({
                      ...prev,
                      severeBleeding: false,
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.binaryButtonText,
                      !traumaVitals.severeBleeding &&
                        styles.binaryButtonTextActive,
                    ]}
                  >
                    {strings.bleedingControlled}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: traumaVitals.severeBleeding,
                  }}
                  style={[
                    styles.binaryButton,
                    traumaVitals.severeBleeding &&
                      styles.binaryButtonActiveAbnormal,
                  ]}
                  onPress={() =>
                    setTraumaVitals((prev) => ({
                      ...prev,
                      severeBleeding: true,
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.binaryButtonText,
                      traumaVitals.severeBleeding &&
                        styles.binaryButtonTextActive,
                    ]}
                  >
                    {strings.bleedingActive}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Check 3: Responsiveness / Mental Status */}
            <View style={styles.binaryQuestionRow}>
              <Text style={styles.binaryQuestionLabel}>
                {strings.responsivenessLabel}
              </Text>
              <View style={styles.binaryButtonGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: traumaVitals.responsiveness === "alert",
                  }}
                  style={[
                    styles.binaryButton,
                    traumaVitals.responsiveness === "alert" &&
                      styles.binaryButtonActiveNormal,
                  ]}
                  onPress={() =>
                    setTraumaVitals((prev) => ({
                      ...prev,
                      responsiveness: "alert",
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.binaryButtonText,
                      traumaVitals.responsiveness === "alert" &&
                        styles.binaryButtonTextActive,
                    ]}
                  >
                    {strings.responsivenessAlert}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: traumaVitals.responsiveness === "unresponsive",
                  }}
                  style={[
                    styles.binaryButton,
                    traumaVitals.responsiveness === "unresponsive" &&
                      styles.binaryButtonActiveAbnormal,
                  ]}
                  onPress={() =>
                    setTraumaVitals((prev) => ({
                      ...prev,
                      responsiveness: "unresponsive",
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.binaryButtonText,
                      traumaVitals.responsiveness === "unresponsive" &&
                        styles.binaryButtonTextActive,
                    ]}
                  >
                    {strings.responsivenessUnresponsive}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* PERSISTENT BOTTOM ACTION DOCK */}
      <View style={styles.actionDock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${strings.confirmButtonText(
            triageResult.recommendedCareLevel
          )}. ${strings.confirmButtonSubtitle}`}
          style={({ pressed }) => [
            styles.confirmDispatchButton,
            { backgroundColor: triageResult.tierColorHex },
            pressed && styles.confirmDispatchButtonPressed,
          ]}
          onPress={handleConfirm}
        >
          <View style={styles.confirmButtonContent}>
            <Text style={styles.confirmDispatchButtonText}>
              {strings.confirmButtonText(triageResult.recommendedCareLevel)}
            </Text>
            <Text style={styles.confirmDispatchButtonSubtitle}>
              {strings.confirmButtonSubtitle}
            </Text>
          </View>
          <AppIcon icon={{ set: "ion", name: "arrow-forward" }} size={22} style={styles.confirmArrowText} />
        </Pressable>
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
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  protocolBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  protocolBadge: {
    backgroundColor: colors.slate200,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginRight: 6,
  },
  protocolBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.slate800,
  },
  speedNoticeText: {
    fontSize: 11,
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

  /* DYNAMIC TOP URGENCY TIER BANNER */
  urgencyTierBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 2,
    ...shadows.md,
  },
  tierHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  tierPillBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  tierPillText: {
    color: colors.white,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.3,
  },
  careLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  careLevelLabel: {
    fontSize: 11,
    fontWeight: typography.fontWeights.medium,
    color: colors.slate700,
  },
  careLevelValue: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  rationaleText: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
    color: colors.slate800,
    fontWeight: typography.fontWeights.medium,
    marginTop: 4,
  },
  goldenHourTicker: {
    backgroundColor: colors.emergencyDark,
    borderRadius: radii.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: spacing.sm,
    alignItems: "center",
  },
  goldenHourText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  /* SCROLL CONTENT */
  scrollView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: 140,
  },

  /* SECTION HEADER */
  sectionHeader: {
    marginBottom: spacing.md,
  },
  sectionHeading: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: -0.3,
  },
  sectionSubheading: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 2,
  },

  /* PRIMARY COMPLAINT CARDS */
  complaintsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  complaintCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    minHeight: 76,
    ...shadows.sm,
  },
  complaintCardSelected: {
    borderColor: colors.emergency,
    borderWidth: 2,
    backgroundColor: colors.slate50,
  },
  complaintCardPressed: {
    transform: [{ scale: 0.99 }],
  },
  complaintIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  complaintIconText: {
    fontSize: 22,
  },
  complaintTextGroup: {
    flex: 1,
    marginRight: spacing.sm,
  },
  complaintTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  complaintTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  complaintTitleSelected: {
    color: colors.slate900,
  },
  complaintBadge: {
    backgroundColor: colors.slate200,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  complaintBadgeSelected: {
    backgroundColor: colors.emergencyLight,
  },
  complaintBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.slate700,
  },
  complaintBadgeTextSelected: {
    color: colors.emergencyDark,
  },
  complaintSubtitle: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 16,
    color: colors.slate600,
  },
  radioCheckCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.slate400,
    justifyContent: "center",
    alignItems: "center",
  },
  radioCheckCircleSelected: {
    borderColor: colors.emergency,
    backgroundColor: colors.emergency,
  },
  radioCheckmark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },

  /* TRAUMA START DRILL-DOWN CARD */
  traumaCard: {
    backgroundColor: colors.slate50,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    marginBottom: spacing.xl,
    ...shadows.sm,
  },
  traumaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  traumaAlertBadge: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergency,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    marginRight: spacing.sm,
  },
  traumaAlertText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.emergencyDark,
    textTransform: "uppercase",
  },
  traumaTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  traumaSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginBottom: spacing.md,
  },
  binaryQuestionRow: {
    marginBottom: spacing.md,
  },
  binaryQuestionLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginBottom: spacing.xs,
  },
  binaryButtonGroup: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  binaryButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  binaryButtonActiveNormal: {
    backgroundColor: colors.slate900,
    borderColor: colors.slate900,
  },
  binaryButtonActiveAbnormal: {
    backgroundColor: colors.emergency,
    borderColor: colors.emergencyDark,
  },
  binaryButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
    textAlign: "center",
  },
  binaryButtonTextActive: {
    color: colors.white,
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
  confirmDispatchButton: {
    borderRadius: radii.xl,
    paddingVertical: 14,
    paddingHorizontal: spacing.base,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  confirmDispatchButtonPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  confirmButtonContent: {
    flex: 1,
  },
  confirmDispatchButtonText: {
    fontSize: typography.fontSizes.lg,
    lineHeight: typography.lineHeights.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    letterSpacing: -0.2,
  },
  confirmDispatchButtonSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.emergencyLight,
    fontWeight: typography.fontWeights.medium,
    marginTop: 2,
  },
  confirmArrowText: {
    fontSize: 22,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginLeft: spacing.sm,
  },
});
