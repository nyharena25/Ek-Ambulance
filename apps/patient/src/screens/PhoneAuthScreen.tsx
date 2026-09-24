import { useState, useEffect, useRef } from "react";
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
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { authStrings } from "../i18n/authStrings";
import { useOtpAuth, VerifyOtpResponse } from "../hooks/useOtpAuth";

import { AppIcon } from "../components";
export interface PhoneAuthScreenProps {
  onSuccess?: (authResponse: VerifyOtpResponse) => void;
  onBack?: () => void;
  initialLanguage?: SupportedLanguage;
}

export default function PhoneAuthScreen({
  onSuccess,
  onBack,
  initialLanguage = "en",
}: PhoneAuthScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = authStrings[language];

  // Auth flow step: "phone" -> "otp"
  const [step, setStep] = useState<"phone" | "otp">("phone");

  // Step 1: Indian Phone Number State
  const [rawPhone, setRawPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Step 2: 6-Digit OTP State
  const [otpDigits, setOtpDigits] = useState<string[]>([
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const [focusedOtpIndex, setFocusedOtpIndex] = useState<number | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  // Resend Countdown Timer State
  const [countdown, setCountdown] = useState(30);
  const [isTimerActive, setIsTimerActive] = useState(false);

  // DPDP Act 2023 Statutory Consent Checkboxes
  // Consent must be an affirmative act (DPDP): the boxes start unticked.
  const [consentGeolocation, setConsentGeolocation] = useState(false);
  const [consentMedical, setConsentMedical] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  // Backend Supabase GoTrue Hook
  const {
    isLoading,
    error: apiError,
    rateLimitCooldown,
    requestOtp,
    verifyOtp,
    clearError,
  } = useOtpAuth();

  // Handle Resend Countdown Interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerActive && countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown <= 0) {
      setIsTimerActive(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerActive, countdown]);

  // Sync API rate limit cooldown if provided by gateway
  useEffect(() => {
    if (rateLimitCooldown && rateLimitCooldown > 0) {
      setCountdown(rateLimitCooldown);
      setIsTimerActive(true);
    }
  }, [rateLimitCooldown]);

  // Format phone number into +91 E.164 string
  const getFullE164Phone = (tenDigitPhone: string) => `+91${tenDigitPhone}`;

  // Validate 10-digit Indian Mobile number (starts with 6, 7, 8, or 9)
  const validateIndianPhone = (number: string): boolean => {
    const clean = number.replace(/\D/g, "");
    return /^[6-9]\d{9}$/.test(clean);
  };

  // Format 10-digit phone for display: "98765 43210"
  const formatPhoneDisplay = (text: string) => {
    const cleaned = text.replace(/\D/g, "").slice(0, 10);
    if (cleaned.length > 5) {
      return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
    }
    return cleaned;
  };

  const handlePhoneChange = (text: string) => {
    clearError();
    setPhoneError(null);
    const cleaned = text.replace(/\D/g, "").slice(0, 10);
    setRawPhone(cleaned);
  };

  // Trigger Step 1 -> Request OTP
  const handleRequestOtp = async () => {
    clearError();
    setPhoneError(null);
    setConsentError(null);

    if (!validateIndianPhone(rawPhone)) {
      setPhoneError(strings.invalidPhoneError);
      return;
    }

    if (!consentGeolocation || !consentMedical) {
      setConsentError(
        !consentGeolocation
          ? strings.consentGeolocationError
          : strings.consentMedicalError
      );
      return;
    }

    const fullPhone = getFullE164Phone(rawPhone);
    const success = await requestOtp(fullPhone);

    if (success) {
      setStep("otp");
      setCountdown(30);
      setIsTimerActive(true);
      // Auto-focus first OTP input cell on next frame
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  };

  // Resend OTP Action
  const handleResendOtp = async () => {
    if (isTimerActive || isLoading) return;
    clearError();
    const fullPhone = getFullE164Phone(rawPhone);
    const success = await requestOtp(fullPhone);
    if (success) {
      setCountdown(30);
      setIsTimerActive(true);
      setOtpDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  };

  // Handle OTP Digit Input & Auto-Advance
  const handleOtpChange = (text: string, index: number) => {
    clearError();
    const cleanDigits = text.replace(/\D/g, "");

    // Handle full paste of 6 digits
    if (cleanDigits.length >= 6) {
      const pasted = cleanDigits.slice(0, 6).split("");
      setOtpDigits(pasted);
      inputRefs.current[5]?.focus();
      return;
    }

    // Single digit input
    const singleDigit = cleanDigits.slice(-1);
    const updated = [...otpDigits];
    updated[index] = singleDigit;
    setOtpDigits(updated);

    // Auto-advance to next input cell
    if (singleDigit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle Backspace Key Press for Auto-Retreat
  const handleOtpKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === "Backspace") {
      if (!otpDigits[index] && index > 0) {
        // Current cell is empty, clear previous cell and retreat focus
        const updated = [...otpDigits];
        updated[index - 1] = "";
        setOtpDigits(updated);
        inputRefs.current[index - 1]?.focus();
      } else {
        // Clear current cell
        const updated = [...otpDigits];
        updated[index] = "";
        setOtpDigits(updated);
      }
    }
  };

  // Trigger Step 2 -> Verify OTP
  const handleVerifyOtp = async () => {
    clearError();
    setConsentError(null);

    const fullCode = otpDigits.join("");
    if (fullCode.length !== 6) {
      return;
    }

    if (!consentGeolocation || !consentMedical) {
      setConsentError(
        !consentGeolocation
          ? strings.consentGeolocationError
          : strings.consentMedicalError
      );
      return;
    }

    const fullPhone = getFullE164Phone(rawPhone);
    const response = await verifyOtp(fullPhone, fullCode);

    if (response) {
      if (onSuccess) {
        onSuccess(response);
      }
    }
  };

  // Change phone number (return to step 1)
  const handleChangePhone = () => {
    clearError();
    setStep("phone");
    setOtpDigits(["", "", "", "", "", ""]);
  };

  const isPhoneValid = validateIndianPhone(rawPhone);
  const isOtpComplete = otpDigits.join("").length === 6;
  const isConsentGranted = consentGeolocation && consentMedical;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP HEADER: Navigation, Security Brand & Persistent Bilingual Toggle */}
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

        {/* Persistent Bilingual Language Toggle */}
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
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 3 }}
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
            hitSlop={{ top: 6, bottom: 6, left: 3, right: 6 }}
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

      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* STEP INDICATOR HEADER */}
          <View style={styles.stepHeader}>
            <View style={styles.securityShieldBadge}>
              <AppIcon icon={{ set: "ion", name: "shield-checkmark" }} size={12} color={colors.slate700} style={styles.shieldIcon} />
              <Text style={styles.shieldText}>{strings.secureAuthBadge}</Text>
            </View>

            <Text
              style={[
                styles.screenHeading,
                language === "hi" && styles.hindiHeading,
              ]}
              accessibilityRole="header"
            >
              {step === "phone" ? strings.phoneStepTitle : strings.otpStepTitle}
            </Text>

            <Text
              style={[
                styles.screenSubtitle,
                language === "hi" && styles.hindiBody,
              ]}
            >
              {step === "phone" ? (
                strings.phoneStepSubtitle
              ) : (
                <>
                  {strings.otpStepSubtitle}{" "}
                  <Text style={styles.phoneHighlight}>
                    +91 {formatPhoneDisplay(rawPhone)}
                  </Text>
                </>
              )}
            </Text>
          </View>

          {/* ERROR ALERT BANNER */}
          {(apiError || phoneError || consentError) && (
            <View
              style={styles.errorAlertContainer}
              accessible={true}
              accessibilityRole="alert"
            >
              <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.slate700} style={styles.errorAlertIcon} />
              <Text style={styles.errorAlertText}>
                {phoneError ||
                  consentError ||
                  (apiError?.isRateLimited
                    ? strings.rateLimitError
                    : apiError?.error === "network_error"
                    ? strings.networkError
                    : apiError?.error === "invalid_otp"
                    ? strings.invalidOtpError
                    : apiError?.error_description || strings.genericError)}
              </Text>
            </View>
          )}

          {/* ================= STEP 1: INDIAN PHONE INPUT ================= */}
          {step === "phone" && (
            <View style={styles.inputSection}>
              <Text style={styles.fieldLabel}>{strings.phoneInputLabel}</Text>

              <View style={styles.phoneInputRow}>
                {/* Fixed +91 Country Code Badge with Indian Flag */}
                <View
                  style={styles.countryCodeBadge}
                  accessible={true}
                  accessibilityLabel="India country code +91"
                >
                  <Text style={styles.flagIcon}>🇮🇳</Text>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>

                {/* 10-digit Mobile Number Field */}
                <TextInput
                  style={[
                    styles.phoneTextInput,
                    phoneError ? styles.inputBorderError : null,
                  ]}
                  placeholder={strings.phoneInputPlaceholder}
                  placeholderTextColor={colors.slate400}
                  keyboardType="number-pad"
                  maxLength={11} // allows space
                  value={formatPhoneDisplay(rawPhone)}
                  onChangeText={handlePhoneChange}
                  autoFocus={true}
                  accessibilityLabel={strings.phoneInputLabel}
                  accessibilityHint="Enter your 10 digit Indian phone number"
                />
              </View>

              <Text style={styles.phoneHelperText}>
                Supported operators: Airtel, Jio, Vi, BSNL
              </Text>
            </View>
          )}

          {/* ================= STEP 2: AUTO-ADVANCING 6-DIGIT OTP ================= */}
          {step === "otp" && (
            <View style={styles.otpSection}>
              <View style={styles.otpHeaderRow}>
                <Text style={styles.fieldLabel}>{strings.otpInputLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.changePhoneButton}
                  onPress={handleChangePhone}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.changePhoneText}>
                    {strings.changePhoneButton}
                  </Text>
                </Pressable>
              </View>

              {/* 6 Individual Auto-Advancing Cells */}
              <View
                style={styles.otpInputRow}
                accessible={true}
                accessibilityRole="none"
              >
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
                      maxLength={6} // allows paste detection
                      selectTextOnFocus={true}
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      accessible={true}
                      accessibilityLabel={`Digit ${index + 1} of 6`}
                    />
                  );
                })}
              </View>

              {/* Resend Countdown Timer Row */}
              <View style={styles.resendRow}>
                {isTimerActive ? (
                  <View style={styles.timerBadge}>
                    <Text style={styles.timerIcon}>⏱️</Text>
                    <Text style={styles.timerText}>
                      {strings.resendCountdown(countdown)}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.resendButton}
                    accessibilityHint="Resends 6-digit OTP code to your phone"
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
          )}

          {/* ================= DPDP ACT 2023 STATUTORY CONSENT DISCLOSURE ================= */}
          <View style={styles.dpdpCard}>
            {/* Header / Law Citation */}
            <View style={styles.dpdpCardHeader}>
              <View style={styles.dpdpBadge}>
                <Text style={styles.dpdpBadgeText}>{strings.dpdpActTag}</Text>
              </View>
              <Text style={styles.dpdpCardTitle}>{strings.dpdpNoticeTitle}</Text>
            </View>

            <Text
              style={[
                styles.dpdpPreambleText,
                language === "hi" && styles.hindiBody,
              ]}
            >
              {strings.dpdpPreamble}
            </Text>

            {/* Explicit Statutory Purposes */}
            <View style={styles.purposesContainer}>
              {strings.dpdpPurposes.map((p, idx) => (
                <View key={idx} style={styles.purposeItem}>
                  <Text style={styles.purposeBullet}>•</Text>
                  <View style={styles.purposeTextGroup}>
                    <Text style={styles.purposeTitle}>{p.title}: </Text>
                    <Text
                      style={[
                        styles.purposeDescription,
                        language === "hi" && styles.hindiBody,
                      ]}
                    >
                      {p.description}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.dpdpDivider} />

            {/* Mandatory Interactive Consent Checkboxes */}
            <View style={styles.checkboxGroup}>
              {/* Checkbox 1: Geolocation Access */}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consentGeolocation }}
                accessibilityLabel={strings.consentGeolocationLabel}
                style={styles.checkboxRow}
                onPress={() => {
                  setConsentError(null);
                  setConsentGeolocation(!consentGeolocation);
                }}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    consentGeolocation && styles.checkboxBoxChecked,
                  ]}
                >
                  {consentGeolocation && (
                    <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.checkboxCheckmark} />
                  )}
                </View>
                <Text
                  style={[
                    styles.checkboxLabel,
                    language === "hi" && styles.hindiBody,
                  ]}
                >
                  {strings.consentGeolocationLabel}
                </Text>
              </Pressable>

              {/* Checkbox 2: Medical Symptom Processing */}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consentMedical }}
                accessibilityLabel={strings.consentMedicalLabel}
                style={styles.checkboxRow}
                onPress={() => {
                  setConsentError(null);
                  setConsentMedical(!consentMedical);
                }}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    consentMedical && styles.checkboxBoxChecked,
                  ]}
                >
                  {consentMedical && (
                    <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.checkboxCheckmark} />
                  )}
                </View>
                <Text
                  style={[
                    styles.checkboxLabel,
                    language === "hi" && styles.hindiBody,
                  ]}
                >
                  {strings.consentMedicalLabel}
                </Text>
              </Pressable>
            </View>

            {/* Section 6 Rights Footnote */}
            <Text
              style={[
                styles.dpdpRightsFootnote,
                language === "hi" && styles.hindiCaption,
              ]}
            >
              {strings.dpdpRightsNotice}
            </Text>
          </View>
        </ScrollView>

        {/* BOTTOM FIXED ACTION DOCK */}
        <View style={styles.actionDock}>
          {step === "phone" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.requestOtpButton}
              accessibilityHint="Sends an SMS with a 6-digit OTP code to your phone"
              disabled={!isPhoneValid || !isConsentGranted || isLoading}
              style={({ pressed }) => [
                styles.primarySubmitButton,
                (!isPhoneValid || !isConsentGranted || isLoading) &&
                  styles.primarySubmitButtonDisabled,
                pressed && styles.primarySubmitButtonPressed,
              ]}
              onPress={handleRequestOtp}
            >
              <Text style={styles.primarySubmitButtonText}>
                {isLoading ? strings.requestingOtp : strings.requestOtpButton}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.verifyButton}
              accessibilityHint="Verifies the 6-digit OTP code and completes authentication"
              disabled={!isOtpComplete || !isConsentGranted || isLoading}
              style={({ pressed }) => [
                styles.primarySubmitButton,
                (!isOtpComplete || !isConsentGranted || isLoading) &&
                  styles.primarySubmitButtonDisabled,
                pressed && styles.primarySubmitButtonPressed,
              ]}
              onPress={handleVerifyOtp}
            >
              <Text style={styles.primarySubmitButtonText}>
                {isLoading ? strings.verifyingOtp : strings.verifyButton}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flexOne: {
    flex: 1,
  },

  /* HEADER & PERSISTENT BILINGUAL TOGGLE */
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
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerTagline: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
  },

  /* LANGUAGE TOGGLE */
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
    paddingVertical: 6,
    borderRadius: radii.full,
    minHeight: 34,
    minWidth: 42,
    justifyContent: "center",
    alignItems: "center",
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
    height: 16,
    backgroundColor: colors.slate300,
  },

  /* SCROLL CONTENT */
  scrollView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing["2xl"],
  },

  /* STEP HEADER */
  stepHeader: {
    marginBottom: spacing.xl,
  },
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
  shieldIcon: {
    fontSize: 12,
    marginRight: 5,
  },
  shieldText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  screenHeading: {
    fontSize: typography.fontSizes["2xl"],
    lineHeight: typography.lineHeights["2xl"],
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  screenSubtitle: {
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    color: colors.slate700,
  },
  phoneHighlight: {
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  hindiHeading: {
    lineHeight: 30,
  },
  hindiBody: {
    lineHeight: 22,
  },
  hindiCaption: {
    lineHeight: 18,
  },

  /* ERROR BANNER */
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
  errorAlertIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  errorAlertText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.lineHeights.sm,
    color: colors.emergencyDark,
    fontWeight: typography.fontWeights.semibold,
  },

  /* STEP 1: PHONE INPUT */
  inputSection: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginBottom: spacing.sm,
  },
  phoneInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
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
  flagIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  countryCodeText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
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
  inputBorderError: {
    borderColor: colors.emergencyDark,
  },
  phoneHelperText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: spacing.xs,
  },

  /* STEP 2: AUTO-ADVANCING 6-DIGIT OTP */
  otpSection: {
    marginBottom: spacing.xl,
  },
  otpHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  changePhoneText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },
  otpInputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: spacing.md,
  },
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
  otpCellFilled: {
    backgroundColor: colors.white,
    borderColor: colors.slate700,
  },
  otpCellFocused: {
    borderColor: colors.emergency,
    borderWidth: 2,
    backgroundColor: colors.white,
  },
  otpCellError: {
    borderColor: colors.emergencyDark,
  },
  resendRow: {
    alignItems: "center",
    marginTop: spacing.xs,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.full,
  },
  timerIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  timerText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
  },
  resendActiveButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
    textDecorationLine: "underline",
  },

  /* DPDP ACT 2023 STATUTORY CONSENT CARD */
  dpdpCard: {
    backgroundColor: colors.slate50,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  dpdpCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  dpdpBadge: {
    backgroundColor: colors.slate200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    marginRight: spacing.sm,
  },
  dpdpBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate800,
    textTransform: "uppercase",
  },
  dpdpCardTitle: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  dpdpPreambleText: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
    color: colors.slate700,
    marginBottom: spacing.sm,
  },
  purposesContainer: {
    gap: 6,
    marginBottom: spacing.md,
  },
  purposeItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  purposeBullet: {
    fontSize: 14,
    color: colors.emergency,
    marginRight: 6,
    lineHeight: 18,
  },
  purposeTextGroup: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  purposeTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: 18,
  },
  purposeDescription: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    lineHeight: 18,
  },
  dpdpDivider: {
    height: 1,
    backgroundColor: colors.slate300,
    marginVertical: spacing.md,
  },
  checkboxGroup: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 44, // accessible tap target
  },
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
  checkboxBoxChecked: {
    backgroundColor: colors.emergency,
    borderColor: colors.emergencyDark,
  },
  checkboxCheckmark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800",
  },
  checkboxLabel: {
    flex: 1,
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
    color: colors.slate900,
    fontWeight: typography.fontWeights.medium,
  },
  dpdpRightsFootnote: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.slate600,
    fontStyle: "italic",
  },

  /* FIXED ACTION DOCK */
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
  primarySubmitButtonDisabled: {
    backgroundColor: colors.slate300,
    borderColor: colors.slate400,
    shadowOpacity: 0,
    elevation: 0,
  },
  primarySubmitButtonPressed: {
    backgroundColor: colors.emergencyDeep,
    transform: [{ scale: 0.99 }],
  },
  primarySubmitButtonText: {
    fontSize: typography.fontSizes.lg,
    lineHeight: typography.lineHeights.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    letterSpacing: -0.2,
  },
});
