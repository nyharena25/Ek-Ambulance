import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, semanticColors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { driverOfflineStrings } from "../i18n/driverOfflineStrings";
import { useDriverConnectionStore } from "../state/driverConnection.store";
import { telemetryQueueService } from "../services/telemetryQueue.service";
import { syncQueuedPings } from "../services/telemetryUpload";
import { refreshDriverConnection } from "../hooks/useServerSync";

import { AppIcon } from "./AppIcon";
export interface OfflineConnectivityOverlayProps {
  /** Null when no mission is active - the SMS fallback (a real message to the real 108 desk) must never
   *  reference a fabricated mission id, so it's disabled rather than defaulted in that case. */
  missionId?: string | null;
  language?: SupportedLanguage;
  onSmsSent?: () => void;
  onSyncComplete?: (syncedCount: number) => void;
}

export default function OfflineConnectivityOverlay({
  missionId,
  language: propLanguage,
  onSmsSent,
  onSyncComplete,
}: OfflineConnectivityOverlayProps) {
  const {
    status,
    isFallbackActive,
    queuedPingsCount,
    showRestoredBanner,
    lastSyncedCount,
    language: storeLanguage,
    setQueuedPingsCount,
    dismissRestoredBanner,
  } = useDriverConnectionStore();

  const activeLanguage = propLanguage || storeLanguage || "en";
  const strings = driverOfflineStrings[activeLanguage] || driverOfflineStrings.en;

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSyncingManually, setIsSyncingManually] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState<string | null>(null);

  // If connected and no restored banner to show, remain invisible
  if (!isFallbackActive && !showRestoredBanner) {
    return null;
  }

  // Handle Carrier SMS Emergency Ping for Rural UP dead zones. Refuses without a real active mission - this
  // sends an actual SMS to the real 108 desk, which must never carry a fabricated mission id. The button
  // itself is disabled in that case (below), so reaching here with no missionId shouldn't happen; guarded
  // anyway since onPress handlers can still fire.
  // `Linking` can only ever tell us the composer opened (or didn't) - it has no visibility into whether the
  // driver actually pressed Send in the native app. That's the truth ceiling of this API without adding a
  // new native dependency (expo-sms), so the three states below are UNAVAILABLE / FAILED / "composer opened" -
  // never a claim that the SMS itself was sent.
  const handleSendSmsPing = async () => {
    if (!missionId) return;
    const payload = telemetryQueueService.formatSmsFallbackPayload(missionId);
    const smsUrl =
      Platform.OS === "ios"
        ? `sms:${payload.smsNumber}&body=${encodeURIComponent(payload.body)}`
        : `sms:${payload.smsNumber}?body=${encodeURIComponent(payload.body)}`;

    let supported: boolean;
    try {
      supported = await Linking.canOpenURL(smsUrl);
    } catch {
      setSmsFeedback(strings.smsUnavailableNotice);
      return;
    }
    if (!supported) {
      setSmsFeedback(strings.smsUnavailableNotice);
      return;
    }

    try {
      await Linking.openURL(smsUrl);
      setSmsFeedback(strings.a11ySmsSentConfirmation);
      onSmsSent?.();
    } catch {
      setSmsFeedback(strings.smsFailedNotice);
    }
  };

  // Handle Manual Sync Attempt. Queued pings belong to whichever mission was active while they were
  // buffered - with no active mission there is nothing real to attribute them to, so this is a no-op
  // rather than sending them under a fabricated id.
  const handleManualSync = async () => {
    if (!missionId) return;
    const activeMissionId = missionId;
    setIsSyncingManually(true);
    try {
      const { syncedCount, remainingCount } = await telemetryQueueService.flushQueue((pings) =>
        syncQueuedPings(activeMissionId, pings)
      );

      setIsSyncingManually(false);
      setQueuedPingsCount(remainingCount);
      // Not acknowledged by the server: the queue stays intact.
      if (remainingCount > 0) return;
      // The pings reached the database, but that says nothing about the realtime socket: the fallback state is left to the
      // connection state, which clears it only when Centrifugo is really back.
      setIsDrawerOpen(false);
      onSyncComplete?.(syncedCount);
    } catch {
      setIsSyncingManually(false);
    }
  };

  // Refreshes the session and restarts the realtime link on the same subscriptions. The banner clears on its own once the
  // connection state sees the socket back - never because the button was pressed.
  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await refreshDriverConnection();
    } finally {
      setIsReconnecting(false);
    }
  };

  // The queue's own record of its last acknowledged upload; "never" when there was none (not a guessed "1 min ago").
  const lastSuccessfulSyncAt = telemetryQueueService.getState().lastSuccessfulSyncAt;
  const bannerTitle = status === "authRequired" ? strings.bannerTitleAuthRequired : strings.bannerTitle;

  return (
    <View style={styles.pointerEventsContainer} pointerEvents="box-none">
      <SafeAreaView pointerEvents="box-none">
        {/* State 1: Reconnection Success Banner (Success Green) */}
        {showRestoredBanner && !isFallbackActive && (
          <Pressable
            style={[styles.bannerContainer, styles.restoredBannerContainer]}
            onPress={dismissRestoredBanner}
            accessibilityRole="button"
            accessibilityLabel={`${strings.restoredBannerNotice(lastSyncedCount)}. ${strings.a11yDismiss}`}
            accessibilityLiveRegion="assertive"
          >
            <View style={styles.bannerRow}>
              <View style={styles.restoredDot} />
              <View style={styles.bannerTextCol}>
                <Text style={styles.restoredTitleText}>
                  {strings.restoredBannerNotice(lastSyncedCount)}
                </Text>
              </View>
              <AppIcon icon={{ set: "ion", name: "close" }} size={14} style={styles.dismissIcon} />
            </View>
          </Pressable>
        )}

        {/* State 2: Centrifugo WebSocket Offline Persistent Banner (Amber Warning) */}
        {isFallbackActive && (
          <Pressable
            style={[styles.bannerContainer, styles.fallbackBannerContainer]}
            onPress={() => setIsDrawerOpen(true)}
            accessibilityRole="alert"
            accessibilityLabel={bannerTitle}
            accessibilityHint={strings.a11yBannerHint}
          >
            <View style={styles.bannerRow}>
              <View style={styles.antennaIconWrapper}>
                <AppIcon icon={{ set: "ion", name: "radio" }} size={18} color={colors.slate700} style={styles.antennaIcon} />
                <View style={styles.amberWarningDot} />
              </View>

              <View style={styles.bannerTextCol}>
                {/* Verbatim required string: 'Low Connectivity: Operating in SMS/Store-and-Forward Fallback' */}
                <Text style={styles.bannerTitleText} numberOfLines={2}>
                  {bannerTitle}
                </Text>
              </View>

              {/* Queued pings count badge */}
              {queuedPingsCount > 0 && (
                <View style={styles.queueCountBadge}>
                  <Text style={styles.queueCountBadgeText}>
                    {strings.pingsQueuedBadge(queuedPingsCount)}
                  </Text>
                </View>
              )}

              <AppIcon icon={{ set: "ion", name: "caret-down" }} size={12} style={styles.drawerChevron} />
            </View>
          </Pressable>
        )}
      </SafeAreaView>

      {/* Expandable Rural UP Connectivity Diagnostics Drawer */}
      <Modal
        visible={isDrawerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsDrawerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalBackdropTouch}
            onPress={() => setIsDrawerOpen(false)}
          />

          <View style={styles.drawerSheet}>
            {/* Drawer Handle */}
            <View style={styles.drawerDragHandle} />

            <ScrollView contentContainerStyle={styles.drawerScrollContent}>
              {/* Header */}
              <View style={styles.drawerHeaderRow}>
                <View>
                  <Text style={styles.drawerTitleText}>{strings.drawerTitle}</Text>
                  <Text style={styles.drawerSubtitleText}>{strings.drawerSubtitle}</Text>
                </View>
                <Pressable
                  hitSlop={10}
                  style={styles.drawerCloseButton}
                  onPress={() => setIsDrawerOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <AppIcon icon={{ set: "ion", name: "close" }} size={14} style={styles.drawerCloseButtonText} />
                </Pressable>
              </View>

              {/* Status Badge */}
              <View style={styles.statusIndicatorCard}>
                <View style={styles.statusPill}>
                  <View style={styles.statusPillDot} />
                  <Text style={styles.statusPillText}>
                    {status === "authRequired"
                      ? strings.statusAuthRequired
                      : status === "disconnected"
                        ? strings.statusDisconnected
                        : strings.statusReconnecting}
                  </Text>
                </View>
                <Text style={styles.missionIdTag}>{missionId ? `Mission: ${missionId}` : "No active mission"}</Text>
              </View>

              {/* Rural UP Dead Zone Advisory */}
              <View style={styles.noticeCard}>
                <Text style={styles.noticeCardTitle}><AppIcon icon={{ set: "ion", name: "warning" }} />{" "}{strings.upGridNoticeTitle}</Text>
                <Text style={styles.noticeCardBody}>{strings.upGridNoticeBody}</Text>
              </View>

              {/* Queue Statistics Card */}
              <View style={styles.queueStatsCard}>
                <View style={styles.queueStatsHeader}>
                  <Text style={styles.queueStatsTitle}>{strings.queueStatusTitle}</Text>
                  <View style={styles.queueLiveBadge}>
                    <Text style={styles.queueLiveBadgeText}>
                      {queuedPingsCount} PENDING
                    </Text>
                  </View>
                </View>
                <Text style={styles.queueStatsSub}>
                  {strings.queueStatusCount(queuedPingsCount)}
                </Text>

                <View style={styles.statsDivider} />

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{strings.lastSyncLabel}:</Text>
                  <Text style={styles.metaValue}>
                    {lastSuccessfulSyncAt
                      ? strings.lastSyncMinutesAgo(Math.floor((Date.now() - Date.parse(lastSuccessfulSyncAt)) / 60_000))
                      : strings.lastSyncNever}
                  </Text>
                </View>
              </View>

              {/* SMS Telemetry Fallback Section */}
              <View style={styles.smsSectionCard}>
                <View style={styles.smsSectionHeader}>
                  <AppIcon icon={{ set: "ion", name: "chatbubble-ellipses" }} size={16} color={colors.slate700} style={styles.smsSectionIcon} />
                  <Text style={styles.smsSectionTitle}>
                    {strings.smsFallbackSectionTitle}
                  </Text>
                </View>
                <Text style={styles.smsSectionBody}>
                  {strings.smsFallbackDescription}
                </Text>
                <Text style={styles.smsDeskTarget}>
                  {strings.smsDestinationDesk}
                </Text>

                {smsFeedback && (
                  <View style={[styles.smsFeedbackBox, styles.smsFeedbackRow]}>
                    <Text style={[styles.smsFeedbackText, styles.smsFeedbackTextFlex]}><AppIcon icon={{ set: "ion", name: "checkmark" }} />{" "}{smsFeedback}</Text>
                    <Pressable
                      hitSlop={12}
                      onPress={() => setSmsFeedback(null)}
                      accessibilityRole="button"
                      accessibilityLabel={strings.a11yDismiss}
                    >
                      <AppIcon icon={{ set: "ion", name: "close" }} size={14} color={colors.slate700} />
                    </Pressable>
                  </View>
                )}

                {/* Send Emergency SMS Action Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.sendSmsButton,
                    pressed && styles.sendSmsButtonPressed,
                    !missionId && styles.forceSyncButtonDisabled,
                  ]}
                  onPress={handleSendSmsPing}
                  disabled={!missionId}
                  accessibilityRole="button"
                  accessibilityLabel={strings.btnSendSmsPing}
                >
                  <Text style={styles.sendSmsButtonText}>
                    <AppIcon icon={{ set: "ion", name: "radio" }} />{" "}{strings.btnSendSmsPing}
                  </Text>
                </Pressable>
              </View>

              {/* Reconnect: session refresh + realtime restart (the force sync below only uploads the queue) */}
              <Pressable
                style={({ pressed }) => [
                  styles.forceSyncButton,
                  pressed && styles.forceSyncButtonPressed,
                  isReconnecting && styles.forceSyncButtonDisabled,
                ]}
                onPress={handleReconnect}
                disabled={isReconnecting}
                accessibilityRole="button"
                accessibilityLabel={strings.btnReconnect}
              >
                {isReconnecting ? (
                  <View style={styles.syncLoadingRow}>
                    <ActivityIndicator size="small" color={colors.white} />
                    <Text style={styles.forceSyncButtonText}>
                      {"  "}{strings.btnReconnectActive}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.forceSyncButtonText}>
                    <AppIcon icon={{ set: "ion", name: "wifi" }} />{" "}{strings.btnReconnect}
                  </Text>
                )}
              </Pressable>

              {/* Manual Force Sync Action */}
              <Pressable
                style={({ pressed }) => [
                  styles.forceSyncButton,
                  pressed && styles.forceSyncButtonPressed,
                  (isSyncingManually || !missionId) && styles.forceSyncButtonDisabled,
                ]}
                onPress={handleManualSync}
                disabled={isSyncingManually || !missionId}
                accessibilityRole="button"
                accessibilityLabel={strings.btnForceSync}
              >
                {isSyncingManually ? (
                  <View style={styles.syncLoadingRow}>
                    <ActivityIndicator size="small" color={colors.white} />
                    <Text style={styles.forceSyncButtonText}>
                      {"  "}{strings.btnForceSyncActive}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.forceSyncButtonText}>
                    <AppIcon icon={{ set: "ion", name: "refresh" }} />{" "}{strings.btnForceSync}
                  </Text>
                )}
              </Pressable>

              {/* Keep Banner Visible Action */}
              <Pressable
                style={styles.dismissDrawerAction}
                onPress={() => setIsDrawerOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.dismissDrawerActionText}>
                  {strings.btnCloseDrawer}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // In normal flow (not absolute): the banner pushes the screen down instead of covering its header.
  pointerEventsContainer: {
    backgroundColor: colors.slate950,
    zIndex: 9999,
  },

  // Base Banner Container
  bannerContainer: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.md,
  },

  // State 1: Centrifugo Offline Amber Warning Banner
  fallbackBannerContainer: {
    backgroundColor: colors.warningLight, // Amber-50 (WCAG AAA light surface)
    borderWidth: 1.5,
    borderColor: semanticColors.status.cautionBorder, // Amber-600 border for high contrast boundary
  },

  // State 2: Restored Connectivity Banner
  restoredBannerContainer: {
    backgroundColor: colors.successLight, // Green-50
    borderWidth: 1.5,
    borderColor: colors.success, // Green-700
  },

  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  antennaIconWrapper: {
    marginRight: spacing.sm,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  antennaIcon: {
    fontSize: 18,
  },
  amberWarningDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emergency, // Red pulse indicator
  },

  bannerTextCol: {
    flex: 1,
    marginRight: spacing.sm,
  },

  // Verbatim Text: 'Low Connectivity: Operating in SMS/Store-and-Forward Fallback'
  // Contrast ratio > 7.1:1 on colors.warningLight (Exceeds WCAG AAA)
  bannerTitleText: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.lineHeights.sm,
    fontWeight: typography.fontWeights.bold,
    color: semanticColors.triage.yellow.textAccessible, // Amber-900 (High contrast legible text)
    letterSpacing: -0.2,
  },

  queueCountBadge: {
    // White, not warningLight: this chip sits directly on the amber banner
    // (fallbackBannerContainer), which is already colors.warningLight - using
    // the same fill here would make the chip invisible against its own parent.
    backgroundColor: colors.white,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    marginRight: spacing.xs,
  },
  queueCountBadgeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: semanticColors.triage.yellow.textAccessible, // nearest existing high-contrast amber token
  },

  drawerChevron: {
    fontSize: 12,
    color: colors.warning,
    marginLeft: 2,
  },

  // Restored Banner Typography
  restoredDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    marginRight: spacing.sm,
  },
  restoredTitleText: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.lineHeights.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
  },
  dismissIcon: {
    fontSize: 14,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
    paddingHorizontal: spacing.xs,
  },

  // Modal / Drawer Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)", // Slate-900 with 65% opacity
    justifyContent: "flex-end",
  },
  modalBackdropTouch: {
    flex: 1,
  },
  drawerSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.base,
    paddingBottom: Platform.OS === "ios" ? 34 : spacing.xl,
    maxHeight: "85%",
    ...shadows.emergency,
  },
  drawerDragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.slate300,
    alignSelf: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  drawerScrollContent: {
    paddingBottom: spacing.xl,
  },
  drawerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  drawerTitleText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.lg,
    lineHeight: typography.lineHeights.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  drawerSubtitleText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    lineHeight: typography.lineHeights.xs,
    color: colors.slate600,
    marginTop: 2,
  },
  drawerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
  },
  drawerCloseButtonText: {
    fontSize: 14,
    color: colors.slate700,
    fontWeight: typography.fontWeights.bold,
  },

  statusIndicatorCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.slate50,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emergencyLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emergency,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.emergencyDark,
  },
  missionIdTag: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
  },

  noticeCard: {
    backgroundColor: colors.warningLight,
    borderRadius: radii.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: semanticColors.status.cautionBorder,
    marginBottom: spacing.md,
  },
  noticeCardTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: semanticColors.triage.yellow.textAccessible, // nearest existing high-contrast amber token
    marginBottom: 4,
  },
  noticeCardBody: {
    fontSize: typography.fontSizes.xs,
    lineHeight: typography.lineHeights.xs,
    color: semanticColors.triage.yellow.textAccessible,
  },

  queueStatsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate300,
    marginBottom: spacing.md,
  },
  queueStatsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueStatsTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  queueLiveBadge: {
    backgroundColor: colors.infoLight,
    borderColor: semanticColors.status.statutoryBorder,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  queueLiveBadgeText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
  },
  queueStatsSub: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.lineHeights.sm,
    color: colors.slate700,
    marginTop: 4,
  },
  statsDivider: {
    height: 1,
    backgroundColor: colors.slate200,
    marginVertical: spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLabel: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
  },
  metaValue: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },

  smsSectionCard: {
    backgroundColor: colors.slate50,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate300,
    marginBottom: spacing.lg,
  },
  smsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  smsSectionIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  smsSectionTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  smsSectionBody: {
    fontSize: typography.fontSizes.xs,
    lineHeight: typography.lineHeights.xs,
    color: colors.slate700,
    marginBottom: spacing.xs,
  },
  smsDeskTarget: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate500,
    fontStyle: "italic",
    marginBottom: spacing.sm,
  },
  smsFeedbackBox: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.xs,
    marginBottom: spacing.sm,
  },
  smsFeedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smsFeedbackTextFlex: {
    flex: 1,
  },
  smsFeedbackText: {
    fontSize: typography.fontSizes.xs,
    color: colors.success,
    fontWeight: typography.fontWeights.medium,
  },
  sendSmsButton: {
    backgroundColor: colors.slate900, // Slate-900 high contrast touch target
    minHeight: 48,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  sendSmsButtonPressed: {
    backgroundColor: colors.slate700,
  },
  sendSmsButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    letterSpacing: 0.2,
  },

  forceSyncButton: {
    backgroundColor: colors.emergency,
    minHeight: 52,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.emergency,
  },
  forceSyncButtonPressed: {
    backgroundColor: colors.emergencyDark,
  },
  forceSyncButtonDisabled: {
    opacity: 0.7,
  },
  syncLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  forceSyncButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },

  dismissDrawerAction: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  dismissDrawerActionText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate600,
    textDecorationLine: "underline",
  },
});
