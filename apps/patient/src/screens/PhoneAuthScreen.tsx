import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  type TextInputInstance,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  BackHandler,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { authStrings, type AuthTranslation } from "../i18n/authStrings";
import { useOtpAuth, VerifyOtpResponse } from "../hooks/useOtpAuth";
import {
  authMessageKey,
  normalizeIndianMobileInput,
  phoneInputIssue,
  toE164IndianPhone,
  type AuthMessageKey,
} from "../hooks/otpAuth.core";

import { AppIcon } from "../components";
export interface PhoneAuthScreenProps {
  onSuccess?: (authResponse: VerifyOtpResponse) => void;
  onBack?: () => void;
  initialLanguage?: SupportedLanguage;
  /** Both use Supabase phone OTP. Sign In never creates an account (shouldCreateUser: false); Create Account may. */
  mode?: "signin" | "signup";
  /** Raw 10-digit number to start with (carried over from a switch between Sign In and Create Account). */
  initialPhone?: string;
  /** Switch to Create Account, keeping the number (and language). */
  onCreateAccount?: (rawPhone: string, language: SupportedLanguage) => void;
  /** Switch to Sign In, keeping the number (and language). */
  onSignIn?: (rawPhone: string, language: SupportedLanguage) => void;
}

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

const messageFor = (key: AuthMessageKey, s: AuthTranslation): string =>
  ({
    rateLimit: s.rateLimitError,
    network: s.networkError,
    invalidOtp: s.invalidOtpError,
    accountNotFound: s.accountNotFoundError,
    signupUnavailable: s.signupUnavailableError,
    smsSendFailed: s.smsSendFailedError,
    invalidPhone: s.invalidPhoneError,
    generic: s.genericError,
  })[key];

const formatPhoneDisplay = (raw: string) => (raw.length > 5 ? `${raw.slice(0, 5)} ${raw.slice(5)}` : raw);

export default function PhoneAuthScreen({
  onSuccess,
  onBack,
  initialLanguage = "en",
  mode = "signin",
  initialPhone = "",
  onCreateAccount,
  onSignIn,
}: PhoneAuthScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = authStrings[language];

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [rawPhone, setRawPhone] = useState(() => normalizeIndianMobileInput(initialPhone));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpFocused, setOtpFocused] = useState(false);
  const otpRef = useRef<TextInputInstance | null>(null);
  // Fields stay editable while a request runs (toggling `editable` blurs the input and drops the Android keyboard);
  // this ref keeps a second submit out instead, so a skipped duplicate is never mistaken for a rejected code.
  const submitting = useRef(false);
  // Success is terminal here: the route navigates away; nothing may be re-submitted in the meantime.
  const [verified, setVerified] = useState(false);

  // Resend / rate-limit countdown.
  const [countdown, setCountdown] = useState(0);

  // DPDP Act 2023 consent: an affirmative act, so the boxes start unticked and are required.
  const [consentGeolocation, setConsentGeolocation] = useState(false);
  const [consentMedical, setConsentMedical] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const { isLoading, error: apiError, requestOtp, verifyOtp, clearError } = useOtpAuth();

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // The server's own cooldown wins over the local one (re-armed on every rate-limit answer).
  useEffect(() => {
    if (apiError?.isRateLimited) setCountdown(apiError.cooldownSeconds ?? RESEND_SECONDS);
  }, [apiError]);

  const backToPhone = () => {
    if (isLoading || verified) return;
    clearError();
    setOtp("");
    setStep("phone");
  };

  // Android back on the code step returns to the number, it does not leave sign-in.
  useEffect(() => {
    // Android-only API: on web it logs an error on every render.
    if (step !== "otp" || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backToPhone();
      return true;
    });
    return () => sub.remove();
  });

  const handlePhoneChange = (text: string) => {
    clearError();
    const next = normalizeIndianMobileInput(text);
    setRawPhone(next);
    // Say so as soon as the number cannot be a mobile; "incomplete" waits for a submit.
    setPhoneError(phoneInputIssue(next) === "invalid_start" ? strings.invalidStartError : null);
  };

  const consentMissing = () => {
    if (consentGeolocation && consentMedical) return false;
    setConsentError(!consentGeolocation ? strings.consentGeolocationError : strings.consentMedicalError);
    return true;
  };

  const handleRequestOtp = async () => {
    if (isLoading) return;
    clearError();
    setConsentError(null);
    const issue = phoneInputIssue(rawPhone);
    if (issue) {
      setPhoneError(issue === "invalid_start" ? strings.invalidStartError : strings.incompletePhoneError);
      return;
    }
    setPhoneError(null);
    if (consentMissing()) return;

    if (await requestOtp(toE164IndianPhone(rawPhone), mode === "signup")) {
      setStep("otp");
      setOtp("");
      setCountdown(RESEND_SECONDS);
      setTimeout(() => otpRef.current?.focus(), 150);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0 || isLoading || verified) return;
    clearError();
    if (await requestOtp(toE164IndianPhone(rawPhone), mode === "signup")) {
      setCountdown(RESEND_SECONDS);
      setOtp("");
      otpRef.current?.focus();
    }
  };

  const submitOtp = async (code: string) => {
    if (code.length !== OTP_LENGTH || submitting.current || verified) return;
    if (consentMissing()) return;
    submitting.current = true;
    const response = await verifyOtp(toE164IndianPhone(rawPhone), code);
    submitting.current = false;
    if (response) {
      setVerified(true);
      onSuccess?.(response);
    } else {
      // A rejected code is cleared so the same code is not sent again; the field stays focused for the next one.
      setOtp("");
      otpRef.current?.focus();
    }
  };

  // One field for the whole code: SMS autofill and paste deliver all six digits at once; it auto-submits when complete.
  const handleOtpChange = (text: string) => {
    if (submitting.current || verified) return;
    clearError();
    const code = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setOtp(code);
    if (code.length === OTP_LENGTH) void submitOtp(code);
  };

  const messageKey = apiError ? authMessageKey(apiError, mode) : null;
  const bannerText = phoneError || consentError || (messageKey ? messageFor(messageKey, strings) : null);
  const phoneCooldown = step === "phone" && countdown > 0 && apiError?.isRateLimited === true;
  const switchMode = mode === "signin" ? onCreateAccount : onSignIn;
  const hindi = language === "hi";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={step === "otp" ? strings.changePhoneButton : strings.backButton}
              style={styles.backButton}
              onPress={step === "otp" ? backToPhone : onBack}
              hitSlop={8}
            >
              <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={22} style={styles.backArrow} />
            </Pressable>
          )}
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
              {mode === "signup" ? strings.createAccountHeader : strings.headerTitle}
            </Text>
            <Text style={styles.headerTagline}>{strings.headerTagline}</Text>
          </View>
        </View>

        {/* Not `accessible`: grouping would hide the two radios from TalkBack / VoiceOver. */}
        <View style={styles.languageToggleContainer} accessibilityRole="radiogroup">
          {(["en", "hi"] as const).map((lang, i) => (
            <View key={lang} style={styles.langRow}>
              {i > 0 && <View style={styles.langDivider} />}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: language === lang }}
                accessibilityLabel={lang === "en" ? "English" : "हिन्दी"}
                style={[styles.langButton, language === lang && styles.langButtonActive]}
                onPress={() => setLanguage(lang)}
                hitSlop={6}
              >
                <Text style={[styles.langButtonText, language === lang && styles.langButtonTextActive]}>
                  {lang === "en" ? "EN" : "हिन्दी"}
                </Text>
              </Pressable>
            </View>
          ))}
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
            <Text style={[styles.screenHeading, hindi && styles.hindiHeading]} accessibilityRole="header">
              {step === "phone" ? strings.phoneStepTitle : strings.otpStepTitle}
            </Text>
            <Text style={[styles.screenSubtitle, hindi && styles.hindiBody]}>
              {step === "phone" ? (
                strings.phoneStepSubtitle
              ) : (
                <>
                  {strings.otpStepSubtitle}{" "}
                  <Text style={styles.phoneHighlight}>+91 {formatPhoneDisplay(rawPhone)}</Text>
                </>
              )}
            </Text>
          </View>

          {bannerText && (
            <View style={styles.errorAlertContainer} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.emergencyDark} style={styles.errorAlertIcon} />
              <Text style={[styles.errorAlertText, hindi && styles.hindiBody]}>{bannerText}</Text>
              {messageKey === "accountNotFound" && onCreateAccount ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onCreateAccount(rawPhone, language)}
                  style={styles.accountNotFoundButton}
                >
                  <Text style={styles.accountNotFoundButtonText}>{strings.createAccountAction}</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {step === "phone" && (
            <View style={styles.inputSection}>
              {/* Which flow this is, in words a patient can act on, with the way across (number kept). */}
              <View style={styles.modeNote}>
                <Text style={[styles.modeNoteText, hindi && styles.hindiBody]}>
                  {mode === "signin" ? strings.modeSignInNote : strings.modeSignUpNote}
                </Text>
                {switchMode && (
                  <Pressable accessibilityRole="button" onPress={() => switchMode(rawPhone, language)} hitSlop={8} style={styles.modeSwitch}>
                    <Text style={styles.modeSwitchText}>{mode === "signin" ? strings.switchToSignUp : strings.switchToSignIn}</Text>
                  </Pressable>
                )}
              </View>

              <Text style={styles.fieldLabel} nativeID="phoneLabel">{strings.phoneInputLabel}</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryCodeBadge} accessible accessibilityLabel="India, country code +91">
                  <Text style={styles.flagIcon}>🇮🇳</Text>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  style={[styles.phoneTextInput, phoneError ? styles.inputBorderError : null]}
                  placeholder={strings.phoneInputPlaceholder}
                  placeholderTextColor={colors.slate400}
                  keyboardType="number-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  maxLength={17} // room for an autofilled/pasted "+91 98765 43210"; normalized on change
                  value={formatPhoneDisplay(rawPhone)}
                  onChangeText={handlePhoneChange}
                  onSubmitEditing={handleRequestOtp}
                  returnKeyType="done"
                  autoFocus
                  accessibilityLabel={`${strings.phoneInputLabel}, +91`}
                  accessibilityLabelledBy="phoneLabel"
                  accessibilityHint={strings.phoneHelper}
                />
              </View>
              <Text style={styles.phoneHelperText}>{strings.phoneHelper}</Text>
            </View>
          )}

          {step === "otp" && (
            <View style={styles.otpSection}>
              <View style={styles.otpHeaderRow}>
                <Text style={styles.fieldLabel}>{strings.otpInputLabel}</Text>
                <Pressable accessibilityRole="button" onPress={backToPhone} hitSlop={8} style={styles.inlineAction}>
                  <Text style={styles.changePhoneText}>{strings.changePhoneButton}</Text>
                </Pressable>
              </View>

              {/* One real input under six drawn cells: tapping a cell focuses it; screen readers see one labelled field. */}
              <Pressable style={styles.otpInputRow} onPress={() => otpRef.current?.focus()} accessible={false}>
                {Array.from({ length: OTP_LENGTH }, (_, i) => (
                  <View
                    key={i}
                    importantForAccessibility="no-hide-descendants"
                    accessibilityElementsHidden
                    style={[
                      styles.otpCell,
                      otp[i] ? styles.otpCellFilled : null,
                      otpFocused && i === Math.min(otp.length, OTP_LENGTH - 1) ? styles.otpCellFocused : null,
                      apiError ? styles.otpCellError : null,
                    ]}
                  >
                    <Text style={styles.otpCellText}>{otp[i] ?? ""}</Text>
                  </View>
                ))}
                <TextInput
                  ref={otpRef}
                  style={styles.otpHiddenInput}
                  value={otp}
                  onChangeText={handleOtpChange}
                  onFocus={() => setOtpFocused(true)}
                  onBlur={() => setOtpFocused(false)}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  caretHidden
                  accessibilityLabel={strings.otpInputLabel}
                  accessibilityHint={strings.otpInputHint}
                />
              </Pressable>

              <View style={styles.resendRow}>
                {countdown > 0 ? (
                  <Text style={styles.timerText} accessibilityLiveRegion="none">{strings.resendCountdown(countdown)}</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isLoading || verified }}
                    disabled={isLoading || verified}
                    onPress={handleResendOtp}
                    hitSlop={8}
                    style={styles.inlineAction}
                  >
                    <Text style={styles.resendActiveButtonText}>{isLoading ? strings.resendingOtp : strings.resendButton}</Text>
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

        <View style={styles.actionDock}>
          {step === "phone" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoading || phoneCooldown, busy: isLoading }}
              disabled={isLoading || phoneCooldown}
              style={({ pressed }) => [
                styles.primarySubmitButton,
                (isLoading || phoneCooldown) && styles.primarySubmitButtonDisabled,
                pressed && styles.primarySubmitButtonPressed,
              ]}
              onPress={handleRequestOtp}
            >
              <Text style={styles.primarySubmitButtonText}>
                {isLoading ? strings.requestingOtp : phoneCooldown ? strings.waitCountdown(countdown) : strings.requestOtpButton}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: otp.length !== OTP_LENGTH || isLoading || verified, busy: isLoading }}
              disabled={otp.length !== OTP_LENGTH || isLoading || verified}
              style={({ pressed }) => [
                styles.primarySubmitButton,
                (otp.length !== OTP_LENGTH || isLoading || verified) && styles.primarySubmitButtonDisabled,
                pressed && styles.primarySubmitButtonPressed,
              ]}
              onPress={() => submitOtp(otp)}
            >
              <Text style={styles.primarySubmitButtonText}>
                {verified ? strings.signedIn : isLoading ? strings.verifyingOtp : strings.verifyButton}
              </Text>
            </Pressable>
          )}
          {/* Signing in must never stand between a patient and the national helpline. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openURL("tel:108").catch(() => {})}
            style={styles.call108}
            hitSlop={4}
          >
            <AppIcon icon={{ set: "ion", name: "call" }} size={16} color={colors.emergencyDark} />
            <Text style={styles.call108Text}>{strings.call108}</Text>
          </Pressable>
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
    width: 44,
    height: 44,
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
    flexShrink: 1,
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
  langRow: {
    flexDirection: "row",
    alignItems: "center",
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
    flexWrap: "wrap",
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

  accountNotFoundButton: {
    flexBasis: "100%",
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.emergencyDark,
    alignItems: "center",
    justifyContent: "center",
  },
  accountNotFoundButtonText: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.sm,
  },

  /* STEP 1: PHONE INPUT */
  inputSection: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    flexShrink: 1,
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
    borderColor: colors.controlBorder,
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
  modeNote: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  modeNoteText: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.lineHeights.sm,
    color: colors.slate800,
  },
  modeSwitch: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  modeSwitchText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
    textDecorationLine: "underline",
  },
  inlineAction: {
    minHeight: 44,
    justifyContent: "center",
  },
  call108: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  call108Text: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },
  phoneHelperText: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
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
    flexShrink: 1,
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
    borderColor: colors.controlBorder,
    borderRadius: radii.lg,
    backgroundColor: colors.slate50,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.sm,
  },
  otpCellText: {
    fontSize: 22,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  // Covers the cells so a tap lands on the real input; transparent text, not opacity 0, which can block autofill.
  otpHiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: "transparent",
    backgroundColor: "transparent",
    fontSize: 1,
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
