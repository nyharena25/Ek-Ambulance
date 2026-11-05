import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "../lib/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "@sahayak/ui";
import { AppIcon } from "../components";
import { signOut } from "../lib/driverServer";
import { useDriverProfileStore } from "../state/driverProfile.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { driverVerificationStrings, type DriverVerificationTranslation } from "../i18n/driverVerificationStrings";

/** Supabase signOut behind a confirmation; the auth listener drops the session and the route gate returns to phone entry. */
export function confirmDriverSignOut(t: DriverVerificationTranslation): void {
  Alert.alert(t.signOutConfirmTitle, t.signOutConfirmBody, [
    { text: t.cancel, style: "cancel" },
    {
      text: t.signOut,
      style: "destructive",
      onPress: () =>
        void signOut().then((r) => {
          if (!r.ok) Alert.alert(t.signOutFailed);
        }),
    },
  ]);
}

/**
 * The submitted application's waiting screen. Everything shown is the server's (get_driver_profile): the status is
 * re-read on open and on "Check status", and the root route gate moves the driver on as soon as it changes (approved ->
 * standby, rejected -> the application form with the reviewer's reason). Nothing here makes the driver operational.
 */
export default function DriverVerificationScreen() {
  const language = useDriverStandbyStore((s) => s.language);
  const t = driverVerificationStrings[language];
  const profile = useDriverProfileStore((s) => s.profile);
  const loading = useDriverProfileStore((s) => s.status === "loading");
  const [checkFailed, setCheckFailed] = useState(false);

  const check = async () => {
    setCheckFailed(false);
    await useDriverProfileStore.getState().load();
    setCheckFailed(useDriverProfileStore.getState().status === "error");
  };
  useEffect(() => {
    void check();
  }, []);

  // The server's status only: while it is being read (or could not be) that is what is shown, never an assumed "pending".
  const kycStatus = profile?.kycStatus ?? null;
  const steps: { label: string; done: boolean; active: boolean }[] = [
    { label: t.stepSubmitted, done: true, active: false },
    { label: t.stepReview, done: false, active: true },
    { label: t.stepDecision, done: false, active: false },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <AppIcon icon={{ set: "ion", name: "time" }} size={36} color={colors.warning} />
          </View>
          <Text style={styles.title} accessibilityRole="header">{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t.statusLabel}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>
              {kycStatus ? (t.status[kycStatus] ?? kycStatus) : checkFailed ? t.checkFailed : t.loading}
            </Text>
          </View>
          {profile?.phone ? (
            <Text style={styles.meta}>
              {t.signedInAs} {profile.phone}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          {steps.map((s) => (
            <View key={s.label} style={styles.stepRow}>
              <AppIcon
                icon={{ set: "ion", name: s.done ? "checkmark-circle" : s.active ? "ellipsis-horizontal-circle" : "ellipse-outline" }}
                size={22}
                color={s.done ? colors.success : s.active ? colors.warning : colors.slate400}
              />
              <Text style={[styles.stepText, !s.done && !s.active && styles.stepTextPending]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, styles.warnCard]} accessibilityRole="alert">
          <AppIcon icon={{ set: "ion", name: "lock-closed" }} size={18} color={colors.slate900} />
          <Text style={styles.warnText}>{t.cannotOperate}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.nextTitle}</Text>
          <Text style={styles.body}>{t.nextBody}</Text>
        </View>

        {checkFailed ? <Text style={styles.error}>{t.checkFailed}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void check()}
          style={({ pressed }) => [styles.primary, (pressed || loading) && styles.dimmed]}
        >
          {loading ? <ActivityIndicator color={colors.white} /> : null}
          <Text style={styles.primaryText}>{loading ? t.checking : t.checkStatus}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => confirmDriverSignOut(t)} style={styles.secondary}>
          <Text style={styles.secondaryText}>{t.signOut}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { alignItems: "center", paddingVertical: spacing.lg },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.warningLight, alignItems: "center", justifyContent: "center" },
  title: { fontSize: typography.fontSizes["2xl"], fontWeight: typography.fontWeights.bold, color: colors.slate900, marginTop: spacing.md, textAlign: "center" },
  subtitle: { fontSize: typography.fontSizes.sm, color: colors.slate600, marginTop: spacing.xs },
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.slate200, padding: spacing.base, gap: spacing.sm },
  label: { fontSize: typography.fontSizes.xs, color: colors.slate600, fontWeight: typography.fontWeights.semibold },
  statusPill: { alignSelf: "flex-start", backgroundColor: colors.warningLight, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statusText: { color: colors.slate900, fontWeight: typography.fontWeights.bold },
  meta: { fontSize: typography.fontSizes.xs, color: colors.slate600 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepText: { fontSize: typography.fontSizes.base, color: colors.slate900 },
  stepTextPending: { color: colors.slate500 },
  warnCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.slate100, borderColor: colors.slate300 },
  warnText: { flex: 1, fontSize: typography.fontSizes.sm, color: colors.slate900, fontWeight: typography.fontWeights.semibold },
  sectionTitle: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  body: { fontSize: typography.fontSizes.sm, color: colors.slate700, lineHeight: 20 },
  error: { color: colors.triageRedText, fontSize: typography.fontSizes.sm, textAlign: "center" },
  primary: { minHeight: 48, borderRadius: radii.md, backgroundColor: colors.slate900, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.white, fontWeight: typography.fontWeights.bold, fontSize: typography.fontSizes.base },
  dimmed: { opacity: 0.6 },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.slate700, fontWeight: typography.fontWeights.semibold },
});
