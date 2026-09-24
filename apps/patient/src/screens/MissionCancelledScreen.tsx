import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import { cancellationStrings } from "../i18n/cancellationStrings";

import { AppIcon } from "../components";
export interface MissionCancelledScreenProps {
  missionId?: string;
  /** From the server's MISSION_CANCELLED.data; absent from a pre-v1 publisher, in which case no cause is claimed. */
  cancelledBy?: "patient" | "driver" | "system";
  reason?: string;
  initialLanguage?: SupportedLanguage;
  onCall108?: () => void;
  onReturnHome?: () => void;
}

/**
 * MissionCancelledScreen for Ek-Ambulance
 *
 * Represents the XState `cancelled` lifecycle state reached while a patient
 * was already tracking/transporting - dispatch or the assigned driver
 * cancelled the mission via Centrifugo (MISSION_CANCELLED -> CANCEL,
 * translated by missionLifecycleBridge.ts). Distinct from the pre-match
 * "I changed my mind" cancel flow on ActiveMatchingScreen, which navigates
 * straight back without ever rendering a terminal screen - this cancellation
 * arrives mid-mission with no user action, so the patient needs an explicit
 * screen: what happened, and the immediate 108 fallback if this is still
 * an emergency.
 */
export default function MissionCancelledScreen({
  missionId = "",
  cancelledBy,
  reason,
  initialLanguage = "en",
  onCall108,
  onReturnHome,
}: MissionCancelledScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = cancellationStrings[language];

  const handleCall108 = () => {
    if (onCall108) {
      onCall108();
      return;
    }
    Linking.openURL("tel:108").catch(() => {
      Alert.alert(strings.call108Button, "108 National Emergency Ambulance Helpline: 108");
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>{strings.screenTitle}</Text>

        <View
          style={styles.langToggleContainer}
          accessibilityRole="radiogroup"
          accessibilityLabel={strings.languageToggleLabel}
        >
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: language === "en" }}
            style={[styles.langButton, language === "en" && styles.langButtonActive]}
            onPress={() => setLanguage("en")}
          >
            <Text style={[styles.langButtonText, language === "en" && styles.langButtonTextActive]}>
              {strings.englishLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: language === "hi" }}
            style={[styles.langButton, language === "hi" && styles.langButtonActive]}
            onPress={() => setLanguage("hi")}
          >
            <Text style={[styles.langButtonText, language === "hi" && styles.langButtonTextActive]}>
              {strings.hindiLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.statusCard}>
          <View style={styles.cancelledBadge}>
            <AppIcon icon={{ set: "ion", name: "close-circle" }} size={16} color={colors.white} style={styles.cancelledBadgeIcon} />
            <Text style={styles.cancelledBadgeText}>{strings.cancelledBadge}</Text>
          </View>
          {missionId ? <Text style={styles.missionIdText}>{strings.missionIdLabel(missionId)}</Text> : null}
          <Text style={styles.cancelledTitle}>{strings.cancelledTitle}</Text>
          <Text style={styles.cancelledDescription}>{strings.cancelledDescriptionFor(cancelledBy, reason)}</Text>
        </View>

        {/* STATUTORY FALLBACK GUIDANCE WITH DIRECT 108 DIALER */}
        <View style={styles.fallbackBanner} accessible accessibilityRole="alert">
          <View style={styles.warningHeaderRow}>
            <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.slate700} style={styles.warningAlertIcon} />
            <Text style={styles.warningAlertTitle}>{strings.fallbackGuidanceTitle}</Text>
          </View>
          <Text style={styles.warningAlertDescription}>{strings.fallbackGuidanceDescription}</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.call108Button}
            accessibilityHint="Dials toll-free national ambulance helpline 108"
            style={({ pressed }) => [styles.call108Button, pressed && styles.call108ButtonPressed]}
            onPress={handleCall108}
          >
            <AppIcon icon={{ set: "ion", name: "call" }} size={20} color={colors.white} style={styles.call108PhoneIcon} />
            <View>
              <Text style={styles.call108ButtonTitle}>{strings.call108Button}</Text>
              <Text style={styles.call108ButtonSubtitle}>{strings.call108Subtitle}</Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.returnHomeButton}
          style={({ pressed }) => [styles.returnHomeButton, pressed && styles.returnHomeButtonPressed]}
          onPress={onReturnHome}
        >
          <Text style={styles.returnHomeButtonText}>{strings.returnHomeButton}</Text>
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
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.slate200,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  langToggleContainer: {
    flexDirection: "row",
    backgroundColor: colors.slate100,
    borderRadius: radii.full,
    padding: 2,
  },
  langButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  langButtonActive: {
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  langButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate500,
  },
  langButtonTextActive: {
    color: colors.slate900,
  },
  content: {
    flex: 1,
    padding: spacing.base,
    justifyContent: "center",
  },
  statusCard: {
    backgroundColor: colors.slate50,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  cancelledBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate700,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  cancelledBadgeIcon: {
    marginRight: 4,
  },
  cancelledBadgeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
  },
  missionIdText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate500,
    marginBottom: spacing.sm,
  },
  cancelledTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginBottom: spacing.sm,
  },
  cancelledDescription: {
    fontSize: typography.fontSizes.sm,
    lineHeight: 20,
    color: colors.slate700,
  },

  fallbackBanner: {
    backgroundColor: colors.emergencyLight,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.emergencyDark,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  warningHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  warningAlertIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  warningAlertTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
  },
  warningAlertDescription: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
    color: colors.slate800,
    marginBottom: spacing.md,
  },
  call108Button: {
    backgroundColor: colors.emergency,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  call108ButtonPressed: {
    backgroundColor: colors.emergencyDeep,
  },
  call108PhoneIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  call108ButtonTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  call108ButtonSubtitle: {
    fontSize: 10,
    color: colors.emergencyLight,
    fontWeight: typography.fontWeights.medium,
  },

  returnHomeButton: {
    backgroundColor: colors.slate900,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: "center",
  },
  returnHomeButtonPressed: {
    backgroundColor: colors.slate700,
  },
  returnHomeButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
});
