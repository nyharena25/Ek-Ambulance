import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, timerTones, touchTargets, typography } from "@sahayak/ui";
import { boardSecondsLeft, boardTimerTone, formatBoardTimer, type BoardEmergency } from "@sahayak/domain";
import AppIcon from "./AppIcon";
import { driverBookingStrings } from "../i18n/driverBookingStrings";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings";

/** `chest_pain` -> `Chest pain`. Complaints from the server are codes; a mock or free-text one passes through. */
const humanize = (s: string): string => {
  const spaced = s.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export interface EmergencyCardProps {
  emergency: BoardEmergency;
  nowMs: number;
  clockOffsetMs: number;
  language: SupportedLanguage;
  /** False while the driver holds an offer or a mission: the card is then shown but has no button to press. */
  canAccept: boolean;
  /** This card's accept is in flight. */
  accepting?: boolean;
  onAccept: (emergency: BoardEmergency) => void;
}

/**
 * One emergency, reduced to what a crew needs to decide: how urgent, how far, where, what happened, how long it has waited.
 * The timer counts to the shared deadline (one wave window after creation): green while fresh, yellow past half, orange in
 * the last 10 s, red once negative.
 */
function EmergencyCard({ emergency: e, nowMs, clockOffsetMs, language, canAccept, accepting, onAccept }: EmergencyCardProps) {
  const t = driverBookingStrings[language];
  const secondsLeft = boardSecondsLeft(e.dueAt, nowMs, clockOffsetMs);
  const tone = timerTones[boardTimerTone(secondsLeft)];
  const complaint = e.patientSummary?.primaryComplaint;
  const flags = (e.patientSummary?.derivedFlags ?? []).slice(0, 2);
  const who = t.ageSex(e.patientSummary?.ageBand, e.patientSummary?.sex);
  const timerLabel = secondsLeft < 0 ? `${t.timerOverdue} ${formatBoardTimer(secondsLeft).slice(1)}` : `${formatBoardTimer(secondsLeft)} ${t.timerLeft}`;

  return (
    <View style={[styles.card, { borderLeftColor: tone.fill }]} accessibilityLabel={`${complaint ? humanize(complaint) : t.unknownComplaint}, ${t.km(e.distanceKm)}, ${timerLabel}`}>
      <View style={styles.topRow}>
        {e.urgency && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t.urgency[e.urgency]}</Text>
          </View>
        )}
        {e.requiredVehicleType && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t.vehicle[e.requiredVehicleType]}</Text>
          </View>
        )}
        <View style={styles.spacer} />
        <View style={[styles.timer, { backgroundColor: tone.surface, borderColor: tone.fill }]}>
          <AppIcon icon={{ set: "ion", name: "timer-outline" }} size={14} color={tone.text} />
          <Text style={[styles.timerText, { color: tone.text }]}>{formatBoardTimer(secondsLeft)}</Text>
        </View>
      </View>

      <Text style={[styles.complaint, !complaint && styles.complaintMissing]} numberOfLines={2}>
        {complaint ? humanize(complaint) : t.unknownComplaint}
      </Text>

      {(flags.length > 0 || who !== "") && (
        <View style={styles.flagRow}>
          {flags.map((f) => (
            <View key={f} style={styles.flag}>
              <Text style={styles.flagText}>{humanize(f)}</Text>
            </View>
          ))}
          {who !== "" && <Text style={styles.who}>{who}</Text>}
        </View>
      )}

      <View style={styles.whereRow}>
        <AppIcon icon={{ set: "ion", name: "location" }} size={16} color={colors.slate600} />
        <Text style={styles.address} numberOfLines={2}>
          {e.pickup.address ?? `${e.pickup.latitude.toFixed(4)}, ${e.pickup.longitude.toFixed(4)}`}
        </Text>
        <Text style={styles.distance}>{t.km(e.distanceKm)}</Text>
      </View>

      {canAccept || accepting ? (
        <Pressable
          style={[styles.accept, accepting && styles.acceptBusy]}
          onPress={() => onAccept(e)}
          disabled={accepting}
          accessibilityRole="button"
          accessibilityLabel={`${t.accept}: ${complaint ? humanize(complaint) : t.unknownComplaint}`}
        >
          <Text style={styles.acceptText}>{accepting ? t.accepting : t.accept}</Text>
        </Pressable>
      ) : (
        // Not a Pressable: while the driver holds a mission the card can be read but there is nothing to tap.
        <View style={styles.viewOnly} accessibilityState={{ disabled: true }}>
          <Text style={styles.viewOnlyText}>{t.viewOnly}</Text>
        </View>
      )}
    </View>
  );
}

export default memo(EmergencyCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderLeftWidth: 6,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  spacer: { flex: 1 },
  chip: { backgroundColor: colors.slate100, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.bold, color: colors.slate800 },
  timer: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  timerText: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.extrabold, fontVariant: ["tabular-nums"] },
  complaint: { fontSize: typography.fontSizes.lg, lineHeight: typography.lineHeights.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  complaintMissing: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.medium, color: colors.slate600 },
  flagRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  flag: { backgroundColor: colors.triageRedSurface, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 2 },
  flagText: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.semibold, color: colors.triageRedText },
  who: { fontSize: typography.fontSizes.xs, color: colors.slate700, fontWeight: typography.fontWeights.medium },
  whereRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  address: { flex: 1, fontSize: typography.fontSizes.sm, lineHeight: typography.lineHeights.sm, color: colors.slate800 },
  distance: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.extrabold, color: colors.slate900 },
  accept: {
    minHeight: touchTargets.minTargetSize,
    borderRadius: radii.md,
    backgroundColor: colors.emergency,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBusy: { opacity: 0.6 },
  acceptText: { color: colors.white, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold },
  viewOnly: {
    minHeight: 40,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    alignItems: "center",
    justifyContent: "center",
  },
  viewOnlyText: { color: colors.slate600, fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.semibold },
});
