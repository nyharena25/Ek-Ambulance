import { View, Text, StyleSheet, Pressable, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { homeStrings } from "../../src/i18n/homeStrings";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";
import { realAccessToken, usePatientAuthStore } from "../../src/state/patientAuth.store";
import { canSignOut } from "../../src/services/missionSession.core";
import { AppIcon } from "../../src/components";

export default function HomeScreen() {
  // No language switcher wired into this route yet; fixed to English until one is.
  const strings = homeStrings.en;
  const router = useRouter();
  const searching = usePatientLifecycleStore((s) => s.currentState === "requesting");
  const context = usePatientLifecycleStore((s) => s.context);

  const openMatching = () =>
    router.push({
      pathname: "/booking/matching",
      params: {
        vehicleType: context.vehicleType ?? undefined,
        jurisdiction: context.jurisdiction ?? undefined,
        lat: context.pickup ? String(context.pickup.latitude) : undefined,
        lon: context.pickup ? String(context.pickup.longitude) : undefined,
      },
    });

  // Same entry point as the onboarding screen's "Quick Emergency Access": straight into triage,
  // no prior booking state required.
  const startBooking = () => router.push("/booking/triage");
  const call108 = () => Linking.openURL("tel:108").catch(() => {});

  // Account: sign out / switch account (Supabase signOut; onAuthStateChange clears the stored session).
  const session = usePatientAuthStore((s) => s.session);
  const signOut = usePatientAuthStore((s) => s.signOut);
  const lifecycleState = usePatientLifecycleStore((s) => s.currentState);
  const signedIn = realAccessToken(session) !== null;
  const signOutAllowed = canSignOut(lifecycleState);
  const confirmSignOut = () =>
    Alert.alert(strings.signOutConfirmTitle, strings.signOutConfirmBody, [
      { text: strings.signOutCancel, style: "cancel" },
      {
        text: strings.signOut,
        style: "destructive",
        onPress: () =>
          void signOut().then((r) => {
            if (r.ok) router.replace("/(auth)/phone-entry");
            else Alert.alert(r.code === "mission_in_progress" ? strings.signOutBlocked : strings.signOutFailed);
          }),
      },
    ]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {searching && (
        <Pressable accessibilityRole="button" style={styles.banner} onPress={openMatching}>
          <Text style={styles.bannerText}>Ambulance Dispatch Active — Searching... Tap to View</Text>
        </Pressable>
      )}

      <View style={styles.container}>
        <Text style={styles.title}>{strings.screenTitle}</Text>
        <Text style={styles.subtitle}>{strings.screenSubtitle}</Text>

        {/* The screen used to end here with no action - a dead end after returning from a
            completed or cancelled mission. This is the same entry point onboarding's quick-access
            button uses, so returning here is never a step backward. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.requestButtonLabel}
          style={({ pressed }) => [styles.requestButton, pressed && styles.requestButtonPressed]}
          onPress={startBooking}
        >
          <AppIcon icon={{ set: "mci", name: "ambulance" }} size={22} color={colors.white} />
          <Text style={styles.requestButtonText}>{strings.requestButtonLabel}</Text>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel={strings.call108Label} style={styles.call108Link} onPress={call108}>
          <AppIcon icon={{ set: "ion", name: "call" }} size={16} color={colors.slate600} />
          <Text style={styles.call108Text}>{strings.call108Label}</Text>
        </Pressable>

        {signedIn && (
          <View style={styles.accountRow}>
            <Text style={styles.accountText} numberOfLines={1}>
              {strings.signedInAs} {session?.user.phone ? `+${session.user.phone.replace(/^\+/, "")}` : ""}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.signOut}
              accessibilityHint={signOutAllowed ? undefined : strings.signOutBlocked}
              accessibilityState={{ disabled: !signOutAllowed }}
              disabled={!signOutAllowed}
              style={[styles.signOutButton, !signOutAllowed && styles.signOutDisabled]}
              onPress={confirmSignOut}
            >
              <Text style={styles.signOutText}>{strings.signOut}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  banner: { position: "absolute", top: spacing.xl, left: spacing.lg, right: spacing.lg, backgroundColor: colors.emergency, borderRadius: radii.lg, padding: 14, zIndex: 10 },
  bannerText: { color: colors.white, fontWeight: "700", textAlign: "center" },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.emergency,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.slate600, // nearest existing token
    marginBottom: spacing.xl,
    textAlign: "center",
  },
  requestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.emergency,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    minHeight: 56,
    width: "100%",
    ...shadows.emergency,
  },
  requestButtonPressed: {
    backgroundColor: colors.emergencyDeep,
    transform: [{ scale: 0.99 }],
  },
  requestButtonText: {
    color: colors.white,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },
  call108Link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  call108Text: {
    color: colors.slate600,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    width: "100%",
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  accountText: { flex: 1, color: colors.slate600, fontSize: typography.fontSizes.sm },
  signOutButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.slate300 },
  signOutDisabled: { opacity: 0.4 },
  signOutText: { color: colors.slate700, fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.semibold },
});
