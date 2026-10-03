import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, touchTargets, typography } from "@sahayak/ui";
import { AppIcon } from "../components";
import { driverProfileStrings } from "../i18n/driverProfileStrings";
import { useDriverProfileStore } from "../state/driverProfile.store";
import { getServerAdapter, useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { isProfileLocked } from "../state/driverAvailability.core";
import {
  diffProfile,
  draftFrom,
  isEmptyPatch,
  validateNewPassword,
  validateProfileDraft,
  type ProfileDraft,
  type ServiceZone,
} from "../lib/driverProfile.core";
import { changePassword, confirmPhoneChange, fetchHospitalOptions, requestPhoneChange, signOut, type HospitalOption } from "../lib/driverServer";
import { driverErrorMessage } from "../lib/driverServer.core";
import { isValidIndianMobile, toE164IndianPhone } from "../hooks/otpAuth.core";

export interface DriverProfileScreenProps {
  onBack: () => void;
  /** The driver application (onboarding), which creates the server's driver record. */
  onOpenApplication?: () => void;
}

type Notice = { kind: "ok" | "error"; text: string } | null;

const ZONES: readonly ServiceZone[] = ["DL", "UP"];

/**
 * Profile: the driver's name, phone, password, service area, hospital and the ambulance details a patient sees on accept.
 * Frozen from the moment an offer is held until the mission ends (the lifecycle machine decides; the server refuses too).
 */
export default function DriverProfileScreen({ onBack, onOpenApplication }: DriverProfileScreenProps) {
  const language = useDriverStandbyStore((s) => s.language);
  const currentState = useDriverLifecycleStore((s) => s.currentState);
  const { profile, status, errorCode, errorDetail, load, save } = useDriverProfileStore();
  const isOnline = useDriverStandbyStore((s) => s.isOnline);
  const t = driverProfileStrings[language];
  const locked = isProfileLocked(currentState);

  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [phone, setPhone] = useState({ step: "idle" as "idle" | "number" | "code", number: "", code: "", busy: false, error: null as string | null });
  const [pw, setPw] = useState({ next: "", confirm: "", busy: false, error: null as string | null });
  const [signingOut, setSigningOut] = useState(false);

  // Sign out / switch account. Go offline on the server first (while the session can still say so), then Supabase signOut;
  // the auth listener clears the server adapter and the route gate returns to phone entry. Refused mid-offer/mission.
  const doSignOut = async () => {
    if (isProfileLocked(useDriverLifecycleStore.getState().currentState)) return Alert.alert(t.signOutLocked);
    setSigningOut(true);
    const standby = useDriverStandbyStore.getState();
    if (standby.isOnline) await getServerAdapter()?.setPresence(false);
    const result = await signOut();
    setSigningOut(false);
    if (!result.ok) return Alert.alert(t.signOutFailed);
    // Local state only (the server adapter is already gone): offline, and no previous driver's profile for the next account.
    if (standby.isOnline) standby.confirmGoOffline();
    useDriverProfileStore.setState({ profile: null, status: "idle", errorCode: null });
  };
  const confirmSignOut = () =>
    Alert.alert(t.signOutConfirmTitle, t.signOutConfirmBody, [
      { text: t.cancel, style: "cancel" },
      { text: t.signOut, style: "destructive", onPress: () => void doSignOut() },
    ]);
  const signOutButton = (
    <Pressable
      style={[styles.secondaryBtn, (locked || signingOut) && styles.off]}
      disabled={locked || signingOut}
      onPress={confirmSignOut}
      accessibilityRole="button"
      accessibilityHint={locked ? t.signOutLocked : undefined}
    >
      <Text style={styles.secondaryText}>{signingOut ? t.signingOut : t.signOut}</Text>
    </Pressable>
  );

  useEffect(() => {
    void load();
  }, [load]);
  // Seed the draft once. A later profile object must not wipe what the driver is typing: a token refresh, a password change
  // and a confirmed phone change all re-read the profile. After a save the draft is re-seeded explicitly (onSave).
  useEffect(() => {
    if (profile && !draft) setDraft(draftFrom(profile));
  }, [profile, draft]);
  useEffect(() => {
    let alive = true;
    // Only the registered catalog: without a server session there are no hospitals to choose (no built-in list).
    if (getServerAdapter()) void fetchHospitalOptions().then((h) => alive && setHospitals(h));
    else setHospitals([]);
    return () => {
      alive = false;
    };
  }, []);

  if (!profile || !draft) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title={t.title} back={t.back} onBack={onBack} />
        <View style={styles.center}>
          {status === "error" && errorCode === "driver_profile_missing" ? (
            // A real server answer, not a failure: a driver account whose application (the server's driver record) does
            // not exist yet. The application is the one way to create it.
            <>
              <Text style={styles.missingTitle}>{t.missingTitle}</Text>
              <Text style={styles.body}>{t.missingBody}</Text>
              {onOpenApplication && (
                <Pressable style={styles.primaryBtn} onPress={onOpenApplication} accessibilityRole="button">
                  <Text style={styles.primaryText}>{t.completeApplication}</Text>
                </Pressable>
              )}
              {signOutButton}
            </>
          ) : status === "error" ? (
            <>
              <Text style={styles.body}>{t.loadError}</Text>
              {/* The real cause (expired session, no connection, server error), not a generic line: this is what support asks for. */}
              {errorCode === "network" || errorCode === "unauthenticated" ? <Text style={styles.body}>{driverErrorMessage(errorCode)}</Text> : null}
              <Text style={styles.body} selectable>{[errorCode, errorDetail].filter(Boolean).join(": ")}</Text>
              <Pressable style={styles.secondaryBtn} onPress={() => void load()} accessibilityRole="button">
                <Text style={styles.secondaryText}>{t.retry}</Text>
              </Pressable>
              {signOutButton}
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.emergency} />
              <Text style={styles.body}>{t.loading}</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const errors = validateProfileDraft(draft);
  const fieldError = (key: (typeof errors)[number]) => (showErrors && errors.includes(key) ? t.fieldError[key] : null);
  const regulatedOpen = profile.regulatedEditable || profile.vehicle.registrationNumber === "";
  const setVehicle = (patch: Partial<ProfileDraft["vehicle"]>) => setDraft({ ...draft, vehicle: { ...draft.vehicle, ...patch } });
  const visibleHospitals = hospitals.filter((h) => !h.zone || !draft.serviceZone || h.zone === draft.serviceZone || h.id === draft.hospitalId);

  const onSave = async () => {
    if (locked || saving) return;
    setShowErrors(true);
    if (errors.length > 0) return setNotice({ kind: "error", text: t.fieldError[errors[0]!] });
    const patch = diffProfile(profile, draft);
    if (isEmptyPatch(patch)) return setNotice({ kind: "ok", text: t.nothingToSave });
    setSaving(true);
    const result = await save(patch, hospitals.find((h) => h.id === draft.hospitalId)?.name ?? null);
    setSaving(false);
    setShowErrors(false);
    if (result.ok) {
      const saved = useDriverProfileStore.getState().profile;
      if (saved) setDraft(draftFrom(saved));
    }
    setNotice(result.ok ? { kind: "ok", text: t.saved } : { kind: "error", text: driverErrorMessage(result.code) });
  };

  const sendPhoneCode = async () => {
    if (!isValidIndianMobile(phone.number)) return setPhone({ ...phone, error: t.invalidPhone });
    setPhone({ ...phone, busy: true, error: null });
    if (!getServerAdapter()) return setPhone((p) => ({ ...p, busy: false, error: t.invalidPhone }));
    const result = await requestPhoneChange(toE164IndianPhone(phone.number));
    setPhone((p) => (result.ok ? { ...p, busy: false, step: "code" } : { ...p, busy: false, error: result.error.detail ?? driverErrorMessage(result.error.code) }));
  };

  const confirmPhone = async () => {
    setPhone({ ...phone, busy: true, error: null });
    const e164 = toE164IndianPhone(phone.number);
    if (!getServerAdapter()) return setPhone((p) => ({ ...p, busy: false, error: t.invalidPhone }));
    const result = await confirmPhoneChange(e164, phone.code);
    if (!result.ok) return setPhone((p) => ({ ...p, busy: false, error: result.error.detail ?? driverErrorMessage(result.error.code) }));
    await load(); // profiles.phone follows the auth change on the server
    setPhone({ step: "idle", number: "", code: "", busy: false, error: null });
    setNotice({ kind: "ok", text: t.phoneChanged });
  };

  const onPassword = async () => {
    const problem = validateNewPassword(pw.next, pw.confirm);
    if (problem) return setPw({ ...pw, error: t.passwordError[problem] });
    setPw({ ...pw, busy: true, error: null });
    if (!getServerAdapter()) return setPw((p) => ({ ...p, busy: false, error: t.sessionRequired }));
    const result = await changePassword(pw.next);
    if (!result.ok) return setPw((p) => ({ ...p, busy: false, error: result.error.detail ?? driverErrorMessage(result.error.code) }));
    setPw({ next: "", confirm: "", busy: false, error: null });
    setNotice({ kind: "ok", text: t.passwordUpdated });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header title={t.title} back={t.back} onBack={onBack} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {locked && (
          <View style={styles.banner}>
            <AppIcon icon={{ set: "ion", name: "lock-closed" }} size={16} color={colors.warning} />
            <Text style={styles.bannerText}>{t.lockedBanner}</Text>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title={t.statusSection}>
            <ReadRow label={t.roleLabel} value={t.roleDriver} />
            <ReadRow label={t.kycLabel} value={t.kycStatus[profile.kycStatus] ?? profile.kycStatus} />
            {profile.kycStatus === "rejected" && profile.kycRejectReason ? <ReadRow label={t.kycRejectedReason} value={profile.kycRejectReason} /> : null}
            <ReadRow label={t.availabilityLabel} value={isOnline ? t.online : t.offline} />
          </Section>

          <Section title={t.personalSection}>
            <Field label={t.fullName} value={draft.fullName} editable={!locked} onChangeText={(v) => setDraft({ ...draft, fullName: v })} error={fieldError("name")} autoCapitalize="words" />
            <Text style={styles.label}>{t.phone}</Text>
            <View style={styles.phoneRow}>
              <Text style={styles.phoneValue}>{profile.phone}</Text>
              {phone.step === "idle" && (
                <Pressable style={[styles.secondaryBtn, locked && styles.off]} disabled={locked} onPress={() => setPhone({ ...phone, step: "number" })} accessibilityRole="button">
                  <Text style={styles.secondaryText}>{t.changePhone}</Text>
                </Pressable>
              )}
            </View>
            {phone.step !== "idle" && (
              <View style={styles.subForm}>
                <Field label={t.newPhone} value={phone.number} editable={!locked && phone.step === "number"} keyboardType="number-pad" maxLength={10} onChangeText={(v) => setPhone({ ...phone, number: v.replace(/\D/g, "") })} />
                {phone.step === "code" && (
                  <Field label={t.codeLabel} value={phone.code} editable={!locked} keyboardType="number-pad" maxLength={6} onChangeText={(v) => setPhone({ ...phone, code: v.replace(/\D/g, "") })} />
                )}
                {phone.error && <Text style={styles.error}>{phone.error}</Text>}
                <View style={styles.rowGap}>
                  <Pressable style={[styles.primaryBtn, styles.flex, (locked || phone.busy) && styles.off]} disabled={locked || phone.busy} onPress={phone.step === "number" ? sendPhoneCode : confirmPhone} accessibilityRole="button">
                    <Text style={styles.primaryText}>{phone.step === "number" ? t.sendCode : t.confirmCode}</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryBtn} onPress={() => setPhone({ step: "idle", number: "", code: "", busy: false, error: null })} accessibilityRole="button">
                    <Text style={styles.secondaryText}>{t.cancel}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Section>

          <Section title={t.securitySection}>
            <Field label={t.newPassword} value={pw.next} editable={!locked} secureTextEntry autoCapitalize="none" onChangeText={(v) => setPw({ ...pw, next: v, error: null })} />
            <Field label={t.confirmPassword} value={pw.confirm} editable={!locked} secureTextEntry autoCapitalize="none" onChangeText={(v) => setPw({ ...pw, confirm: v, error: null })} />
            <Text style={styles.hint}>{t.passwordHint}</Text>
            {pw.error && <Text style={styles.error}>{pw.error}</Text>}
            <Pressable style={[styles.secondaryBtn, (locked || pw.busy || pw.next === "") && styles.off]} disabled={locked || pw.busy || pw.next === ""} onPress={onPassword} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t.updatePassword}</Text>
            </Pressable>
          </Section>

          <Section title={t.serviceSection}>
            <View style={styles.rowGap}>
              {ZONES.map((z) => {
                const active = draft.serviceZone === z;
                return (
                  <Pressable key={z} style={[styles.chip, active && styles.chipActive, locked && styles.off]} disabled={locked} onPress={() => setDraft({ ...draft, serviceZone: z })} accessibilityRole="radio" accessibilityState={{ selected: active }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.zone[z]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>{t.hospital}</Text>
            <Text style={styles.hint}>{t.hospitalHint}</Text>
            <Pressable style={[styles.option, draft.hospitalId === null && styles.optionActive, locked && styles.off]} disabled={locked} onPress={() => setDraft({ ...draft, hospitalId: null })} accessibilityRole="radio" accessibilityState={{ selected: draft.hospitalId === null }}>
              <Text style={styles.optionText}>{t.hospitalNone}</Text>
            </Pressable>
            {visibleHospitals.map((h) => (
              <Pressable key={h.id} style={[styles.option, draft.hospitalId === h.id && styles.optionActive, locked && styles.off]} disabled={locked} onPress={() => setDraft({ ...draft, hospitalId: h.id })} accessibilityRole="radio" accessibilityState={{ selected: draft.hospitalId === h.id }}>
                <Text style={styles.optionText}>{h.name}</Text>
              </Pressable>
            ))}
          </Section>

          <Section title={t.vehicleSection}>
            {profile.ais125Type && (
              <View style={styles.readRow}>
                <Text style={styles.label}>{t.tier}</Text>
                <Text style={styles.readValue}>{t.tierName[profile.ais125Type]}</Text>
              </View>
            )}
            {regulatedOpen ? (
              <>
                <Field label={t.plate} value={draft.vehicle.registrationNumber} editable={!locked} autoCapitalize="characters" onChangeText={(v) => setVehicle({ registrationNumber: v })} error={fieldError("plate")} />
                <Field label={t.makeModel} value={draft.vehicle.makeModel} editable={!locked} onChangeText={(v) => setVehicle({ makeModel: v })} error={fieldError("makeModel")} />
              </>
            ) : (
              <>
                <View style={styles.readRow}>
                  <Text style={styles.label}>{t.plate}</Text>
                  <Text style={styles.readValue}>{profile.vehicle.registrationNumber}</Text>
                </View>
                <View style={styles.readRow}>
                  <Text style={styles.label}>{t.makeModel}</Text>
                  <Text style={styles.readValue}>{profile.vehicle.makeModel || "-"}</Text>
                </View>
                <Text style={styles.hint}>{t.regulatedLocked}</Text>
              </>
            )}
            <Field label={t.color} value={draft.vehicle.color} editable={!locked} onChangeText={(v) => setVehicle({ color: v })} error={fieldError("color")} />
            <Text style={styles.label}>{t.crew}</Text>
            <View style={styles.stepper}>
              <Pressable style={[styles.stepBtn, locked && styles.off]} disabled={locked} onPress={() => setVehicle({ crewCount: Math.max(1, (draft.vehicle.crewCount ?? 2) - 1) })} accessibilityRole="button" accessibilityLabel="-">
                <AppIcon icon={{ set: "ion", name: "remove" }} size={22} color={colors.slate900} />
              </Pressable>
              <Text style={styles.stepValue}>{draft.vehicle.crewCount ?? "-"}</Text>
              <Pressable style={[styles.stepBtn, locked && styles.off]} disabled={locked} onPress={() => setVehicle({ crewCount: Math.min(12, (draft.vehicle.crewCount ?? 0) + 1) })} accessibilityRole="button" accessibilityLabel="+">
                <AppIcon icon={{ set: "ion", name: "add" }} size={22} color={colors.slate900} />
              </Pressable>
            </View>
            <Text style={styles.hint}>{fieldError("crew") ?? t.crewHint}</Text>
            <Text style={styles.hint}>{t.shownToPatient}</Text>
          </Section>

          <Section title={t.accountSection}>
            {signOutButton}
            {locked && <Text style={styles.hint}>{t.signOutLocked}</Text>}
          </Section>

          {notice && <Text style={[styles.notice, notice.kind === "error" ? styles.noticeError : styles.noticeOk]}>{notice.text}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={[styles.primaryBtn, (locked || saving) && styles.off]} disabled={locked || saving} onPress={onSave} accessibilityRole="button">
            <Text style={styles.primaryText}>{saving ? t.saving : t.save}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, back, onBack }: { title: string; back: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel={back}>
        <AppIcon icon={{ set: "ion", name: "chevron-back" }} size={22} color={colors.slate900} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
    </View>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.readValue}>{value}</Text>
    </View>
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

interface FieldProps {
  label: string;
  value: string;
  editable: boolean;
  onChangeText: (v: string) => void;
  error?: string | null;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "number-pad";
  maxLength?: number;
  autoCapitalize?: "none" | "words" | "characters";
}

function Field({ label, value, editable, onChangeText, error, secureTextEntry, keyboardType, maxLength, autoCapitalize }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputOff, error ? styles.inputError : null]}
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        accessibilityLabel={label}
        placeholderTextColor={colors.slate400}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.slate200 },
  backBtn: { width: touchTargets.minTargetSize, height: touchTargets.minTargetSize, alignItems: "center", justifyContent: "center", marginLeft: -spacing.sm },
  title: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, margin: spacing.base, marginBottom: 0, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.warningLight, borderWidth: 1, borderColor: colors.warning },
  bannerText: { flex: 1, fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, color: colors.slate900, fontWeight: typography.fontWeights.semibold },
  content: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing["3xl"] },
  section: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.slate200, padding: spacing.base, gap: spacing.md },
  sectionTitle: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  field: { gap: 6 },
  label: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.semibold, color: colors.slate700 },
  input: { minHeight: touchTargets.minTargetSize, borderWidth: 1.5, borderColor: colors.slate300, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.fontSizes.base, color: colors.slate900, backgroundColor: colors.slate50 },
  inputOff: { backgroundColor: colors.slate100, color: colors.slate600 },
  inputError: { borderColor: colors.triageRed },
  error: { fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, color: colors.triageRedText },
  hint: { fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, color: colors.slate600 },
  body: { fontSize: typography.fontSizes.sm, color: colors.slate700, textAlign: "center" },
  missingTitle: { fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900, textAlign: "center" },
  phoneRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  phoneValue: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.semibold, color: colors.slate900 },
  subForm: { gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200 },
  rowGap: { flexDirection: "row", gap: spacing.sm },
  chip: { flex: 1, minHeight: touchTargets.minTargetSize, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.slate300, alignItems: "center", justifyContent: "center", backgroundColor: colors.slate50 },
  chipActive: { borderColor: colors.info, backgroundColor: colors.infoLight },
  chipText: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.semibold, color: colors.slate800 },
  chipTextActive: { color: colors.info, fontWeight: typography.fontWeights.bold },
  option: { minHeight: touchTargets.minTargetSize, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.slate200, paddingHorizontal: spacing.md, justifyContent: "center", backgroundColor: colors.white },
  optionActive: { borderColor: colors.info, backgroundColor: colors.infoLight },
  optionText: { fontSize: typography.fontSizes.sm, color: colors.slate900, fontWeight: typography.fontWeights.medium },
  readRow: { gap: 2 },
  readValue: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.semibold, color: colors.slate900 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.base },
  stepBtn: { width: touchTargets.minTargetSize, height: touchTargets.minTargetSize, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.slate300, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  stepValue: { minWidth: 32, textAlign: "center", fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  primaryBtn: { minHeight: touchTargets.minTargetSize, borderRadius: radii.md, backgroundColor: colors.emergency, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.base },
  primaryText: { color: colors.white, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold },
  secondaryBtn: { minHeight: touchTargets.minTargetSize, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.slate300, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.base },
  secondaryText: { color: colors.slate900, fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold },
  off: { opacity: 0.4 },
  footer: { padding: spacing.base, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.slate200 },
  notice: { fontSize: typography.fontSizes.sm, lineHeight: typography.lineHeights.sm, fontWeight: typography.fontWeights.semibold, textAlign: "center" },
  noticeOk: { color: colors.success },
  noticeError: { color: colors.triageRedText },
});
