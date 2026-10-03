import { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { driverStandbyStrings } from "../i18n/driverStandbyStrings";
import { useDriverStandbyStore } from "../state/driverStandby.store";

import { driverBookingStrings } from "../i18n/driverBookingStrings";
import { driverProfileStrings } from "../i18n/driverProfileStrings";
import { useDriverProfileStore } from "../state/driverProfile.store";
import { useDriverConnectionStore } from "../state/driverConnection.store";
import { refreshDriverConnection } from "../hooks/useServerSync";

import { AppIcon, DriverMap, StandbyBookingSection } from "../components";
import { driverErrorMessage } from "../lib/driverServer.core";
export interface DriverStandbyScreenProps {
  onNavigateToOnboarding?: () => void;
  onOpenBooking?: () => void;
  onOpenProfile?: () => void;
}


export default function DriverStandbyScreen({
  onNavigateToOnboarding,
  onOpenBooking,
  onOpenProfile,
}: DriverStandbyScreenProps) {
  const connectionStatus = useDriverConnectionStore((c) => c.status);
  const {
    isOnline,
    isTogglingPresence,
    presenceErrorCode,
    language,
    gps,
    isOfflineModalOpen,
    hasRealFix,
    toggleOnlineState,
    confirmGoOffline,
    clearPresenceError,
    closeOfflineModal,
    toggleLanguage,
    recenterGps,
  } = useDriverStandbyStore();

  const driverPos = useMemo(() => ({ latitude: gps.latitude, longitude: gps.longitude }), [gps.latitude, gps.longitude]);
  const strings = driverStandbyStrings[language];
  const profile = useDriverProfileStore((s) => s.profile);
  // Only the server's registered classification is shown - never the store's pre-profile default.
  const ais125Info = profile?.ais125Type ? strings.ais125TierBadge[profile.ais125Type] : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP NAVBAR & PILOT PROFILE */}
      <View style={styles.header}>
        <Pressable
          style={styles.pilotProfileRow}
          onPress={onOpenProfile}
          accessibilityRole="button"
          accessibilityLabel={driverBookingStrings[language].profileEntry}
        >
          <View
            style={[
              styles.pilotAvatarBox,
              isOnline ? styles.pilotAvatarOnline : styles.pilotAvatarOffline,
            ]}
          >
            <AppIcon icon={{ set: "ion", name: "man" }} size={22} color={colors.slate700} style={styles.pilotAvatarIcon} />
            <View
              style={[
                styles.liveStatusDot,
                isOnline ? styles.liveStatusDotGreen : styles.liveStatusDotAmber,
              ]}
            />
          </View>
          <View style={styles.pilotTextWrap}>
            {/* Real profile data only: a driver with no name yet sees the Profile label, and no plate badge without a plate. */}
            <Text style={styles.pilotName} numberOfLines={1}>{profile?.fullName || driverBookingStrings[language].profileEntry}</Text>
            <View style={styles.plateRow}>
              {profile?.vehicle.registrationNumber ? (
                <View style={styles.plateMiniBadge}>
                  <Text style={styles.plateMiniText} numberOfLines={1}>{profile.vehicle.registrationNumber}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={onNavigateToOnboarding}
                style={styles.manageFleetBtn}
              >
                <Text style={styles.manageFleetBtnText} numberOfLines={1}>{strings.documentsButton}{" "}<AppIcon icon={{ set: "ion", name: "open-outline" }} size={10} /></Text>
              </Pressable>
            </View>
          </View>
        </Pressable>

        {/* Language Toggle Button */}
        <Pressable
          style={styles.langToggle}
          onPress={toggleLanguage}
          accessibilityRole="button"
          accessibilityLabel="Switch Language between English and Hindi"
        >
          <View
            style={[styles.langPill, language === "en" && styles.langPillActive]}
          >
            <Text
              style={[
                styles.langPillText,
                language === "en" && styles.langPillTextActive,
              ]}
            >
              EN
            </Text>
          </View>
          <View
            style={[styles.langPill, language === "hi" && styles.langPillActive]}
          >
            <Text
              style={[
                styles.langPillText,
                language === "hi" && styles.langPillTextActive,
              ]}
            >
              हिन्दी
            </Text>
          </View>
        </Pressable>
      </View>


      {/* SCROLLABLE DASHBOARD BODY */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* PROMINENT 'GO ONLINE' / 'GO OFFLINE' SHIFT ACTION CARD */}
        <View
          style={[
            styles.shiftControlCard,
            isOnline ? styles.shiftControlOnline : styles.shiftControlOffline,
          ]}
        >
          {/* Status Header */}
          <View style={styles.shiftHeaderRow}>
            <View style={styles.shiftStatusPill}>
              <View
                style={[
                  styles.radarDot,
                  isOnline ? styles.radarDotOnline : styles.radarDotOffline,
                ]}
              />
              <Text
                style={[
                  styles.shiftStatusText,
                  isOnline
                    ? styles.shiftStatusTextOnline
                    : styles.shiftStatusTextOffline,
                ]}
              >
                {isOnline ? strings.pilotStatusOnline : strings.pilotStatusOffline}
              </Text>
            </View>

          </View>

          {/* Subtitle & Radar Info */}
          {!isOnline && (
            <Text style={[styles.shiftSubNotice, styles.shiftSubNoticeOffline]}>{strings.offlineBannerStatus}</Text>
          )}

          {/* Online (business state) but the realtime socket is really down (transport state, past the grace period) or its
              credentials were refused: offers cannot arrive. Shown only on that evidence, never because the channel is quiet. */}
          {isOnline && (connectionStatus === "disconnected" || connectionStatus === "authRequired" || connectionStatus === "reconnecting") && (
            <View style={styles.noticeRow}>
              <Text style={[styles.shiftSubNotice, styles.shiftSubNoticeOffline, styles.noticeText]} accessibilityRole="alert">
                {connectionStatus === "reconnecting"
                  ? language === "hi"
                    ? "डिस्पैच से फिर से जुड़ रहा है…"
                    : "Reconnecting to dispatch…"
                  : connectionStatus === "authRequired"
                  ? language === "hi"
                    ? "सत्र की पुष्टि नहीं हो सकी - नए अनुरोध नहीं आ सकते। फिर से जोड़ें, या दोबारा साइन इन करें।"
                    : "Your session could not be verified - new requests cannot reach you. Reconnect, or sign in again."
                  : language === "hi"
                    ? "डिस्पैच से कनेक्शन नहीं है - दोबारा जुड़ने तक नए अनुरोध नहीं आ सकते। फिर से जुड़ रहा है…"
                    : "Not connected to dispatch - new requests cannot reach you until it reconnects. Reconnecting…"}
              </Text>
              <Pressable
                style={styles.noticeAction}
                onPress={() => void refreshDriverConnection()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={language === "hi" ? "फिर से जोड़ें" : "Reconnect"}
              >
                <AppIcon icon={{ set: "ion", name: "refresh" }} size={14} color={colors.slate700} />
                <Text style={styles.noticeActionText}>{language === "hi" ? "फिर से जोड़ें" : "Reconnect"}</Text>
              </Pressable>
            </View>
          )}

          {/* Go-online refusal, real (not_verified, kyc pending, ...) or local (no GPS fix yet) - never silent. */}
          {presenceErrorCode && (
            <View style={styles.noticeRow}>
              <Text style={[styles.shiftSubNotice, styles.shiftSubNoticeOffline, styles.noticeText]} accessibilityRole="alert">
                {presenceErrorCode === "no_gps_fix"
                  ? (language === "hi" ? "स्थान की पुष्टि होने की प्रतीक्षा करें, फिर पुनः प्रयास करें।" : "Waiting for a GPS fix - try again in a moment.")
                  : language === "hi"
                    ? strings.presenceRefused
                    : driverErrorMessage(presenceErrorCode)}
              </Text>
              <Pressable
                style={styles.noticeAction}
                onPress={clearPresenceError}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={language === "hi" ? "सूचना बंद करें" : "Dismiss notice"}
              >
                <AppIcon icon={{ set: "ion", name: "close" }} size={16} color={colors.slate700} />
              </Pressable>
            </View>
          )}

          {/* PROMINENT ACTION TOGGLE BUTTON */}
          <Pressable
            style={[
              styles.mainToggleButton,
              isOnline ? styles.mainToggleOnline : styles.mainToggleOffline,
              isTogglingPresence && styles.mainToggleDisabled,
            ]}
            onPress={toggleOnlineState}
            disabled={isTogglingPresence}
            accessibilityRole="button"
            accessibilityLabel={
              isOnline ? "Go Offline and pause shift" : "Go Online and start dispatch shift"
            }
          >
            {isTogglingPresence ? (
              <View style={styles.toggleLoadingRow}>
                <ActivityIndicator
                  size="small"
                  color={isOnline ? colors.emergency : colors.white}
                />
                <Text
                  style={[
                    styles.toggleBtnTitle,
                    isOnline ? styles.toggleBtnTitleOnline : styles.toggleBtnTitleOffline,
                  ]}
                >
                  {language === "hi" ? "स्थिति अपडेट हो रही है…" : "Updating status…"}
                </Text>
              </View>
            ) : (
              <View style={styles.toggleContentRow}>
                <View
                  style={[
                    styles.togglePulseCircle,
                    isOnline
                      ? styles.togglePulseCircleOnline
                      : styles.togglePulseCircleOffline,
                  ]}
                >
                  <Text style={styles.togglePowerIcon}>
                    <AppIcon
                icon={
                  isOnline
                    ? { set: "ion", name: "pause" }
                    : { set: "ion", name: "flash" }
                }
                size={20}
              />
                  </Text>
                </View>
                <View style={styles.toggleTextWrap}>
                  <Text
                    style={[
                      styles.toggleBtnTitle,
                      isOnline
                        ? styles.toggleBtnTitleOnline
                        : styles.toggleBtnTitleOffline,
                    ]}
                  >
                    {isOnline ? strings.btnGoOffline : strings.btnGoOnline}
                  </Text>
                  <Text
                    style={[
                      styles.toggleBtnSub,
                      isOnline
                        ? styles.toggleBtnSubOnline
                        : styles.toggleBtnSubOffline,
                    ]}
                    numberOfLines={1}
                  >
                    {isOnline
                      ? strings.btnGoOfflineSubtitle
                      : strings.btnGoOnlineSubtitle}
                  </Text>
                </View>
              </View>
            )}
          </Pressable>

        </View>

        {/* BOOKING BOARD: entry with a live count, and the 10 km fallback when nobody nearer answered */}
        <StandbyBookingSection onOpenBooking={onOpenBooking} />

        {/* ACTIVE SERVICE AREA MAP & LIVE GPS HUD */}
        <View style={styles.mapSectionCard}>
          <View style={styles.mapSectionHeader}>
            <View style={styles.mapTitleBox}>
              <Text style={styles.mapSectionTitle}>
                <AppIcon icon={{ set: "ion", name: "map" }} />{" "}{strings.mapSectionTitle}
              </Text>
            </View>
            <Pressable style={styles.recenterIconBtn} onPress={recenterGps}>
              <Text style={styles.recenterIconText}><AppIcon icon={{ set: "mci", name: "target" }} size={11} />{" "}{strings.btnRecenterGps}</Text>
            </Pressable>
          </View>

          {/* LIVE MAP */}
          <View style={styles.mapCanvas}>
            {/* No marker before a real fix: the store's starting coordinate is a placeholder, not where the driver is. */}
            {hasRealFix ? (
              <DriverMap style={StyleSheet.absoluteFill} driver={driverPos} headingDeg={gps.heading} controlsBottom={spacing.sm} />
            ) : (
              <View style={styles.mapWaiting}>
                <ActivityIndicator color={colors.slate500} />
                <Text style={styles.mapWaitingText}>{strings.waitingForGps}</Text>
              </View>
            )}
          </View>

        </View>

        {/* CURRENT REGISTERED JURISDICTION CARD */}
        <View style={styles.jurisdictionCard}>
          <View style={styles.jurisdictionHeaderRow}>
            <View style={styles.jurisdictionIconBox}>
              <AppIcon icon={{ set: "ion", name: "scale" }} size={18} color={colors.slate700} style={styles.jurisdictionIcon} />
            </View>
            <View style={styles.jurisdictionTitleWrap}>
              <Text style={styles.jurisdictionSectionTitle}>
                {strings.jurisdictionSectionTitle}
              </Text>
              <Text style={styles.jurisdictionSubHint}>
                {strings.jurisdictionChangeHint}
              </Text>
            </View>
          </View>

          {/* The server's service zone (get_driver_profile -> drivers.service_zone), read-only here: it is changed on the
              Profile screen through update_driver_profile. Never a client-side default. */}
          <Pressable
            style={styles.jurChip}
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel={`${strings.jurisdictionSectionTitle}: ${
              profile?.serviceZone ? driverProfileStrings[language].zone[profile.serviceZone] : strings.serviceZoneNotSet
            }`}
          >
            <View style={styles.jurChipTop}>
              {profile?.serviceZone && <Text style={[styles.jurStateBadge, styles.jurStateBadgeActive]}>{profile.serviceZone}</Text>}
              <Text style={[styles.jurChipName, profile?.serviceZone && styles.jurChipNameActive]}>
                {profile === null
                  ? strings.serviceZoneLoading
                  : profile.serviceZone
                    ? driverProfileStrings[language].zone[profile.serviceZone]
                    : strings.serviceZoneNotSet}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* REGISTERED CLASSIFICATION: the server's ais125_type and KYC status only. No equipment "readiness" - nothing on
            the server records it, so nothing here may claim it. */}
        {ais125Info && profile && (
          <View style={styles.ais125Card}>
            <View style={styles.ais125HeaderRow}>
              <View style={styles.ais125Emblem}>
                <AppIcon icon={{ set: "mci", name: "ambulance" }} size={20} color={colors.slate700} style={styles.ais125EmblemIcon} />
              </View>
              <View style={styles.ais125TitleBox}>
                <Text style={styles.ais125TierTitle}>{strings.ais125TierTitle}</Text>
                <Text style={styles.ais125CardMainTitle}>{ais125Info.title}</Text>
                <Text style={styles.ais125CardSubTitle}>{ais125Info.subtitle}</Text>
              </View>
            </View>
            <View style={styles.kycRow}>
              <View style={[styles.ais125BadgePill, profile.kycStatus === "approved" ? styles.kycPillApproved : styles.kycPillPending]}>
                <Text style={styles.ais125BadgeText} numberOfLines={1}>{strings.kycStatus[profile.kycStatus] ?? profile.kycStatus}</Text>
              </View>
            </View>
          </View>
        )}

      </ScrollView>

      {/* CONFIRM GO OFFLINE MODAL */}
      <Modal
        visible={isOfflineModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeOfflineModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.offlineModalCard}>
            <View style={styles.offlineIconBox}>
              <AppIcon icon={{ set: "ion", name: "warning" }} size={24} color={colors.slate700} style={styles.offlineIconEmoji} />
            </View>
            <Text style={styles.offlineModalTitle}>
              {strings.offlineModalTitle}
            </Text>
            <Text style={styles.offlineModalSubtitle}>
              {strings.offlineModalSubtitle}
            </Text>

            {/* Reasons List */}
            <View style={styles.offlineReasonsWrap}>
              <View style={styles.offlineReasonItem}>
                <Text style={styles.offlineReasonBullet}>•</Text>
                <Text style={styles.offlineReasonText}>
                  {strings.offlineModalReasonShiftEnd}
                </Text>
              </View>
              <View style={styles.offlineReasonItem}>
                <Text style={styles.offlineReasonBullet}>•</Text>
                <Text style={styles.offlineReasonText}>
                  {strings.offlineModalReasonBreak}
                </Text>
              </View>
              <View style={styles.offlineReasonItem}>
                <Text style={styles.offlineReasonBullet}>•</Text>
                <Text style={styles.offlineReasonText}>
                  {strings.offlineModalReasonFuel}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <Pressable
              style={styles.confirmOfflineBtn}
              onPress={confirmGoOffline}
            >
              <Text style={styles.confirmOfflineBtnText}>
                {strings.offlineModalConfirmBtn}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelOfflineBtn}
              onPress={closeOfflineModal}
            >
              <Text style={styles.cancelOfflineBtnText}>
                {strings.offlineModalCancelBtn}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    backgroundColor: colors.white,
  },
  pilotProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  pilotAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    position: "relative",
    borderWidth: 2,
  },
  pilotAvatarOnline: {
    backgroundColor: colors.emergencyLight,
    borderColor: colors.success,
  },
  pilotAvatarOffline: {
    backgroundColor: colors.slate100,
    borderColor: colors.slate300,
  },
  pilotAvatarIcon: {
    fontSize: 22,
  },
  liveStatusDot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.white,
    position: "absolute",
    bottom: -1,
    right: -1,
  },
  liveStatusDotGreen: {
    backgroundColor: colors.success,
  },
  liveStatusDotAmber: {
    backgroundColor: colors.warning,
  },
  pilotTextWrap: {
    flex: 1,
  },
  pilotName: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  plateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  plateMiniBadge: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  plateMiniText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate800,
    letterSpacing: 0.5,
  },
  manageFleetBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  manageFleetBtnText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.info,
  },
  langToggle: {
    flexDirection: "row",
    backgroundColor: colors.slate100,
    borderRadius: radii.full,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  langPillActive: {
    backgroundColor: colors.emergency,
  },
  langPillText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
  },
  langPillTextActive: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
  },

  // Critical Battery Banner

  // Scroll Area
  scrollView: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: 40,
    gap: spacing.base,
  },

  // Prominent Shift Card
  shiftControlCard: {
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 2,
    gap: spacing.md,
    ...shadows.md,
  },
  shiftControlOnline: {
    backgroundColor: colors.white,
    borderColor: colors.success,
  },
  shiftControlOffline: {
    backgroundColor: colors.white,
    borderColor: colors.slate300,
  },
  shiftHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shiftStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  radarDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },
  radarDotOnline: {
    backgroundColor: colors.success,
  },
  radarDotOffline: {
    backgroundColor: colors.slate400,
  },
  shiftStatusText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  shiftStatusTextOnline: {
    color: colors.success,
  },
  shiftStatusTextOffline: {
    color: colors.slate600,
  },
  shiftSubNotice: {
    fontSize: typography.fontSizes.xs,
    lineHeight: typography.lineHeights.xs,
  },
  shiftSubNoticeOffline: {
    color: colors.slate600,
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noticeText: {
    flex: 1,
  },
  noticeAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
  },
  noticeActionText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: "700",
    color: colors.slate700,
  },

  // Big Toggle Button
  mainToggleButton: {
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.base,
    minHeight: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  mainToggleOnline: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 2,
    borderColor: colors.emergencyBorder,
  },
  mainToggleOffline: {
    backgroundColor: colors.emergency,
    ...shadows.emergency,
  },
  mainToggleDisabled: {
    opacity: 0.7,
  },
  toggleLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toggleContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  togglePulseCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  togglePulseCircleOnline: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
  },
  togglePulseCircleOffline: {
    backgroundColor: colors.emergencyDark,
  },
  togglePowerIcon: {
    fontSize: 18,
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleBtnTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: typography.lineHeights.base,
  },
  toggleBtnTitleOnline: {
    color: colors.emergencyDark,
  },
  toggleBtnTitleOffline: {
    color: colors.white,
  },
  toggleBtnSub: {
    fontSize: 11,
    marginTop: 2,
  },
  toggleBtnSubOnline: {
    color: colors.slate700,
  },
  toggleBtnSubOffline: {
    color: "rgba(255, 255, 255, 0.9)",
  },

  // Service Area Map Card
  mapSectionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.slate300,
    gap: spacing.sm,
    ...shadows.sm,
  },
  mapSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapTitleBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapSectionTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  recenterIconBtn: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  recenterIconText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },

  // Simulated Map Canvas
  mapWaiting: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  mapWaitingText: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate600,
  },
  kycRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.sm,
  },
  kycPillApproved: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  kycPillPending: {
    backgroundColor: colors.slate100,
    borderColor: colors.slate300,
  },
  mapCanvas: {
    height: 260,
    backgroundColor: colors.slate200,
    borderRadius: radii.lg,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: colors.slate800, // nearest existing token
  },

  // Hospital List

  // Jurisdiction Section
  jurisdictionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.slate300,
    gap: spacing.md,
    ...shadows.sm,
  },
  jurisdictionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  jurisdictionIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.infoLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.info,
  },
  jurisdictionIcon: {
    fontSize: 18,
  },
  jurisdictionTitleWrap: {
    flex: 1,
  },
  jurisdictionSectionTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  jurisdictionSubHint: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
  },
  jurChip: {
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
  },
  jurChipTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  jurStateBadge: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate700,
    backgroundColor: colors.slate200,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  jurStateBadgeActive: {
    backgroundColor: colors.info,
    color: colors.white,
  },
  jurChipName: {
    flexShrink: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  jurChipNameActive: {
    color: colors.info,
  },

  // AIS-125 Tier Badge Card
  ais125Card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.emergencyBorder,
    gap: spacing.md,
    ...shadows.sm,
  },
  ais125HeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  ais125Emblem: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.emergencyLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
  },
  ais125EmblemIcon: {
    fontSize: 20,
  },
  ais125TitleBox: {
    flex: 1,
  },
  ais125TierTitle: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ais125CardMainTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  ais125CardSubTitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
  },
  ais125BadgePill: {
    backgroundColor: colors.emergencyDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  ais125BadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.base,
  },
  offlineModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    ...shadows.md,
  },
  offlineIconBox: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.warning,
  },
  offlineIconEmoji: {
    fontSize: 24,
  },
  offlineModalTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
  },
  offlineModalSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    textAlign: "center",
    lineHeight: typography.lineHeights.xs,
  },
  offlineReasonsWrap: {
    width: "100%",
    backgroundColor: colors.slate50,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  offlineReasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offlineReasonBullet: {
    color: colors.emergency,
    fontSize: 12,
  },
  offlineReasonText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate800,
  },
  confirmOfflineBtn: {
    width: "100%",
    backgroundColor: colors.emergency,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    ...shadows.emergency,
  },
  confirmOfflineBtnText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  cancelOfflineBtn: {
    paddingVertical: 10,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  cancelOfflineBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
  },
});
