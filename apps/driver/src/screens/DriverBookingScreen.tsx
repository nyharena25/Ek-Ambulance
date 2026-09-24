import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, touchTargets, typography } from "@sahayak/ui";
import { BOARD_PAGE_SIZE, DISPATCH_CONFIG, paginate } from "@sahayak/domain";
import { AppIcon } from "../components";
import EmergencyCard from "../components/EmergencyCard";
import { driverBookingStrings } from "../i18n/driverBookingStrings";
import { useNow } from "../hooks/useNow";
import { useBoardPolling, useClaimEmergency } from "../hooks/useClaimEmergency";
import { itemsInBand, useDriverBoardStore, type BoardTab } from "../state/driverBoard.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { holdsOfferOrMission } from "../state/driverAvailability.core";

export interface DriverBookingScreenProps {
  onBack: () => void;
}

const [GREEN_KM, RED_KM] = DISPATCH_CONFIG.boardRadiiKm;

/**
 * Booking: the emergencies this ambulance can take. Green is new and close (within 4 km), red is further out (within 7 km)
 * and was left unanswered near the patient. Oldest first, five to a page. While the driver holds an offer or a mission the
 * list stays readable but nothing can be accepted.
 */
export default function DriverBookingScreen({ onBack }: DriverBookingScreenProps) {
  useBoardPolling();
  const nowMs = useNow();
  const language = useDriverStandbyStore((s) => s.language);
  const isOnline = useDriverStandbyStore((s) => s.isOnline);
  const { items, clockOffsetMs, status, tab, pages, setTab, setPage } = useDriverBoardStore();
  const { claim, canAccept, claimingId, currentState } = useClaimEmergency();
  const t = driverBookingStrings[language];

  const counts: Record<BoardTab, number> = { green: itemsInBand(items, "green").length, red: itemsInBand(items, "red").length };
  const view = paginate(itemsInBand(items, tab), pages[tab], BOARD_PAGE_SIZE);
  const busy = holdsOfferOrMission(currentState);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel={t.back}>
          <AppIcon icon={{ set: "ion", name: "chevron-back" }} size={22} color={colors.slate900} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{t.title}</Text>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(["green", "red"] as const).map((key) => {
          const active = tab === key;
          const dot = key === "green" ? colors.triageGreen : colors.triageRed;
          return (
            <Pressable
              key={key}
              style={[styles.tab, active && { borderColor: dot, backgroundColor: colors.white }]}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.dot, { backgroundColor: dot }]} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{key === "green" ? t.greenTab : t.redTab}</Text>
              <View style={styles.count}>
                <Text style={styles.countText}>{counts[key]}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{tab === "green" ? t.greenHint(GREEN_KM) : t.redHint(GREEN_KM, RED_KM)}</Text>

      {busy && (
        <View style={styles.banner}>
          <AppIcon icon={{ set: "ion", name: "lock-closed" }} size={16} color={colors.warning} />
          <Text style={styles.bannerText}>{t.busyBanner}</Text>
        </View>
      )}
      {status === "error" && <Text style={styles.error}>{t.loadError}</Text>}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {!isOnline ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t.offlineTitle}</Text>
            <Text style={styles.emptyBody}>{t.offlineBody}</Text>
          </View>
        ) : view.total === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyBody}>{tab === "green" ? t.emptyGreen : t.emptyRed}</Text>
          </View>
        ) : (
          view.items.map((e) => (
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
          ))
        )}

        {view.pageCount > 1 && (
          <View style={styles.pager}>
            <Pressable
              style={[styles.pagerBtn, view.page === 0 && styles.pagerBtnOff]}
              disabled={view.page === 0}
              onPress={() => setPage(tab, view.page - 1)}
              accessibilityRole="button"
            >
              <Text style={styles.pagerText}>{t.previous}</Text>
            </Pressable>
            <Text style={styles.pageOf}>{t.pageOf(view.page + 1, view.pageCount)}</Text>
            <Pressable
              style={[styles.pagerBtn, view.page >= view.pageCount - 1 && styles.pagerBtnOff]}
              disabled={view.page >= view.pageCount - 1}
              onPress={() => setPage(tab, view.page + 1)}
              accessibilityRole="button"
            >
              <Text style={styles.pagerText}>{t.next}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.slate200 },
  back: { width: touchTargets.minTargetSize, height: touchTargets.minTargetSize, alignItems: "center", justifyContent: "center", marginLeft: -spacing.sm },
  title: { fontSize: typography.fontSizes.xl, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  tabs: { flexDirection: "row", gap: spacing.sm, padding: spacing.base, paddingBottom: spacing.sm },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: touchTargets.minTargetSize, borderRadius: radii.lg, borderWidth: 2, borderColor: colors.slate200, backgroundColor: colors.slate100 },
  dot: { width: 10, height: 10, borderRadius: radii.full },
  tabText: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.semibold, color: colors.slate700 },
  tabTextActive: { color: colors.slate900, fontWeight: typography.fontWeights.bold },
  count: { minWidth: 24, paddingHorizontal: 6, borderRadius: radii.full, backgroundColor: colors.slate900, alignItems: "center" },
  countText: { color: colors.white, fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.bold, lineHeight: 20 },
  hint: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm, fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, color: colors.slate600 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.base, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.warningLight, borderWidth: 1, borderColor: colors.warning },
  bannerText: { flex: 1, fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, color: colors.slate900, fontWeight: typography.fontWeights.semibold },
  error: { marginHorizontal: spacing.base, marginBottom: spacing.sm, fontSize: typography.fontSizes.xs, color: colors.triageRedText },
  list: { padding: spacing.base, paddingTop: spacing.xs, gap: spacing.md },
  empty: { alignItems: "center", gap: 6, paddingVertical: spacing["3xl"] },
  emptyTitle: { fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  emptyBody: { fontSize: typography.fontSizes.sm, lineHeight: typography.lineHeights.sm, color: colors.slate600, textAlign: "center" },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm },
  pagerBtn: { minHeight: touchTargets.minTargetSize, paddingHorizontal: spacing.base, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate300, alignItems: "center", justifyContent: "center" },
  pagerBtnOff: { opacity: 0.4 },
  pagerText: { fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  pageOf: { fontSize: typography.fontSizes.sm, color: colors.slate700, fontWeight: typography.fontWeights.medium },
});
