import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from "react-native";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { driverAuthStrings } from "../i18n/driverAuthStrings";
import { useOtpAuth, toE164IndianPhone } from "../hooks/useOtpAuth";
import { AppIcon } from "../components";

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
  const [consentLocation, setConsentLocation] = useState(true);
  const [consentCredential, setConsentCredential] = useState(true);
  const [consentError, setConsentError] = useState<string | null>(null);

  const { isLoading, error: apiError, requestOtp, clearError } = useOtpAuth();

  const validatePhone = (number: string): boolean => /^[6-9]\d{9}$/.test(number);

  const formatPhoneDisplay = (text: string) => {
    const cleaned = text.replace(/\D/g, "").slice(0, 10);
    return cleaned.length > 5 ? `${cleaned.slice(0, 5)} ${cleaned.slice(5)}` : cleaned;
  };

  const handlePhoneChange = (text: string) => {
    clearError();
    setPhoneError(null);
    setRawPhone(text.replace(/\D/g, "").slice(0, 10));
  };

  const handleRequestOtp = async () => {
    clearError();
    setPhoneError(null);
    setConsentError(null);

    if (!validatePhone(rawPhone)) {
      setPhoneError(strings.invalidPhoneError);
      return;
    }
    if (!consentLocation || !consentCredential) {
      setConsentError(
        !consentLocation ? strings.consentLocationError : strings.consentCredentialError
      );
      return;
    }

    const fullPhone = toE164IndianPhone(rawPhone);
    const success = await requestOtp(fullPhone);
    if (success) onOtpSent(fullPhone);
  };

  const isPhoneValid = validatePhone(rawPhone);
  const isConsentGranted = consentLocation && consentCredential;

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

          {(apiError || phoneError || consentError) && (
            <View style={styles.errorAlertContainer} accessible accessibilityRole="alert">
              <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.slate700} style={styles.errorAlertIcon} />
              <Text style={styles.errorAlertText}>
                {phoneError ||
                  consentError ||
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
                maxLength={11}
                value={formatPhoneDisplay(rawPhone)}
                onChangeText={handlePhoneChange}
                autoFocus
                accessibilityLabel={strings.phoneInputLabel}
              />
            </View>
          </View>

          <View style={styles.dpdpCard}>
            <View style={styles.dpdpCardHeader}>
              <View style={styles.dpdpBadge}>
                <Text style={styles.dpdpBadgeText}>{strings.dpdpActTag}</Text>
              </View>
              <Text style={styles.dpdpCardTitle}>{strings.dpdpNoticeTitle}</Text>
            </View>
            <Text style={styles.dpdpPreambleText}>{strings.dpdpPreamble}</Text>

            <View style={styles.purposesContainer}>
              {strings.dpdpPurposes.map((p, idx) => (
                <View key={idx} style={styles.purposeItem}>
                  <Text style={styles.purposeBullet}>•</Text>
                  <View style={styles.purposeTextGroup}>
                    <Text style={styles.purposeTitle}>{p.title}: </Text>
                    <Text style={styles.purposeDescription}>{p.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.dpdpDivider} />

            <View style={styles.checkboxGroup}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consentLocation }}
                accessibilityLabel={strings.consentLocationLabel}
                style={styles.checkboxRow}
                onPress={() => {
                  setConsentError(null);
                  setConsentLocation(!consentLocation);
                }}
              >
                <View style={[styles.checkboxBox, consentLocation && styles.checkboxBoxChecked]}>
                  {consentLocation && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.checkboxCheckmark} />}
                </View>
                <Text style={styles.checkboxLabel}>{strings.consentLocationLabel}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consentCredential }}
                accessibilityLabel={strings.consentCredentialLabel}
                style={styles.checkboxRow}
                onPress={() => {
                  setConsentError(null);
                  setConsentCredential(!consentCredential);
                }}
              >
                <View style={[styles.checkboxBox, consentCredential && styles.checkboxBoxChecked]}>
                  {consentCredential && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.checkboxCheckmark} />}
                </View>
                <Text style={styles.checkboxLabel}>{strings.consentCredentialLabel}</Text>
              </Pressable>
            </View>

            <Text style={styles.dpdpRightsFootnote}>{strings.dpdpRightsNotice}</Text>
          </View>
        </ScrollView>

        <View style={styles.actionDock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.requestOtpButton}
            disabled={!isPhoneValid || !isConsentGranted || isLoading}
            style={({ pressed }) => [
              styles.primarySubmitButton,
              (!isPhoneValid || !isConsentGranted || isLoading) && styles.primarySubmitButtonDisabled,
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
  safeArea: { flex: 1, backgroundColor: colors.white, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
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
  dpdpCard: {
    backgroundColor: colors.slate50,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  dpdpCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  dpdpBadge: { backgroundColor: colors.slate200, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm, marginRight: spacing.sm },
  dpdpBadgeText: { fontSize: 10, fontWeight: typography.fontWeights.extrabold, color: colors.slate800, textTransform: "uppercase" },
  dpdpCardTitle: { flex: 1, fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  dpdpPreambleText: { fontSize: typography.fontSizes.xs, lineHeight: 18, color: colors.slate700, marginBottom: spacing.sm },
  purposesContainer: { gap: 6, marginBottom: spacing.md },
  purposeItem: { flexDirection: "row", alignItems: "flex-start" },
  purposeBullet: { fontSize: 14, color: colors.emergency, marginRight: 6, lineHeight: 18 },
  purposeTextGroup: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  purposeTitle: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.bold, color: colors.slate900, lineHeight: 18 },
  purposeDescription: { fontSize: typography.fontSizes.xs, color: colors.slate700, lineHeight: 18 },
  dpdpDivider: { height: 1, backgroundColor: colors.slate300, marginVertical: spacing.md },
  checkboxGroup: { gap: spacing.md, marginBottom: spacing.md },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", minHeight: 44 },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.slate700,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
    marginTop: 2,
  },
  checkboxBoxChecked: { backgroundColor: colors.emergency, borderColor: colors.emergencyDark },
  checkboxCheckmark: { color: colors.white, fontSize: 14, fontWeight: "800" },
  checkboxLabel: { flex: 1, fontSize: typography.fontSizes.xs, lineHeight: 18, color: colors.slate900, fontWeight: typography.fontWeights.medium },
  dpdpRightsFootnote: { fontSize: 11, lineHeight: 16, color: colors.slate600, fontStyle: "italic" },
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
