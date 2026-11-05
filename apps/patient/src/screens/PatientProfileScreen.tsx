import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "../lib/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "@sahayak/ui";
import { AppIcon } from "../components";
import { profileStrings } from "../i18n/profileStrings";
import type { SupportedLanguage } from "../i18n/onboardingStrings";
import { fetchConsents, fetchPatientProfile, savePatientName, type ConsentEntry, type PatientProfile } from "../lib/patientProfile";

export interface PatientProfileScreenProps {
  userId: string;
  /** False while an ambulance request is live (missionSession.core canSignOut). */
  signOutAllowed: boolean;
  onSignOut: () => Promise<{ ok: true } | { ok: false; code: string }>;
  onBack: () => void;
  language?: SupportedLanguage;
}

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; profile: PatientProfile; consents: ConsentEntry[] | null };

/**
 * Account screen. Everything shown is read from the server for the signed-in patient (profiles, consent_records); the
 * only editable field is the name, the one profile column a patient may write. No emergency contacts or settings are
 * offered because the backend has nowhere to keep them.
 */
export default function PatientProfileScreen({ userId, signOutAllowed, onSignOut, onBack, language = "en" }: PatientProfileScreenProps) {
  const t = profileStrings[language];
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoad({ kind: "loading" });
    const [profile, consents] = await Promise.all([fetchPatientProfile(userId), fetchConsents(userId)]);
    if (!profile) return setLoad({ kind: "error" });
    setName(profile.fullName ?? "");
    setLoad({ kind: "ready", profile, consents });
  }, [userId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const onSave = async () => {
    if (load.kind !== "ready" || saving) return;
    setSaving(true);
    setNotice(null);
    const ok = await savePatientName(userId, name);
    setSaving(false);
    if (!ok) return setNotice({ ok: false, text: t.saveFailed });
    const trimmed = name.trim();
    setName(trimmed);
    setLoad({ ...load, profile: { ...load.profile, fullName: trimmed === "" ? null : trimmed } });
    setNotice({ ok: true, text: t.saved });
  };

  const confirmSignOut = () =>
    Alert.alert(t.signOutConfirmTitle, t.signOutConfirmBody, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.signOut,
        style: "destructive",
        onPress: () => {
          setSigningOut(true);
          void onSignOut().then((r) => {
            setSigningOut(false);
            if (!r.ok) Alert.alert(r.code === "mission_in_progress" ? t.signOutBlocked : t.signOutFailed);
          });
        },
      },
    ]);

  const call108 = () => void Linking.openURL("tel:108").catch(() => {});

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t.back} hitSlop={10}>
          <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={22} color={colors.slate800} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">{t.title}</Text>
      </View>

      {load.kind === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.emergency} />
          <Text style={styles.muted}>{t.loading}</Text>
        </View>
      ) : load.kind === "error" ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t.loadFailed}</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => void fetchAll()} accessibilityRole="button">
            <Text style={styles.secondaryText}>{t.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title={t.accountSection}>
            <Row label={t.phone} value={load.profile.phone} />
            <Row label={t.status} value={t.signedIn} />
            <Text style={styles.label}>{t.name}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setNotice(null);
              }}
              placeholder={t.namePlaceholder}
              placeholderTextColor={colors.slate400}
              maxLength={80}
              autoCapitalize="words"
              accessibilityLabel={t.name}
            />
            <Text style={styles.hint}>{t.nameHint}</Text>
            {notice && <Text style={notice.ok ? styles.ok : styles.error}>{notice.text}</Text>}
            <Pressable
              style={[styles.secondaryBtn, (saving || name.trim() === (load.profile.fullName ?? "")) && styles.disabled]}
              disabled={saving || name.trim() === (load.profile.fullName ?? "")}
              onPress={() => void onSave()}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>{saving ? t.saving : t.save}</Text>
            </Pressable>
          </Section>

          <Section title={t.emergencySection}>
            <Pressable style={styles.call108} onPress={call108} accessibilityRole="button" accessibilityLabel={`${t.call108}, ${t.call108Sub}`}>
              <AppIcon icon={{ set: "ion", name: "call" }} size={22} color={colors.white} />
              <View style={styles.flexShrink}>
                <Text style={styles.call108Text}>{t.call108}</Text>
                <Text style={styles.call108Sub}>{t.call108Sub}</Text>
              </View>
            </Pressable>
          </Section>

          <Section title={t.privacySection}>
            {load.consents && load.consents.length > 0 ? (
              load.consents.map((c) => (
                <Row
                  key={c.purpose}
                  label={t.consentPurpose[c.purpose] ?? c.purpose}
                  value={c.granted ? t.consentGiven(formatDate(c.grantedAt)) : t.consentWithdrawn(formatDate(c.grantedAt))}
                />
              ))
            ) : (
              <Text style={styles.hint}>{t.noConsents}</Text>
            )}
          </Section>

          <Pressable
            style={[styles.signOutBtn, (!signOutAllowed || signingOut) && styles.disabled]}
            disabled={!signOutAllowed || signingOut}
            onPress={confirmSignOut}
            accessibilityRole="button"
            accessibilityHint={signOutAllowed ? undefined : t.signOutBlocked}
          >
            <Text style={styles.signOutText}>{t.signOut}</Text>
          </Pressable>
          {!signOutAllowed && <Text style={styles.hint}>{t.signOutBlocked}</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.slate200 },
  backBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flexShrink: 1, fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  section: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.slate200, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate600, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { gap: 2, paddingVertical: spacing.xs },
  label: { fontSize: typography.fontSizes.sm, color: colors.slate600 },
  value: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.semibold, color: colors.slate900 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.fontSizes.base, color: colors.slate900, backgroundColor: colors.white },
  hint: { fontSize: typography.fontSizes.sm, color: colors.slate600 },
  ok: { fontSize: typography.fontSizes.sm, color: colors.success, fontWeight: typography.fontWeights.semibold },
  error: { fontSize: typography.fontSizes.sm, color: colors.emergency, fontWeight: typography.fontWeights.semibold },
  muted: { fontSize: typography.fontSizes.base, color: colors.slate600, textAlign: "center" },
  secondaryBtn: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radii.full, borderWidth: 1, borderColor: colors.slate300, backgroundColor: colors.white },
  secondaryText: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.semibold, color: colors.slate800 },
  disabled: { opacity: 0.45 },
  call108: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.emergency },
  flexShrink: { flexShrink: 1 },
  call108Text: { color: colors.white, fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold },
  call108Sub: { color: colors.white, fontSize: typography.fontSizes.sm },
  signOutBtn: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radii.full, borderWidth: 1, borderColor: colors.slate300, backgroundColor: colors.white },
  signOutText: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.slate800 },
});
