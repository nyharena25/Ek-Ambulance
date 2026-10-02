import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import {
  onboardingStrings,
  SupportedLanguage,
} from "../i18n/onboardingStrings";

import { AppIcon } from "../components";
export interface OnboardingScreenProps {
  /** The chosen language is carried into sign-in. */
  onSignIn?: (language: SupportedLanguage) => void;
  onCreateAccount?: (language: SupportedLanguage) => void;
  onCall108?: () => void;
  initialLanguage?: SupportedLanguage;
}

/**
 * OnboardingScreen for Ek-Ambulance
 *
 * Conforms to WCAG AAA Contrast Standards:
 * - Slate-900 on White: 18.7:1 (exceeds AAA normal text threshold of 7.0:1)
 * - Slate-700 on Slate-50: 9.6:1 (exceeds AAA normal text threshold of 7.0:1)
 * - White on Emergency Red (colors.emergency) for 18px bold button: 4.54:1 (meets AAA large text threshold of 4.5:1)
 * - Red-700 (colors.emergencyDark) accents on White: 7.1:1 (meets AAA normal text threshold of 7.0:1)
 * - UI boundary elements (Slate-300): 3.1:1 (meets non-text contrast threshold of 3.0:1)
 */
export default function OnboardingScreen({
  onSignIn,
  onCreateAccount,
  onCall108,
  initialLanguage = "en",
}: OnboardingScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = onboardingStrings[language];

  const handleLanguageSwitch = (newLang: SupportedLanguage) => {
    if (newLang !== language) {
      setLanguage(newLang);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* PERSISTENT BILINGUAL HEADER */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          {/* Emergency Cross Badge */}
          <View style={styles.brandBadge} accessible={false}>
            <View style={styles.crossHorizontal} />
            <View style={styles.crossVertical} />
          </View>
          <View style={styles.brandTextContainer}>
            <Text style={styles.brandTitle} accessibilityRole="header">
              {strings.brandName}
            </Text>
            <Text style={styles.brandTagline}>{strings.brandTagline}</Text>
          </View>
        </View>

        {/* Persistent Bilingual Language Toggle */}
        {/* Not `accessible`: grouping would hide the two radios from TalkBack / VoiceOver. */}
        <View
          style={styles.languageToggleContainer}
          accessibilityRole="radiogroup"
          accessibilityLabel={strings.languageToggleLabel}
        >
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === "en" }}
            accessibilityLabel="Switch to English"
            accessibilityHint="Changes app language to English"
            style={[
              styles.langButton,
              language === "en" && styles.langButtonActive,
            ]}
            onPress={() => handleLanguageSwitch("en")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
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
            accessibilityHint="ऐप की भाषा हिन्दी में बदलता है"
            style={[
              styles.langButton,
              language === "hi" && styles.langButtonActive,
            ]}
            onPress={() => handleLanguageSwitch("hi")}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Text
              style={[
                styles.langButtonText,
                styles.hindiFont,
                language === "hi" && styles.langButtonTextActive,
              ]}
            >
              हिन्दी
            </Text>
          </Pressable>
        </View>
      </View>

      {/* SCROLLABLE HERO & VALUE PROPOSITIONS */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        accessible={false}
      >
        {/* Welcome */}
        <View style={styles.heroSection}>
          <Text
            style={[
              styles.heroHeading,
              language === "hi" && styles.hindiHeadingFont,
            ]}
            accessibilityRole="header"
          >
            {strings.heroHeading}
          </Text>
          <Text
            style={[
              styles.heroSubheading,
              language === "hi" && styles.hindiBodyFont,
            ]}
          >
            {strings.heroSubheading}
          </Text>
        </View>
      </ScrollView>

      {/* PERSISTENT DUAL ACTION DOCK */}
      <View style={styles.actionDock}>
        {/* Both are Supabase phone OTP. Sign in never creates an account (an unknown number is told so and offered Create
            account); Create account may create one. A request needs a signed-in patient: no anonymous path past here. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.signInTitle}
          accessibilityHint={strings.signInSubtitle}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
          onPress={() => onSignIn?.(language)}
        >
          <View style={styles.primaryButtonContent}>
            <View style={styles.primaryTextWrapper}>
              <Text
                style={[
                  styles.primaryButtonTitle,
                  language === "hi" && styles.hindiHeadingFont,
                ]}
              >
                {strings.signInTitle}
              </Text>
              <Text
                style={[
                  styles.primaryButtonSubtitle,
                  language === "hi" && styles.hindiBodyFont,
                ]}
              >
                {strings.signInSubtitle}
              </Text>
            </View>
            <AppIcon icon={{ set: "ion", name: "arrow-forward" }} size={22} style={styles.buttonArrowText} />
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.createAccountTitle}
          accessibilityHint={strings.createAccountSubtitle}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
          onPress={() => onCreateAccount?.(language)}
        >
          <Text
            style={[
              styles.secondaryButtonTitle,
              language === "hi" && styles.hindiHeadingFont,
            ]}
          >
            {strings.createAccountTitle}
          </Text>
          <Text style={[styles.secondaryButtonSubtitle, language === "hi" && styles.hindiBodyFont]}>
            {strings.createAccountSubtitle}
          </Text>
        </Pressable>

        {/* Toll-Free Fallback: national 108 helpline */}
        {onCall108 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.tollFreeCall}
            accessibilityHint="Places a direct call to the national 108 emergency helpline"
            style={({ pressed }) => [
              styles.tollFreeButton,
              pressed && styles.tollFreeButtonPressed,
            ]}
            onPress={onCall108}
          >
            <AppIcon
              icon={{ set: "ion", name: "call" }}
              size={18}
              color={colors.emergencyDark}
            />
            <Text
              style={[
                styles.tollFreeButtonText,
                language === "hi" && styles.hindiHeadingFont,
              ]}
            >
              {strings.tollFreeCall}
            </Text>
          </Pressable>
        )}

        {/* High-Contrast Emergency Disclaimer */}
        <View style={styles.disclaimerContainer}>
          <Text
            style={[
              styles.disclaimerText,
              language === "hi" && styles.hindiCaptionFont,
            ]}
          >
            {strings.emergencyDisclaimer}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },

  /* HEADER & BILINGUAL TOGGLE */
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
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandBadge: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.emergencyLight,
    borderWidth: 1.5,
    borderColor: colors.emergency,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  crossHorizontal: {
    position: "absolute",
    width: 18,
    height: 6,
    backgroundColor: colors.emergency,
    borderRadius: 2,
  },
  crossVertical: {
    position: "absolute",
    width: 6,
    height: 18,
    backgroundColor: colors.emergency,
    borderRadius: 2,
  },
  brandTextContainer: {
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: typography.fontSizes.lg,
    lineHeight: typography.lineHeights.lg,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: -0.3,
  },
  brandTagline: {
    marginTop: 2,
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    fontWeight: typography.fontWeights.semibold,
  },

  /* BILINGUAL LANGUAGE SELECTOR */
  languageToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderRadius: radii.full,
    padding: 3,
    borderWidth: 1.5,
    borderColor: colors.slate300,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
    minHeight: 38,
    minWidth: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  langButtonActive: {
    backgroundColor: colors.slate900,
  },
  langButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
  langButtonTextActive: {
    color: colors.white,
  },
  langDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.slate300,
  },
  hindiFont: {
    fontSize: typography.fontSizes.sm,
  },
  hindiHeadingFont: {
    lineHeight: 28,
  },
  hindiBodyFont: {
    lineHeight: 22,
  },
  hindiCaptionFont: {
    lineHeight: 18,
  },

  /* SCROLL CONTENT */
  scrollView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.xl,
  },

  /* VERIFIED BADGE */

  /* HERO */
  heroSection: {
    marginBottom: spacing.xl,
  },
  heroHeading: {
    fontSize: typography.fontSizes["2xl"],
    lineHeight: typography.lineHeights["2xl"],
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  heroSubheading: {
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    fontWeight: typography.fontWeights.medium,
    color: colors.slate700,
  },

  /* SECTION HEADER */

  /* VALUE PROPOSITION CARDS (WCAG AAA) */

  /* PERSISTENT ACTION DOCK */
  actionDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.base,
    backgroundColor: colors.white,
    borderTopWidth: 1.5,
    borderTopColor: colors.slate200,
    ...shadows.md,
  },

  /* PRIMARY ACTION: EMERGENCY ACCESS */
  primaryButton: {
    backgroundColor: colors.emergency,
    borderRadius: radii.xl,
    paddingVertical: 14,
    paddingHorizontal: spacing.base,
    minHeight: 64,
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
    marginBottom: spacing.md,
  },
  primaryButtonPressed: {
    backgroundColor: colors.emergencyDeep,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  primaryTextWrapper: {
    flex: 1,
  },
  primaryButtonTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.lg,
    lineHeight: typography.lineHeights.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    letterSpacing: -0.2,
  },
  primaryButtonSubtitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.emergencyLight,
    fontWeight: typography.fontWeights.medium,
    marginTop: 2,
  },
  buttonArrowText: {
    fontSize: 22,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginLeft: spacing.sm,
  },

  /* SECONDARY ACTION: SIGN IN WITH PHONE */
  tollFreeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.emergencyLight,
    borderWidth: 1.5,
    borderColor: colors.emergencyBorder,
    marginBottom: spacing.md,
  },
  tollFreeButtonPressed: {
    backgroundColor: colors.emergencyBorder,
  },
  tollFreeButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },

  secondaryButton: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: 12,
    minHeight: 60,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.slate900,
    marginBottom: spacing.md,
  },
  secondaryButtonSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    fontWeight: typography.fontWeights.medium,
    marginTop: 2,
  },
  secondaryButtonPressed: {
    backgroundColor: colors.slate100,
  },
  secondaryButtonTitle: {
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },

  /* EMERGENCY DISCLAIMER */
  disclaimerContainer: {
    alignItems: "center",
    paddingHorizontal: spacing.sm,
  },
  disclaimerText: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 16,
    color: colors.slate600,
    textAlign: "center",
    fontWeight: typography.fontWeights.medium,
  },
});
