import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { homeStrings } from "../../src/i18n/homeStrings";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";
import { usePatientAuthStore } from "../../src/state/patientAuth.store";
import { resolveAddress } from "../../src/services/geocodingService";
import { formatCoordinates } from "../../src/services/mapGeo.core";
import { AppIcon } from "../../src/components";

type LocationState =
  | { kind: "checking" }
  | { kind: "ready"; label: string }
  | { kind: "needsConfirmation"; canAsk: boolean };

/**
 * The phone's own position, read without prompting (permission is only requested on "Allow location"). Nothing is sent
 * to Ek-Ambulance from here - the pickup is confirmed on the map later. The address lookup uses the same map address
 * service as the pickup screen (geocodingService); if it fails the coordinates are shown instead.
 */
function useHomeLocation() {
  const [state, setState] = useState<LocationState>({ kind: "checking" });
  const check = useCallback(async (ask: boolean) => {
    setState({ kind: "checking" });
    let point: { latitude: number; longitude: number };
    try {
      const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") return setState({ kind: "needsConfirmation", canAsk: perm.canAskAgain });
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      // Permission granted but no fix (location services off, no signal): asking again would not help.
      return setState({ kind: "needsConfirmation", canAsk: false });
    }
    try {
      const address = await resolveAddress(point);
      const label = [address.primary, address.secondary].filter(Boolean).join(", ");
      setState({ kind: "ready", label: label || formatCoordinates(point) });
    } catch {
      setState({ kind: "ready", label: formatCoordinates(point) });
    }
  }, []);
  useEffect(() => {
    void check(false);
  }, [check]);
  return { state, allow: () => void check(true) };
}

export default function HomeScreen() {
  // No language switcher wired into this route yet; fixed to English until one is.
  const strings = homeStrings.en;
  const router = useRouter();
  const lifecycleState = usePatientLifecycleStore((s) => s.currentState);
  const context = usePatientLifecycleStore((s) => s.context);
  const phone = usePatientAuthStore((s) => s.session?.user.phone);
  const location = useHomeLocation();

  // A live request takes over the screen: the patient sees it, not a second "Request" button.
  const active =
    lifecycleState === "requesting" || lifecycleState === "tracking" || lifecycleState === "transporting" || lifecycleState === "awaitingReceipt";
  const statusKey =
    lifecycleState === "tracking" && context.driverHasArrived ? "arrived" : (lifecycleState as keyof typeof strings.activeStatus);
  const driver = context.assignedDriver;
  const vehicleType = driver?.ais125Type ?? context.vehicleType;

  const openActive = () => {
    if (lifecycleState === "requesting") {
      router.push({
        pathname: "/booking/matching",
        params: {
          vehicleType: context.vehicleType ?? undefined,
          jurisdiction: context.jurisdiction ?? undefined,
          lat: context.pickup ? String(context.pickup.latitude) : undefined,
          lon: context.pickup ? String(context.pickup.longitude) : undefined,
        },
      });
    } else if (context.missionId) {
      router.push({ pathname: "/booking/[id]", params: { id: context.missionId, vehicleType: context.vehicleType ?? undefined } });
    }
  };
  const startBooking = () => router.push("/booking/triage");
  const call108 = () => void Linking.openURL("tel:108").catch(() => {});

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.appName} accessibilityRole="header">{strings.appName}</Text>
          {phone ? (
            <Text style={styles.signedIn} numberOfLines={1}>
              {strings.signedInAs} +{phone.replace(/^\+/, "")}
            </Text>
          ) : null}
        </View>
        <Pressable style={styles.avatar} onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel={strings.profileLabel} hitSlop={8}>
          <AppIcon icon={{ set: "ion", name: "person" }} size={22} color={colors.slate700} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {active ? (
          <Pressable style={styles.activeCard} onPress={openActive} accessibilityRole="button" accessibilityLabel={`${strings.activeTitle}: ${strings.activeStatus[statusKey]}`}>
            <Text style={styles.activeTitle}>{strings.activeTitle}</Text>
            <Text style={styles.activeStatus}>{strings.activeStatus[statusKey]}</Text>
            {vehicleType ? <Text style={styles.activeType} numberOfLines={2}>{strings.vehicleTypeName[vehicleType] ?? vehicleType}</Text> : null}
            {/* Pickup ETA only: in `transporting` the server's etaMinutes is to the hospital, not to the patient. */}
            {context.etaMinutes !== null && statusKey === "tracking" ? (
              <Text style={styles.activeEta}>{strings.etaMinutes(context.etaMinutes)}</Text>
            ) : null}
            {driver?.vehicleRegistration ? <InfoRow label={strings.vehicleLabel} value={driver.vehicleRegistration} /> : null}
            {driver?.displayName ? <InfoRow label={strings.driverLabel} value={driver.displayName} /> : null}
            <View style={styles.openBtn}>
              <Text style={styles.openText}>{strings.openActive}</Text>
              <AppIcon icon={{ set: "ion", name: "arrow-forward" }} size={18} color={colors.white} />
            </View>
          </Pressable>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{strings.locationTitle}</Text>
              {location.state.kind === "checking" ? (
                <View style={styles.row}>
                  <ActivityIndicator color={colors.slate500} />
                  <Text style={styles.muted}>{strings.locationChecking}</Text>
                </View>
              ) : location.state.kind === "ready" ? (
                <>
                  <View style={styles.row}>
                    <AppIcon icon={{ set: "ion", name: "checkmark-circle" }} size={20} color={colors.success} />
                    <Text style={styles.okText}>{strings.locationReady}</Text>
                  </View>
                  <Text style={styles.address} numberOfLines={2}>{location.state.label}</Text>
                </>
              ) : (
                <>
                  <View style={styles.row}>
                    <AppIcon icon={{ set: "ion", name: "warning" }} size={20} color={colors.warning} />
                    <Text style={styles.warnText}>{strings.locationNeedsConfirmation}</Text>
                  </View>
                  <Text style={styles.muted}>{strings.locationOffHint}</Text>
                  {location.state.canAsk ? (
                    <Pressable style={styles.secondaryBtn} onPress={location.allow} accessibilityRole="button">
                      <Text style={styles.secondaryText}>{strings.allowLocation}</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
              <Text style={styles.hint}>{strings.locationConfirmLater}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.requestButtonLabel}
              accessibilityHint={strings.requestSupport}
              style={({ pressed }) => [styles.requestButton, pressed && styles.requestButtonPressed]}
              onPress={startBooking}
            >
              <AppIcon icon={{ set: "mci", name: "ambulance" }} size={28} color={colors.white} />
              <Text style={styles.requestButtonText}>{strings.requestButtonLabel}</Text>
            </Pressable>
            <Text style={styles.requestSupport}>{strings.requestSupport}</Text>
          </>
        )}

        <Pressable style={styles.call108} onPress={call108} accessibilityRole="button" accessibilityLabel={`${strings.call108Title}, ${strings.call108Sub}`}>
          <AppIcon icon={{ set: "ion", name: "call" }} size={22} color={colors.emergencyDark} />
          <View style={styles.flexShrink}>
            <Text style={styles.call108Title}>{strings.call108Title}</Text>
            <Text style={styles.call108Sub}>{strings.call108Sub}</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.slate50 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  headerText: { flex: 1 },
  appName: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.extrabold, color: colors.slate900 },
  signedIn: { fontSize: typography.fontSizes.sm, color: colors.slate600 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardLabel: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate600, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  okText: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.success },
  warnText: { flexShrink: 1, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  address: { fontSize: typography.fontSizes.base, color: colors.slate900 },
  muted: { flexShrink: 1, fontSize: typography.fontSizes.sm, color: colors.slate600 },
  hint: { fontSize: typography.fontSizes.xs, color: colors.slate500 },
  secondaryBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.slate300,
    backgroundColor: colors.white,
  },
  secondaryText: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.semibold, color: colors.slate800 },
  requestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.emergency,
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  requestButtonPressed: { backgroundColor: colors.emergencyDeep, transform: [{ scale: 0.99 }] },
  requestButtonText: { flexShrink: 1, color: colors.white, fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.extrabold, letterSpacing: 0.5 },
  requestSupport: { marginTop: -spacing.sm, fontSize: typography.fontSizes.sm, color: colors.slate600, textAlign: "center" },
  activeCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.success,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  activeTitle: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate600, letterSpacing: 0.5 },
  activeStatus: { fontSize: typography.fontSizes["2xl"], fontWeight: typography.fontWeights.extrabold, color: colors.slate900 },
  activeType: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.semibold, color: colors.slate800 },
  activeEta: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.success },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoLabel: { minWidth: 64, fontSize: typography.fontSizes.sm, color: colors.slate600 },
  infoValue: { flexShrink: 1, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.semibold, color: colors.slate900 },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
    marginTop: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.success,
  },
  openText: { color: colors.white, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold },
  call108: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    backgroundColor: colors.white,
  },
  flexShrink: { flexShrink: 1 },
  call108Title: { fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.emergencyDark },
  call108Sub: { fontSize: typography.fontSizes.sm, color: colors.slate600 },
});
