import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "@sahayak/ui";
import { driverAuthStrings } from "../i18n/driverAuthStrings";
import { driverVerificationStrings } from "../i18n/driverVerificationStrings";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { useDriverConsentStore } from "../state/driverConsent.store";
import { DpdpNoticeCard } from "../components/DpdpNoticeCard";
import { confirmDriverSignOut } from "./DriverVerificationScreen";

/**
 * The DPDP consent step, shown by the route gate only when the signed-in account has no current consent on the server
 * (first sign-in, a withdrawn consent, or a new notice version). Granting records it server-side (record_consent, keyed on
 * auth.uid()); the gate moves on once the server's records show it. Declining is signing out.
 */
export default function DriverConsentScreen() {
  const language = useDriverStandbyStore((s) => s.language);
  const strings = driverAuthStrings[language];
  const grant = useDriverConsentStore((s) => s.grant);
  const [checked, setChecked] = useState({ location: false, credential: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onToggle = (purpose: "location" | "credential") => {
    setError(null);
    setChecked((c) => ({ ...c, [purpose]: !c[purpose] }));
  };

  const onContinue = async () => {
    if (!checked.location) return setError(strings.consentLocationError);
    if (!checked.credential) return setError(strings.consentCredentialError);
    setSaving(true);
    const ok = await grant(language);
    setSaving(false);
    if (!ok) setError(strings.consentSaveFailed);
  };

  const ready = checked.location && checked.credential && !saving;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.consentStepTitle}
        </Text>
        <Text style={styles.subtitle}>{strings.consentStepSubtitle}</Text>
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <DpdpNoticeCard strings={strings} consent={{ ...checked, onToggle }} />
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={onContinue}
          style={[styles.primary, !ready && styles.primaryDisabled]}
        >
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{strings.consentContinueButton}</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => confirmDriverSignOut(driverVerificationStrings[language])}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{driverVerificationStrings[language].signOut}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  subtitle: { fontSize: typography.fontSizes.sm, lineHeight: typography.lineHeights.sm, color: colors.slate700 },
  error: { fontSize: typography.fontSizes.sm, color: colors.emergencyDark, fontWeight: typography.fontWeights.semibold },
  actions: { padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.slate200 },
  primary: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.emergency, alignItems: "center", justifyContent: "center" },
  primaryDisabled: { backgroundColor: colors.slate300 },
  primaryText: { color: colors.white, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.slate700, fontWeight: typography.fontWeights.semibold },
});
