import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { driverAuthStrings } from "../i18n/driverAuthStrings";
import { useOtpAuth } from "../hooks/useOtpAuth";
import { normalizeIndianMobileInput, toE164IndianPhone } from "../hooks/otpAuth.core";
import { AppIcon } from "../components";
import { DpdpNoticeCard } from "../components/DpdpNoticeCard";

export interface DriverPhoneEntryScreenProps {
  onOtpSent: (phone: string) => void;
  onBack?: () => void;
  initialLanguage?: SupportedLanguage;
}

export default function DriverPhoneEntryScreen({
  onOtpSent,
  onBack,
  initialLanguage = "en",
}: DriverPhoneEntryScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = driverAuthStrings[language];

  const [rawPhone, setRawPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const { isLoading, error: apiError, requestOtp, clearError } = useOtpAuth();

  const validatePhone = (number: string): boolean => /^[6-9]\d{9}$/.test(number);

  const formatPhoneDisplay = (text: string) => {
    const cleaned = text.replace(/\D/g, "").slice(0, 10);
    return cleaned.length > 5 ? `${cleaned.slice(0, 5)} ${cleaned.slice(5)}` : cleaned;
  };

  const handlePhoneChange = (text: string) => {
    clearError();
    setPhoneError(null);
    setRawPhone(normalizeIndianMobileInput(text));
  };

  const handleRequestOtp = async () => {
    clearError();
    setPhoneError(null);

    if (!validatePhone(rawPhone)) {
      setPhoneError(strings.invalidPhoneError);
      return;
    }

    const fullPhone = toE164IndianPhone(rawPhone);
    const success = await requestOtp(fullPhone);
    if (success) onOtpSent(fullPhone);
  };

  const isPhoneValid = validatePhone(rawPhone);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.backButton}
              style={styles.backButton}
              onPress={onBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={20} style={styles.backArrow} />
            </Pressable>
          )}
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>{strings.headerTitle}</Text>
            <Text style={styles.headerTagline}>{strings.headerTagline}</Text>
          </View>
        </View>

        <View style={styles.languageToggleContainer} accessible accessibilityRole="radiogroup">
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === "en" }}
            accessibilityLabel="Switch to English"
            style={[styles.langButton, language === "en" && styles.langButtonActive]}
            onPress={() => setLanguage("en")}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 3 }}
          >
            <Text style={[styles.langButtonText, language === "en" && styles.langButtonTextActive]}>EN</Text>
          </Pressable>
          <View style={styles.langDivider} />
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === "hi" }}
            accessibilityLabel="हिन्दी में बदलें"
            style={[styles.langButton, language === "hi" && styles.langButtonActive]}
            onPress={() => setLanguage("hi")}
            hitSlop={{ top: 6, bottom: 6, left: 3, right: 6 }}
          >
            <Text style={[styles.langButtonText, language === "hi" && styles.langButtonTextActive]}>हिन्दी</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepHeader}>
            <View style={styles.securityShieldBadge}>
              <AppIcon icon={{ set: "ion", name: "shield-checkmark" }} size={12} color={colors.slate700} style={styles.shieldIcon} />
              <Text style={styles.shieldText}>{strings.secureAuthBadge}</Text>
            </View>
            <Text style={styles.screenHeading} accessibilityRole="header">{strings.phoneStepTitle}</Text>
            <Text style={styles.screenSubtitle}>{strings.phoneStepSubtitle}</Text>
          </View>

          {(apiError || phoneError) && (
            <View style={styles.errorAlertContainer} accessible accessibilityRole="alert">
              <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.slate700} style={styles.errorAlertIcon} />
              <Text style={styles.errorAlertText}>
                {phoneError ||
                  (apiError?.isRateLimited
                    ? strings.rateLimitError
                    : apiError?.error === "network_error"
                    ? strings.networkError
                    : apiError?.error_description || strings.genericError)}
              </Text>
            </View>
          )}

          <View style={styles.inputSection}>
            <Text style={styles.fieldLabel}>{strings.phoneInputLabel}</Text>
            <View style={styles.phoneInputRow}>
              <View style={styles.countryCodeBadge} accessible accessibilityLabel="India country code +91">
                <Text style={styles.flagIcon}>🇮🇳</Text>
                <Text style={styles.countryCodeText}>+91</Text>
              </View>
              <TextInput
                style={[styles.phoneTextInput, phoneError ? styles.inputBorderError : null]}
                placeholder={strings.phoneInputPlaceholder}
                placeholderTextColor={colors.slate400}
                keyboardType="number-pad"
                maxLength={16}
                value={formatPhoneDisplay(rawPhone)}
                onChangeText={handlePhoneChange}
                autoFocus
                accessibilityLabel={strings.phoneInputLabel}
              />
            </View>
          </View>

          <DpdpNoticeCard strings={strings} />
          <Text style={styles.consentAfterSignInNote}>{strings.consentAfterSignInNote}</Text>
        </ScrollView>

        <View style={styles.actionDock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.requestOtpButton}
            disabled={!isPhoneValid || isLoading}
            style={({ pressed }) => [
              styles.primarySubmitButton,
              (!isPhoneValid || isLoading) && styles.primarySubmitButtonDisabled,
              pressed && styles.primarySubmitButtonPressed,
            ]}
            onPress={handleRequestOtp}
          >
            <Text style={styles.primarySubmitButtonText}>
              {isLoading ? strings.requestingOtp : strings.requestOtpButton}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  flexOne: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  backArrow: { fontSize: 20, fontWeight: "700", color: colors.slate900 },
  headerTitleGroup: { flex: 1 },
  headerTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerTagline: { fontSize: typography.fontSizes.xs, color: colors.slate600, fontWeight: typography.fontWeights.medium },
  languageToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderRadius: radii.full,
    padding: 2,
    borderWidth: 1.5,
    borderColor: colors.slate300,
  },
  langButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.full, minHeight: 34, minWidth: 42, justifyContent: "center", alignItems: "center" },
  langButtonActive: { backgroundColor: colors.slate900 },
  langButtonText: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.bold, color: colors.slate700 },
  langButtonTextActive: { color: colors.white },
  langDivider: { width: 1, height: 16, backgroundColor: colors.slate300 },
  scrollView: { flex: 1, backgroundColor: colors.white },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing["2xl"] },
  stepHeader: { marginBottom: spacing.xl },
  securityShieldBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.slate300,
    marginBottom: spacing.md,
  },
  shieldIcon: { fontSize: 12, marginRight: 5 },
  shieldText: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.bold, color: colors.slate800 },
  screenHeading: {
    fontSize: typography.fontSizes["2xl"],
    lineHeight: typography.lineHeights["2xl"],
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  screenSubtitle: { fontSize: typography.fontSizes.base, lineHeight: typography.lineHeights.base, color: colors.slate700 },
  errorAlertContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergencyLight,
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorAlertIcon: { fontSize: 18, marginRight: spacing.sm },
  errorAlertText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.lineHeights.sm,
    color: colors.emergencyDark,
    fontWeight: typography.fontWeights.semibold,
  },
  inputSection: { marginBottom: spacing.xl },
  fieldLabel: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate900, marginBottom: spacing.sm },
  phoneInputRow: { flexDirection: "row", alignItems: "center" },
  countryCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    height: 56,
    marginRight: spacing.sm,
  },
  flagIcon: { fontSize: 18, marginRight: 6 },
  countryCodeText: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  phoneTextInput: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.base,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    backgroundColor: colors.slate50,
    letterSpacing: 1,
  },
  inputBorderError: { borderColor: colors.emergencyDark },
  consentAfterSignInNote: { fontSize: 11, lineHeight: 16, color: colors.slate600, marginTop: spacing.sm },
  actionDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.base,
    backgroundColor: colors.white,
    borderTopWidth: 1.5,
    borderTopColor: colors.slate200,
    ...shadows.md,
  },
  primarySubmitButton: {
    backgroundColor: colors.emergency,
    borderRadius: radii.xl,
    paddingVertical: 16,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  primarySubmitButtonDisabled: { backgroundColor: colors.slate300, borderColor: colors.slate400, shadowOpacity: 0, elevation: 0 },
  primarySubmitButtonPressed: { backgroundColor: colors.emergencyDeep, transform: [{ scale: 0.99 }] },
  primarySubmitButtonText: {
    fontSize: typography.fontSizes.lg,
    lineHeight: typography.lineHeights.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    letterSpacing: -0.2,
  },
});
