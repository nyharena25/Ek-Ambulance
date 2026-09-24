import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, touchTargets, typography } from "@sahayak/ui";
import { DISPATCH_CONFIG } from "@sahayak/domain";
import AppIcon from "./AppIcon";
import EmergencyCard from "./EmergencyCard";
import { driverBookingStrings } from "../i18n/driverBookingStrings";
import { useNow } from "../hooks/useNow";
import { useBoardPolling, useClaimEmergency } from "../hooks/useClaimEmergency";
import { itemsInBand, useDriverBoardStore } from "../state/driverBoard.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";

const FALLBACK_KM = DISPATCH_CONFIG.boardRadiiKm[2];
const FALLBACK_SHOWN = 3;

/**
 * The home screen's part of the Booking board: an entry to the full page with a live count, and, when nobody within 7 km
 * has answered an emergency for two designed times, that emergency out to 10 km. Its own component so the one-second
 * timer tick re-renders this and not the whole standby screen (map included).
 */
export default function StandbyBookingSection({ onOpenBooking }: { onOpenBooking?: () => void }) {
  useBoardPolling();
  const nowMs = useNow();
  const language = useDriverStandbyStore((s) => s.language);
  const items = useDriverBoardStore((s) => s.items);
  const clockOffsetMs = useDriverBoardStore((s) => s.clockOffsetMs);
  const { claim, canAccept, claimingId } = useClaimEmergency();
  const t = driverBookingStrings[language];

  const openCount = items.filter((i) => i.band !== "fallback").length;
  const fallback = itemsInBand(items, "fallback").slice(0, FALLBACK_SHOWN);

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.entry} onPress={onOpenBooking} accessibilityRole="button" accessibilityLabel={`${t.bookingEntry}. ${t.bookingEntryHint(openCount)}`}>
        <View style={styles.entryIcon}>
          <AppIcon icon={{ set: "ion", name: "list" }} size={20} color={colors.slate900} />
        </View>
        <View style={styles.entryText}>
          <Text style={styles.entryTitle}>{t.bookingEntry}</Text>
          <Text style={styles.entryHint}>{t.bookingEntryHint(openCount)}</Text>
        </View>
        {openCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{openCount}</Text>
          </View>
        )}
        <AppIcon icon={{ set: "ion", name: "chevron-forward" }} size={18} color={colors.slate500} />
      </Pressable>

      {fallback.length > 0 && (
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>{t.fallbackTitle}</Text>
          <Text style={styles.fallbackBody}>{t.fallbackBody(FALLBACK_KM)}</Text>
          {fallback.map((e) => (
            <EmergencyCard
              key={e.missionId}
              emergency={e}
              nowMs={nowMs}
              clockOffsetMs={clockOffsetMs}
              language={language}
              canAccept={canAccept}
              accepting={claimingId === e.missionId}
              onAccept={claim}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.base },
  entry: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: touchTargets.emergencyActionSize, padding: spacing.md, backgroundColor: colors.white, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.slate300 },
  entryIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.slate100, alignItems: "center", justifyContent: "center" },
  entryText: { flex: 1 },
  entryTitle: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  entryHint: { fontSize: typography.fontSizes.xs, color: colors.slate600 },
  badge: { minWidth: 28, paddingHorizontal: 8, borderRadius: radii.full, backgroundColor: colors.emergency, alignItems: "center" },
  badgeText: { color: colors.white, fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.extrabold, lineHeight: 24 },
  fallback: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.triageRedSurface, borderWidth: 1, borderColor: colors.triageRed },
  fallbackTitle: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.triageRedText },
  fallbackBody: { fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, color: colors.slate800, marginTop: -8 },
});
