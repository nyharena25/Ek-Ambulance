import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { colors, radii, spacing, touchTargets, typography } from "@sahayak/ui";
import AppIcon from "./AppIcon";
import { useActiveMissionStore } from "../state/activeMission.store";
import { useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { canOpenMission, currentMissionCard, missionRoute, missionStageLabel } from "../state/activeMission.core";

/**
 * "Current Mission": the mission the server has assigned to this driver (not one they could accept). Built from the server
 * read only (activeMission.store); a realtime outage or a failed read keeps the last known mission, marked as refreshing.
 * "Return to Mission" opens the existing mission route for exactly that id, which re-checks it with the server.
 */
export default function CurrentMissionCard() {
  const view = useActiveMissionStore((s) => s.view);
  const refreshing = useActiveMissionStore((s) => s.refreshing);
  const currentState = useDriverLifecycleStore((s) => s.currentState);
  const activeMissionId = useDriverLifecycleStore((s) => s.activeMissionId);
  const hi = useDriverStandbyStore((s) => s.language) === "hi";
  const card = currentMissionCard(view, { currentState, activeMissionId });
  if (!card) return null;

  const retry = (
    <Pressable
      style={styles.retry}
      onPress={() => void useActiveMissionStore.getState().refresh("manual_retry")}
      disabled={refreshing}
      accessibilityRole="button"
      accessibilityLabel={hi ? "फिर से जाँचें" : "Check again"}
    >
      {refreshing ? <ActivityIndicator size="small" color={colors.slate700} /> : <AppIcon icon={{ set: "ion", name: "refresh" }} size={14} color={colors.slate700} />}
      <Text style={styles.retryText}>{hi ? "फिर से जाँचें" : "Check again"}</Text>
    </Pressable>
  );

  if (card.kind === "unknown") {
    return (
      <View style={[styles.card, styles.cardMuted]} accessibilityRole="alert">
        <Text style={styles.body}>
          {hi ? "सक्रिय मिशन की जाँच नहीं हो सकी। दोबारा कोशिश की जा रही है…" : "Could not check for an active mission. Retrying…"}
        </Text>
        {retry}
      </View>
    );
  }

  if (card.kind === "integrity") {
    return (
      <View style={[styles.card, styles.cardAlert]} accessibilityRole="alert">
        <Text style={styles.eyebrowAlert}>{hi ? "मिशन रिकॉर्ड में त्रुटि" : "MISSION RECORD ERROR"}</Text>
        <Text style={styles.body}>
          {hi
            ? "आपके खाते पर एक से अधिक सक्रिय मिशन दिख रहे हैं। आगे बढ़ने से पहले डिस्पैच से संपर्क करें।"
            : "Your account shows more than one active mission. Contact dispatch before continuing."}
        </Text>
        <Text style={styles.meta}>{card.missionIds.join("\n")}</Text>
        {card.resumableId && (
          <Pressable
            style={styles.primary}
            onPress={() => router.push({ pathname: "/mission/[id]", params: { id: card.resumableId! } })}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{hi ? "मौजूदा मिशन पर लौटें" : "Return to the mission in progress"}</Text>
          </Pressable>
        )}
        {retry}
      </View>
    );
  }

  const { mission, stale } = card;
  // The route opens only once the machine holds this mission (HYDRATE follows the read); never a button that bounces.
  const openable = canOpenMission(mission.missionId, { currentState, activeMissionId });
  return (
    <View style={styles.card} accessibilityLabel={hi ? "वर्तमान मिशन" : "Current mission"}>
      <View style={styles.headerRow}>
        <AppIcon icon={{ set: "mci", name: "ambulance" }} size={18} color={colors.emergency} />
        <Text style={styles.eyebrow}>{hi ? "वर्तमान मिशन" : "CURRENT MISSION"}</Text>
        {mission.displayRef && <Text style={styles.ref}>{mission.displayRef}</Text>}
      </View>
      <Text style={styles.stage}>{missionStageLabel(mission.status, hi ? "hi" : "en")}</Text>
      <Text style={styles.meta}>
        {(hi ? "पिकअप: " : "Pickup: ") +
          (mission.pickupAddress ?? (mission.pickup ? `${mission.pickup.latitude.toFixed(5)}, ${mission.pickup.longitude.toFixed(5)}` : hi ? "उपलब्ध नहीं" : "not available"))}
      </Text>
      {mission.destinationHospitalId && (
        <Text style={styles.meta}>{(hi ? "अस्पताल: " : "Hospital: ") + (mission.destinationName ?? (hi ? "पंजीकृत अस्पताल" : "registered hospital"))}</Text>
      )}
      <Text style={styles.note}>
        {hi ? "मिशन पूरा होने तक नई आपात स्थितियाँ नहीं दी जाएँगी।" : "New emergencies are not offered until this mission ends."}
      </Text>
      {stale && (
        <View style={styles.staleRow} accessibilityRole="alert">
          <Text style={styles.staleText}>
            {hi ? "सर्वर से संपर्क नहीं - अंतिम ज्ञात स्थिति दिखाई जा रही है, ताज़ा किया जा रहा है…" : "Server not reachable - showing the last known state, refreshing…"}
          </Text>
          {retry}
        </View>
      )}
      <Pressable
        style={({ pressed }) => [styles.primary, (pressed || !openable) && { opacity: 0.6 }]}
        onPress={() => router.push(missionRoute(mission))}
        disabled={!openable}
        accessibilityRole="button"
        accessibilityState={{ disabled: !openable }}
        accessibilityLabel={hi ? "मिशन पर लौटें" : "Return to Mission"}
      >
        <Text style={styles.primaryText}>{openable ? (hi ? "मिशन पर लौटें" : "Return to Mission") : hi ? "मिशन सिंक हो रहा है…" : "Syncing mission…"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.emergency,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  cardMuted: { borderColor: colors.slate300, borderWidth: 1 },
  cardAlert: { borderColor: colors.warning, backgroundColor: colors.warningLight },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  eyebrow: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.extrabold, color: colors.emergency, letterSpacing: 0.5, flex: 1 },
  eyebrowAlert: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.extrabold, color: colors.slate900, letterSpacing: 0.5 },
  ref: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.bold, color: colors.slate700 },
  stage: { fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  body: { fontSize: typography.fontSizes.sm, color: colors.slate800 },
  meta: { fontSize: typography.fontSizes.sm, color: colors.slate700 },
  note: { fontSize: typography.fontSizes.xs, color: colors.slate600 },
  staleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.warningLight, borderRadius: radii.sm, padding: spacing.xs },
  staleText: { flex: 1, fontSize: typography.fontSizes.xs, color: colors.slate800 },
  retry: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, alignSelf: "flex-start" },
  retryText: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.semibold, color: colors.slate700 },
  primary: {
    marginTop: spacing.sm,
    minHeight: touchTargets.emergencyActionSize,
    borderRadius: radii.md,
    backgroundColor: colors.emergency,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.white, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold },
});
