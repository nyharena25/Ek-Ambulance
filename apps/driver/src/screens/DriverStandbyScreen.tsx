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
import { colors, semanticColors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { driverStandbyStrings } from "../i18n/driverStandbyStrings";
import { useDriverStandbyStore } from "../state/driverStandby.store";

import { driverBookingStrings } from "../i18n/driverBookingStrings";
import { useDriverProfileStore } from "../state/driverProfile.store";
import { useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { isProfileLocked } from "../state/driverAvailability.core";

import { AppIcon, DriverMap, StandbyBookingSection } from "../components";
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
  const {
    isOnline,
    isTogglingPresence,
    presenceErrorCode,
    language,
    currentJurisdiction,
    gps,
    registeredAis125Type,
    isOfflineModalOpen,
    toggleOnlineState,
    confirmGoOffline,
    closeOfflineModal,
    setJurisdiction,
    toggleLanguage,
    recenterGps,
  } = useDriverStandbyStore();

  const driverPos = useMemo(() => ({ latitude: gps.latitude, longitude: gps.longitude }), [gps.latitude, gps.longitude]);
  const strings = driverStandbyStrings[language];
  const ais125Info = strings.ais125TierBadge[registeredAis125Type];
  const profile = useDriverProfileStore((s) => s.profile);
  // The service area is part of the profile: the chips freeze from the offer to the end of the mission.
  const profileLocked = isProfileLocked(useDriverLifecycleStore((s) => s.currentState));

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
            {/* strings.driverName is a demo identity: only a development build may show it. A real driver with no name yet sees the Profile label. */}
            <Text style={styles.pilotName}>{profile?.fullName || (__DEV__ ? strings.driverName : driverBookingStrings[language].profileEntry)}</Text>
            <View style={styles.plateRow}>
              {(profile?.vehicle.registrationNumber || __DEV__) && (
                <View style={styles.plateMiniBadge}>
                  <Text style={styles.plateMiniText}>{profile?.vehicle.registrationNumber || strings.vehiclePlate}</Text>
                </View>
              )}
              <Pressable
                onPress={onNavigateToOnboarding}
                style={styles.manageFleetBtn}
              >
                <Text style={styles.manageFleetBtnText}>AIS-125 Docs{" "}<AppIcon icon={{ set: "ion", name: "open-outline" }} size={10} /></Text>
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

            <View style={styles.redisBadge}>
              <Text style={styles.redisBadgeText}>
                {isOnline
                  ? strings.redisGeoaddActive
                  : strings.redisGeoaddInactive}
              </Text>
            </View>
          </View>

          {/* Subtitle & Radar Info */}
          {!isOnline && (
            <Text style={[styles.shiftSubNotice, styles.shiftSubNoticeOffline]}>{strings.offlineBannerStatus}</Text>
          )}

          {/* Go-online refusal, real (not_verified, kyc pending, ...) or local (no GPS fix yet) - never silent. */}
          {presenceErrorCode && (
            <Text style={[styles.shiftSubNotice, styles.shiftSubNoticeOffline]} accessibilityRole="alert">
              {presenceErrorCode === "no_gps_fix"
                ? (language === "hi" ? "स्थान की पुष्टि होने की प्रतीक्षा करें, फिर पुनः प्रयास करें।" : "Waiting for a GPS fix - try again in a moment.")
                : (language === "hi" ? `ऑनलाइन नहीं हो सके: ${presenceErrorCode}` : `Could not go online: ${presenceErrorCode}`)}
            </Text>
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
                  Updating Redis GEOADD...
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
              <Text style={styles.mapGeofenceBadge}>
                {strings.mapDispatchRadius(15)}
              </Text>
            </View>
            <Pressable style={styles.recenterIconBtn} onPress={recenterGps}>
              <Text style={styles.recenterIconText}><AppIcon icon={{ set: "mci", name: "target" }} size={11} />{" "}{strings.btnRecenterGps}</Text>
            </Pressable>
          </View>

          {/* LIVE MAP */}
          <View style={styles.mapCanvas}>
            <DriverMap style={StyleSheet.absoluteFill} driver={driverPos} headingDeg={gps.heading} controlsBottom={spacing.sm} />
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

          {/* Dual Jurisdiction Selector Chips */}
          <View style={styles.jurisdictionChipsRow}>
            <Pressable
              style={[
                styles.jurChip,
                currentJurisdiction === "UP_NOIDA" && styles.jurChipActive,
                profileLocked && styles.jurChipLocked,
              ]}
              disabled={profileLocked}
              onPress={() => setJurisdiction("UP_NOIDA")}
            >
              <View style={styles.jurChipTop}>
                <Text
                  style={[
                    styles.jurStateBadge,
                    currentJurisdiction === "UP_NOIDA" &&
                      styles.jurStateBadgeActive,
                  ]}
                >
                  UP
                </Text>
                <Text
                  style={[
                    styles.jurChipName,
                    currentJurisdiction === "UP_NOIDA" && styles.jurChipNameActive,
                  ]}
                >
                  {strings.jurisdictionNoidaName}
                </Text>
              </View>
              <Text style={styles.jurChipSub}>
                {strings.jurisdictionNoidaDistrict}
              </Text>
              <Text style={styles.jurChipStatutory}>
                {strings.jurisdictionNoidaStatutory}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.jurChip,
                currentJurisdiction === "DL_SOUTH" && styles.jurChipActive,
                profileLocked && styles.jurChipLocked,
              ]}
              disabled={profileLocked}
              onPress={() => setJurisdiction("DL_SOUTH")}
            >
              <View style={styles.jurChipTop}>
                <Text
                  style={[
                    styles.jurStateBadge,
                    currentJurisdiction === "DL_SOUTH" &&
                      styles.jurStateBadgeActive,
                  ]}
                >
                  DL
                </Text>
                <Text
                  style={[
                    styles.jurChipName,
                    currentJurisdiction === "DL_SOUTH" && styles.jurChipNameActive,
                  ]}
                >
                  {strings.jurisdictionSouthDelhiName}
                </Text>
              </View>
              <Text style={styles.jurChipSub}>
                {strings.jurisdictionSouthDelhiDistrict}
              </Text>
              <Text style={styles.jurChipStatutory}>
                {strings.jurisdictionSouthDelhiStatutory}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* REGISTERED AIS-125 TIER BADGE */}
        <View style={styles.ais125Card}>
          <View style={styles.ais125HeaderRow}>
            <View style={styles.ais125Emblem}>
              <AppIcon icon={{ set: "mci", name: "ambulance" }} size={20} color={colors.slate700} style={styles.ais125EmblemIcon} />
            </View>
            <View style={styles.ais125TitleBox}>
              <Text style={styles.ais125TierTitle}>
                {strings.ais125TierTitle}
              </Text>
              <Text style={styles.ais125CardMainTitle}>
                {ais125Info.title}
              </Text>
              <Text style={styles.ais125CardSubTitle}>
                {ais125Info.subtitle}
              </Text>
            </View>
            <View style={styles.ais125BadgePill}>
              <Text style={styles.ais125BadgeText}>{ais125Info.badge}</Text>
            </View>
          </View>

          {/* Equipment Readiness Checklist */}
          <View style={styles.equipmentBox}>
            <View style={styles.equipmentBoxHeader}>
              <Text style={styles.equipmentHeading}>
                <AppIcon icon={{ set: "mci", name: "stethoscope" }} />{" "}{strings.equipmentReadinessHeading}
              </Text>
              <View style={styles.compliancePill}>
                <Text style={styles.compliancePillText}>
                  <AppIcon icon={{ set: "ion", name: "checkmark" }} size={10} />{" "}{strings.equipmentReadyStatus}
                </Text>
              </View>
            </View>
            <Text style={styles.equipmentDetailsText}>
              {ais125Info.equipmentReady}
            </Text>
          </View>

        </View>


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

  // Telemetry Bar
  telemetryBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate950,
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
  },
  telemetryWidget: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  telemetryIconBox: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  telemetryEmoji: {
    fontSize: 14,
  },
  telemetryTextBox: {
    flex: 1,
  },
  telemetryValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  telemetryValue: {
    fontSize: 12,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  telemetryValueCritical: {
    color: colors.triageRed, // nearest existing token
  },
  telemetrySubValue: {
    fontSize: 10,
    color: colors.slate400,
  },
  telemetryMetaText: {
    fontSize: 10,
    color: colors.slate400,
  },
  telemetryDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    marginHorizontal: spacing.sm,
  },
  signalPulseDot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.triageGreen, // nearest existing token
  },

  // Critical Battery Banner
  criticalBatteryBanner: {
    flexDirection: "row",
    backgroundColor: colors.warningLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: 8,
  },
  criticalBatteryIcon: {
    fontSize: 18,
  },
  criticalBatteryTextWrap: {
    flex: 1,
  },
  criticalBatteryTitle: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: typography.fontWeights.bold,
    lineHeight: 14,
  },
  criticalBatteryAction: {
    fontSize: 10,
    color: colors.slate900,
    fontWeight: typography.fontWeights.extrabold,
    marginTop: 2,
  },

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
  redisBadge: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  redisBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  shiftSubNotice: {
    fontSize: typography.fontSizes.xs,
    lineHeight: typography.lineHeights.xs,
  },
  shiftSubNoticeOnline: {
    color: colors.slate700,
  },
  shiftSubNoticeOffline: {
    color: colors.slate600,
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
  redisTelemetryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.slate50,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  redisKeyText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  redisSyncText: {
    fontSize: 10,
    color: colors.slate600,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapSectionTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  mapGeofenceBadge: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
    backgroundColor: colors.infoLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.info,
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
  mapCanvas: {
    height: 260,
    backgroundColor: colors.slate200,
    borderRadius: radii.lg,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: colors.slate800, // nearest existing token
  },
  geofenceOverlayPill: {
    position: "absolute",
    bottom: 8,
    left: 8,
    zIndex: 20,
    elevation: 20,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  geofenceOverlayText: {
    color: semanticColors.status.statutoryBorder, // nearest existing token (no cyan in the design system)
    fontSize: 9,
    fontWeight: typography.fontWeights.bold,
  },

  // Coordinates HUD
  coordinatesHud: {
    backgroundColor: colors.slate900,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  hudRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hudCol: {
    alignItems: "center",
  },
  hudLabel: {
    fontSize: 9,
    color: colors.slate400,
    fontWeight: typography.fontWeights.semibold,
  },
  hudValue: {
    fontSize: 11,
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    marginTop: 2,
  },
  hudValueGreen: {
    fontSize: 11,
    color: colors.triageGreen, // nearest existing token
    fontWeight: typography.fontWeights.bold,
    marginTop: 2,
  },

  // Hospital List
  hospitalListWrap: {
    marginTop: 2,
    gap: 4,
  },
  hospitalListTitle: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  hospitalChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  hospitalChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  hospitalChipName: {
    fontSize: 10,
    fontWeight: typography.fontWeights.medium,
    color: colors.slate900,
  },
  hospitalChipDist: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },

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
  jurisdictionChipsRow: {
    gap: 8,
  },
  jurChip: {
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
  },
  jurChipActive: {
    borderColor: colors.info,
    backgroundColor: colors.infoLight,
  },
  jurChipLocked: {
    opacity: 0.5,
  },
  jurChipTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  jurStateBadge: {
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
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  jurChipNameActive: {
    color: colors.info,
  },
  jurChipSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
  },
  jurChipStatutory: {
    fontSize: 10,
    fontWeight: typography.fontWeights.medium,
    color: colors.slate600,
    marginTop: 2,
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
  equipmentBox: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 6,
  },
  equipmentBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  equipmentHeading: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  compliancePill: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.success,
  },
  compliancePillText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
  },
  equipmentDetailsText: {
    fontSize: 11,
    color: colors.slate700,
    lineHeight: 16,
  },
  tierSwitcherRow: {
    flexDirection: "row",
    gap: 6,
  },
  tierQuickChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
    alignItems: "center",
  },
  tierQuickChipActive: {
    backgroundColor: colors.slate900,
    borderColor: colors.slate900,
  },
  tierQuickChipText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
  tierQuickChipTextActive: {
    color: colors.white,
  },

  // Daily Statistics Section
  statsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.slate300,
    gap: spacing.md,
    ...shadows.sm,
  },
  statsTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statMetricBox: {
    width: "48%",
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 2,
  },
  statNumber: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  statNumberGreen: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.success,
  },
  statLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  statSub: {
    fontSize: 10,
    color: colors.slate600,
  },
  recentMissionCard: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4,
  },
  recentMissionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentCareBadge: {
    backgroundColor: colors.emergencyLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
  },
  recentCareText: {
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
  },
  recentMissionFare: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
  },
  recentMissionTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate900,
  },
  recentMissionDetails: {
    fontSize: 11,
    color: colors.slate700,
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
