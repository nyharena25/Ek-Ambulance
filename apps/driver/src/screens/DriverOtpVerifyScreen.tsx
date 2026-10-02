import { useEffect, useRef, useState } from "react";
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
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { driverAuthStrings } from "../i18n/driverAuthStrings";
import { useOtpAuth, VerifyOtpResponse } from "../hooks/useOtpAuth";
import { AppIcon } from "../components";

export interface DriverOtpVerifyScreenProps {
  phone: string;
  onVerified: (authResponse: VerifyOtpResponse) => void;
  onChangeNumber: () => void;
  initialLanguage?: SupportedLanguage;
}

export default function DriverOtpVerifyScreen({
  phone,
  onVerified,
  onChangeNumber,
  initialLanguage = "en",
}: DriverOtpVerifyScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = driverAuthStrings[language];

  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [focusedOtpIndex, setFocusedOtpIndex] = useState<number | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const [countdown, setCountdown] = useState(30);
  const [isTimerActive, setIsTimerActive] = useState(true);

  const { isLoading, error: apiError, rateLimitCooldown, requestOtp, verifyOtp, clearError } = useOtpAuth();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerActive && countdown > 0) {
      interval = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    } else if (countdown <= 0) {
      setIsTimerActive(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerActive, countdown]);

  useEffect(() => {
    if (rateLimitCooldown && rateLimitCooldown > 0) {
      setCountdown(rateLimitCooldown);
      setIsTimerActive(true);
    }
  }, [rateLimitCooldown]);

  const formatPhoneDisplay = (fullPhone: string) => {
    const digits = fullPhone.replace(/^\+91/, "");
    return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
  };

  const handleOtpChange = (text: string, index: number) => {
    clearError();
    const cleanDigits = text.replace(/\D/g, "");

    if (cleanDigits.length >= 6) {
      setOtpDigits(cleanDigits.slice(0, 6).split(""));
      inputRefs.current[5]?.focus();
      return;
    }

    const singleDigit = cleanDigits.slice(-1);
    const updated = [...otpDigits];
    updated[index] = singleDigit;
    setOtpDigits(updated);

    if (singleDigit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === "Backspace") {
      if (!otpDigits[index] && index > 0) {
        const updated = [...otpDigits];
        updated[index - 1] = "";
        setOtpDigits(updated);
        inputRefs.current[index - 1]?.focus();
      } else {
        const updated = [...otpDigits];
        updated[index] = "";
        setOtpDigits(updated);
      }
    }
  };

  const handleVerifyOtp = async () => {
    clearError();
    const fullCode = otpDigits.join("");
    if (fullCode.length !== 6) return;

    const response = await verifyOtp(phone, fullCode);
    if (response) onVerified(response);
  };

  const handleResendOtp = async () => {
    if (isTimerActive || isLoading) return;
    clearError();
    const success = await requestOtp(phone);
    if (success) {
      setCountdown(30);
      setIsTimerActive(true);
      setOtpDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  };

  const isOtpComplete = otpDigits.join("").length === 6;

  const errorText = apiError
    ? apiError.error === "unauthorized_role"
      ? strings.unauthorizedRoleError
      : apiError.error === "invalid_otp"
      ? strings.invalidOtpError
      : apiError.isRateLimited
      ? strings.rateLimitError
      : apiError.error === "network_error"
      ? strings.networkError
      : apiError.error_description || strings.genericError
    : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.backButton}
            style={styles.backButton}
            onPress={onChangeNumber}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={20} style={styles.backArrow} />
          </Pressable>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>{strings.headerTitle}</Text>
            <Text style={styles.headerTagline}>{strings.headerTagline}</Text>
          </View>
        </View>

        <View style={styles.languageToggleContainer} accessible accessibilityRole="radiogroup">
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === "en" }}
            style={[styles.langButton, language === "en" && styles.langButtonActive]}
            onPress={() => setLanguage("en")}
          >
            <Text style={[styles.langButtonText, language === "en" && styles.langButtonTextActive]}>EN</Text>
          </Pressable>
          <View style={styles.langDivider} />
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === "hi" }}
            style={[styles.langButton, language === "hi" && styles.langButtonActive]}
            onPress={() => setLanguage("hi")}
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
            <Text style={styles.screenHeading} accessibilityRole="header">{strings.otpStepTitle}</Text>
            <Text style={styles.screenSubtitle}>
              {strings.otpStepSubtitle}{" "}
              <Text style={styles.phoneHighlight}>+91 {formatPhoneDisplay(phone)}</Text>
            </Text>
          </View>

          {errorText && (
            <View style={styles.errorAlertContainer} accessible accessibilityRole="alert">
              <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.slate700} style={styles.errorAlertIcon} />
              <Text style={styles.errorAlertText}>{errorText}</Text>
            </View>
          )}

          <View style={styles.otpSection}>
            <View style={styles.otpHeaderRow}>
              <Text style={styles.fieldLabel}>{strings.otpInputLabel}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.changePhoneButton}
                onPress={onChangeNumber}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.changePhoneText}>{strings.changePhoneButton}</Text>
              </Pressable>
            </View>

            <View style={styles.otpInputRow} accessible accessibilityRole="none">
              {otpDigits.map((digit, index) => {
                const isFocused = focusedOtpIndex === index;
                const isFilled = digit.length > 0;
                return (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    style={[
                      styles.otpCell,
                      isFilled && styles.otpCellFilled,
                      isFocused && styles.otpCellFocused,
                      apiError ? styles.otpCellError : null,
                    ]}
                    value={digit}
                    onChangeText={(text) => handleOtpChange(text, index)}
                    onKeyPress={(e) => handleOtpKeyPress(e, index)}
                    onFocus={() => setFocusedOtpIndex(index)}
                    onBlur={() => setFocusedOtpIndex(null)}
                    keyboardType="number-pad"
                    maxLength={6}
                    selectTextOnFocus
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    accessible
                    accessibilityLabel={`Digit ${index + 1} of 6`}
                  />
                );
              })}
            </View>

            <View style={styles.resendRow}>
              {isTimerActive ? (
                <View style={styles.timerBadge}>
                  <Text style={styles.timerText}>{strings.resendCountdown(countdown)}</Text>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.resendButton}
                  disabled={isLoading}
                  onPress={handleResendOtp}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.resendActiveButtonText}>
                    {isLoading ? strings.resendingOtp : strings.resendButton}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.actionDock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.verifyButton}
            disabled={!isOtpComplete || isLoading}
            style={({ pressed }) => [
              styles.primarySubmitButton,
              (!isOtpComplete || isLoading) && styles.primarySubmitButtonDisabled,
              pressed && styles.primarySubmitButtonPressed,
            ]}
            onPress={handleVerifyOtp}
          >
            <Text style={styles.primarySubmitButtonText}>
              {isLoading ? strings.verifyingOtp : strings.verifyButton}
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
  screenHeading: {
    fontSize: typography.fontSizes["2xl"],
    lineHeight: typography.lineHeights["2xl"],
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  screenSubtitle: { fontSize: typography.fontSizes.base, lineHeight: typography.lineHeights.base, color: colors.slate700 },
  phoneHighlight: { fontWeight: typography.fontWeights.bold, color: colors.slate900 },
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
  otpSection: { marginBottom: spacing.xl },
  fieldLabel: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  otpHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  changePhoneText: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.emergencyDark },
  otpInputRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: spacing.md },
  otpCell: {
    flex: 1,
    height: 58,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    backgroundColor: colors.slate50,
    textAlign: "center",
    fontSize: 22,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    ...shadows.sm,
  },
  otpCellFilled: { backgroundColor: colors.white, borderColor: colors.slate700 },
  otpCellFocused: { borderColor: colors.emergency, borderWidth: 2, backgroundColor: colors.white },
  otpCellError: { borderColor: colors.emergencyDark },
  resendRow: { alignItems: "center", marginTop: spacing.xs },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.full,
  },
  timerText: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.semibold, color: colors.slate700 },
  resendActiveButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
    textDecorationLine: "underline",
  },
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
