import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
  StatusBar,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { ConfirmPatientOnboardPayload, type GeoPoint } from "@sahayak/domain";
import { driverOnSceneStrings, TraumaCentreItem } from "../i18n/driverOnSceneStrings";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { EMERGENCY_TYPES, hospitalsFor, type EmergencyType } from "../hooks/hospitalSelection.core";
import { useDriverStandbyStore } from "../state/driverStandby.store";

import { AppIcon, openGoogleMapsNavigation } from "../components";
import { IS_DEV } from "../config/env";

const EMERGENCY_LABELS: Record<EmergencyType, { en: string; hi: string }> = {
  trauma: { en: "Trauma", hi: "ट्रॉमा" },
  cardiac: { en: "Heart", hi: "हृदय" },
  stroke: { en: "Stroke", hi: "स्ट्रोक" },
  burns: { en: "Burns", hi: "जलना" },
  general: { en: "Other", hi: "अन्य" },
};

// __DEV__ only: a release build reaching this screen without real pickup params (stale link / reload) falls
// back to the driver's own current position rather than a fixed, confidently-wrong location.
const DEMO_PICKUP: GeoPoint = { latitude: 28.5355, longitude: 77.391 };
export interface OnSceneCareScreenProps {
  missionId?: string;
  /** The real, already-validated driver id from the parent route - never re-derived or hardcoded here. */
  driverId?: string;
  pickupCoordinates?: GeoPoint;
  initialLanguage?: SupportedLanguage;
  onConfirmPatientOnboard?: (payload: ConfirmPatientOnboardPayload) => void;
  onProceedToTransportNavigation?: (hospital: TraumaCentreItem) => void;
  onBack?: () => void;
}

export default function OnSceneCareScreen({
  missionId = "MSN-2026-8819",
  driverId,
  pickupCoordinates: pickupCoordinatesProp,
  initialLanguage = "en",
  onConfirmPatientOnboard,
  onProceedToTransportNavigation,
  onBack,
}: OnSceneCareScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const driverGps = useDriverStandbyStore((s) => s.gps);
  const pickupCoordinates = pickupCoordinatesProp ?? (IS_DEV ? DEMO_PICKUP : { latitude: driverGps.latitude, longitude: driverGps.longitude });

  // Vitals State
  // D-UX-05: nothing is pre-set. A blank reading is "not entered" (null) and is never coerced to 0 or shown as a plausible
  // default; only readings the crew actually entered are sent with the mission.
  const [pulse, setPulse] = useState<number | null>(null);
  const [spO2, setSpO2] = useState<number | null>(null);
  const [systolic, setSystolic] = useState<number | null>(null);
  const [diastolic, setDiastolic] = useState<number | null>(null);
  const [gcsScore, setGcsScore] = useState<number | null>(null);

  // Immediate Departure Bypass (Load & Go)
  const [isBypassActive, setIsBypassActive] = useState(false);

  // Hospital selection: only centres that treat the chosen emergency, nearest to the pickup first
  const [emergency, setEmergency] = useState<EmergencyType>("trauma");
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  // Handoff Alert Modal
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);

  const strings = driverOnSceneStrings[language];
  const nearby = useMemo(() => hospitalsFor(emergency, pickupCoordinates), [emergency, pickupCoordinates.latitude, pickupCoordinates.longitude]);
  const selectedHospital = (nearby.find((n) => n.hospital.id === selectedHospitalId) ?? nearby[0])!.hospital;

  // Mean Arterial Pressure (MAP) computation
  const mapValue = systolic !== null && diastolic !== null ? Math.round(diastolic + (systolic - diastolic) / 3) : null;
  const toNumberOrNull = (val: string): number | null => (val.trim() === "" || !Number.isFinite(Number(val)) ? null : Number(val));

  const handleStartTransport = () => {
    const entered = {
      ...(pulse !== null ? { pulse } : {}),
      ...(spO2 !== null ? { spO2 } : {}),
      ...(systolic !== null ? { systolic } : {}),
      ...(diastolic !== null ? { diastolic } : {}),
      ...(gcsScore !== null ? { gcs: gcsScore } : {}),
    };
    const payload: ConfirmPatientOnboardPayload = {
      missionId,
      driverId: driverId ?? "",
      destination: selectedHospital.coordinates,
      onboardAt: new Date().toISOString(),
      ...(Object.keys(entered).length > 0 ? { vitals: entered } : {}),
      emergencyType: emergency,
      bypass: isBypassActive,
    };

    if (onConfirmPatientOnboard) {
      onConfirmPatientOnboard(payload);
    }

    setIsHandoffModalOpen(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTitleBox}>
          <View style={styles.stateBadgeRow}>
            <View style={styles.pulseGreenDot} />
            <Text style={styles.stateBadgeText}>{strings.stateBadge}</Text>
          </View>
          <Text style={styles.headerTitle}>{strings.screenTitle}</Text>
          <Text style={styles.headerSub}>{strings.patientIdLabel(missionId)}</Text>
        </View>

        <Pressable
          style={styles.langPill}
          onPress={() => setLanguage(language === "en" ? "hi" : "en")}
        >
          <Text style={styles.langPillText}>
            {language === "en" ? "हिन्दी" : "EN"}
          </Text>
        </Pressable>
      </View>

      {/* SCROLLABLE CARE & TRIAGE CONTENT */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* IMMEDIATE DEPARTURE BYPASS (LOAD & GO) CARD */}
        <View
          style={[
            styles.bypassCard,
            isBypassActive && styles.bypassCardActive,
          ]}
        >
          <View style={styles.bypassHeaderRow}>
            <View style={styles.bypassIconBox}>
              <AppIcon icon={{ set: "ion", name: "flash" }} size={18} color={colors.slate700} style={styles.bypassIcon} />
            </View>
            <View style={styles.bypassTextBox}>
              <Text style={styles.bypassTitle}>{strings.bypassToggleLabel}</Text>
              <Text style={styles.bypassSub}>{strings.bypassToggleSub}</Text>
            </View>
            <Switch
              value={isBypassActive}
              onValueChange={setIsBypassActive}
              trackColor={{ false: colors.slate300, true: colors.emergency }}
              thumbColor={colors.white}
            />
          </View>

          {isBypassActive && (
            <View style={styles.bypassActiveBanner}>
              <Text style={styles.bypassActiveTitle}>
                {strings.bypassActiveNoticeTitle}
              </Text>
              <Text style={styles.bypassActiveDesc}>
                {strings.bypassActiveNoticeDesc}
              </Text>
            </View>
          )}
        </View>

        {/* QUICK VITALS ENTRY FORM (IF NOT BYPASSED) */}
        <View
          style={[
            styles.vitalsSectionCard,
            isBypassActive && styles.vitalsSectionDimmed,
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <AppIcon icon={{ set: "mci", name: "stethoscope" }} size={22} color={colors.slate700} style={styles.sectionIcon} />
            <View style={styles.sectionTitleWrap}>
              <Text style={styles.sectionTitle}>
                {strings.vitalsSectionTitle}
              </Text>
              <Text style={styles.sectionSub}>
                {strings.vitalsSectionSubtitle}
              </Text>
            </View>
          </View>

          {/* Vitals Grid (Pulse & SpO2) */}
          <View style={styles.vitalsGridRow}>
            {/* 1. Pulse / Heart Rate */}
            <View style={styles.vitalCard}>
              <View style={styles.vitalHeaderRow}>
                <Text style={styles.vitalLabel}>{strings.pulseLabel}</Text>
                <Text style={styles.vitalUnit}>{strings.pulseUnit}</Text>
              </View>
              <View style={styles.vitalValueRow}>
                <Text style={styles.vitalLargeValue}>{pulse ?? "--"}</Text>
                <View style={styles.quickStepButtons}>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setPulse((p) => Math.max(30, (p ?? 80) - 5))}
                  >
                    <Text style={styles.stepBtnText}>-5</Text>
                  </Pressable>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setPulse((p) => Math.min(220, (p ?? 80) + 5))}
                  >
                    <Text style={styles.stepBtnText}>+5</Text>
                  </Pressable>
                </View>
              </View>
              {pulse !== null && (
                <Text style={styles.vitalStatusGood}>
                  {pulse > 100
                    ? strings.pulseStatusTachycardia
                    : pulse < 60
                    ? strings.pulseStatusBradycardia
                    : strings.pulseStatusNormal}
                </Text>
              )}
            </View>

            {/* 2. SpO2 Oxygen */}
            <View style={styles.vitalCard}>
              <View style={styles.vitalHeaderRow}>
                <Text style={styles.vitalLabel}>{strings.spO2Label}</Text>
                <Text style={styles.vitalUnit}>{strings.spO2Unit}</Text>
              </View>
              <View style={styles.vitalValueRow}>
                <Text style={styles.vitalLargeValue}>{spO2 === null ? "--" : `${spO2}%`}</Text>
                <View style={styles.quickStepButtons}>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setSpO2((s) => Math.max(50, (s ?? 95) - 1))}
                  >
                    <Text style={styles.stepBtnText}>-1</Text>
                  </Pressable>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setSpO2((s) => Math.min(100, (s ?? 95) + 1))}
                  >
                    <Text style={styles.stepBtnText}>+1</Text>
                  </Pressable>
                </View>
              </View>
              {spO2 !== null && (
                <Text
                  style={
                    spO2 < 90 ? styles.vitalStatusCritical : styles.vitalStatusGood
                  }
                >
                  {spO2 < 90 ? strings.spO2StatusHypoxia : strings.spO2StatusNormal}
                </Text>
              )}
            </View>
          </View>

          {/* Blood Pressure Row */}
          <View style={styles.bpContainer}>
            <View style={styles.vitalHeaderRow}>
              <Text style={styles.vitalLabel}>{strings.bpLabel}</Text>
              <Text style={styles.mapPillText}>MAP: {mapValue === null ? "--" : mapValue} mmHg</Text>
            </View>

            <View style={styles.bpInputsRow}>
              <View style={styles.bpCol}>
                <Text style={styles.bpSubLabel}>{strings.systolicLabel}</Text>
                <TextInput
                  style={styles.bpInput}
                  value={systolic === null ? "" : String(systolic)}
                  onChangeText={(val) => setSystolic(toNumberOrNull(val))}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
              <Text style={styles.bpDivider}>/</Text>
              <View style={styles.bpCol}>
                <Text style={styles.bpSubLabel}>{strings.diastolicLabel}</Text>
                <TextInput
                  style={styles.bpInput}
                  value={diastolic === null ? "" : String(diastolic)}
                  onChangeText={(val) => setDiastolic(toNumberOrNull(val))}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
              <View style={styles.bpSummaryPill}>
                <Text style={styles.bpSummaryText}>
                  {systolic ?? "--"}/{diastolic ?? "--"} mmHg
                </Text>
              </View>
            </View>
          </View>

          {/* Glasgow Coma Scale (GCS) */}
          <View style={styles.gcsContainer}>
            <View style={styles.vitalHeaderRow}>
              <Text style={styles.vitalLabel}>{strings.gcsLabel}</Text>
              {gcsScore !== null && (
                <View style={styles.gcsScoreBadge}>
                  <Text style={styles.gcsScoreBadgeText}>
                    {strings.gcsTotalLabel(gcsScore)}
                  </Text>
                </View>
              )}
            </View>

            {/* Quick GCS Presets */}
            <View style={styles.gcsPresetChipsRow}>
              {[
                { score: 15, label: "15 Normal" },
                { score: 13, label: "13 Mild" },
                { score: 9, label: "9 Moderate" },
                { score: 3, label: "3 Severe" },
              ].map((item) => (
                <Pressable
                  key={item.score}
                  style={[
                    styles.gcsPresetChip,
                    gcsScore === item.score && styles.gcsPresetChipActive,
                  ]}
                  onPress={() => setGcsScore(item.score)}
                >
                  <Text
                    style={[
                      styles.gcsPresetChipText,
                      gcsScore === item.score && styles.gcsPresetChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* NEAREST HOSPITALS FOR THIS EMERGENCY */}
        <View style={styles.traumaSectionCard}>
          <Text style={styles.sectionTitle}>{language === "hi" ? "आपातकाल का प्रकार" : "Type of emergency"}</Text>
          <View style={styles.categoryFiltersRow}>
            {EMERGENCY_TYPES.map((type) => (
              <Pressable
                key={type}
                accessibilityRole="radio"
                accessibilityState={{ selected: emergency === type }}
                style={[styles.catFilterChip, emergency === type && styles.catFilterChipActive]}
                onPress={() => {
                  setEmergency(type);
                  setSelectedHospitalId(null);
                }}
              >
                <Text style={[styles.catFilterText, emergency === type && styles.catFilterTextActive]}>
                  {EMERGENCY_LABELS[type][language]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionSub}>
            {language === "hi" ? "मरीज के स्थान से सबसे नज़दीकी अस्पताल" : "Nearest hospitals from the patient's location"}
          </Text>

          <View style={styles.hospitalsList}>
            {nearby.map(({ hospital, km }, index) => {
              const isSelected = hospital.id === selectedHospital.id;
              return (
                <Pressable
                  key={hospital.id}
                  style={[styles.hospitalCard, isSelected && styles.hospitalCardSelected]}
                  onPress={() => setSelectedHospitalId(hospital.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.hospTopRow}>
                    <View style={styles.hospRankBadge}>
                      <Text style={styles.hospRankText}>#{index + 1}</Text>
                    </View>
                    <View style={styles.hospNameBox}>
                      <Text style={[styles.hospNameText, isSelected && styles.hospNameTextSelected]}>
                        {language === "hi" ? hospital.hindiName : hospital.name}
                      </Text>
                      <Text style={styles.hospLevelText}>
                        {km.toFixed(1)} km · {language === "hi" ? hospital.hindiTraumaLevel : hospital.traumaLevel}
                      </Text>
                    </View>
                    <View style={styles.radioOuter}>{isSelected && <View style={styles.radioInner} />}</View>
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.directionsBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => void openGoogleMapsNavigation(hospital.coordinates, pickupCoordinates)}
                    accessibilityRole="button"
                    accessibilityLabel={`${language === "hi" ? "Google Maps में रास्ता" : "Directions in Google Maps"}: ${hospital.name}`}
                  >
                    <AppIcon icon={{ set: "mci", name: "google-maps" }} size={20} color={colors.white} />
                    <Text style={styles.directionsBtnText}>
                      {language === "hi" ? "Google Maps में रास्ता" : "Directions in Google Maps"}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* STICKY BOTTOM ACTION BAR */}
      <View style={styles.bottomBar}>
        <Text style={styles.destinationSummaryHospital}>
          {language === "hi" ? selectedHospital.hindiName : selectedHospital.name}
        </Text>

        <Pressable
          style={styles.startTransportBtn}
          onPress={handleStartTransport}
          accessibilityRole="button"
        >
          <Text style={styles.startTransportBtnText}>
            {strings.btnStartTransport}
          </Text>
        </Pressable>
      </View>

      {/* PRE-ARRIVAL HANDOFF CONFIRMATION MODAL */}
      <Modal
        visible={isHandoffModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsHandoffModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.handoffModalCard}>
            <View style={styles.handoffBadgeCircle}>
              <AppIcon icon={{ set: "ion", name: "checkmark" }} size={28} style={styles.handoffCheckIcon} />
            </View>

            <Text style={styles.handoffModalTitle}>
              {strings.handoffModalTitle}
            </Text>
            <Text style={styles.handoffModalSub}>
              {strings.handoffModalSubtitle}
            </Text>

            <View style={styles.wardReservationBox}>
              <Text style={styles.reservedHospitalName}>
                {language === "hi"
                  ? selectedHospital.hindiName
                  : selectedHospital.name}
              </Text>
            </View>

            <Text style={styles.traumaAlertNotice}>
              {strings.traumaTeamAlertedNotice}
            </Text>

            <Pressable
              style={styles.launchTransportBtn}
              onPress={() => {
                setIsHandoffModalOpen(false);
                if (onProceedToTransportNavigation) {
                  onProceedToTransportNavigation(selectedHospital);
                } else if (onBack) {
                  onBack();
                }
              }}
            >
              <Text style={styles.launchTransportBtnText}>
                {strings.proceedToTransportRoute}
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
  headerTitleBox: {
    flex: 1,
  },
  stateBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  pulseGreenDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.success,
  },
  stateBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.success,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  headerSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
  },
  langPill: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  langPillText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
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

  // Bypass Card
  bypassCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    gap: spacing.sm,
    ...shadows.sm,
  },
  bypassCardActive: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
  },
  bypassHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bypassIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
  },
  bypassIcon: {
    fontSize: 18,
  },
  bypassTextBox: {
    flex: 1,
  },
  bypassTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  bypassSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2,
  },
  bypassActiveBanner: {
    backgroundColor: colors.white,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.warning,
    gap: 2,
  },
  bypassActiveTitle: {
    fontSize: 11,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.warning,
  },
  bypassActiveDesc: {
    fontSize: 10,
    color: colors.slate800,
    lineHeight: 14,
  },

  // Vitals Section
  vitalsSectionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.slate300,
    gap: spacing.md,
    ...shadows.sm,
  },
  vitalsSectionDimmed: {
    opacity: 0.6,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIcon: {
    fontSize: 22,
  },
  sectionTitleWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  sectionSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
  },

  // Vitals Grid
  vitalsGridRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  vitalCard: {
    flex: 1,
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
  },
  vitalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  vitalLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  vitalUnit: {
    fontSize: 10,
    color: colors.slate600,
    fontWeight: typography.fontWeights.semibold,
  },
  vitalValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  vitalLargeValue: {
    fontSize: 28,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  quickStepButtons: {
    flexDirection: "row",
    gap: 4,
  },
  stepBtn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepBtnText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  vitalStatusGood: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.success,
  },
  vitalStatusCritical: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergency,
  },

  // BP
  bpContainer: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 8,
  },
  mapPillText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
    backgroundColor: colors.infoLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  bpInputsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bpCol: {
    flex: 1,
  },
  bpSubLabel: {
    fontSize: 10,
    color: colors.slate600,
    marginBottom: 4,
  },
  bpInput: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
  },
  bpDivider: {
    fontSize: 24,
    color: colors.slate400,
    marginTop: 14,
  },
  bpSummaryPill: {
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate300,
    marginTop: 14,
  },
  bpSummaryText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },

  // GCS
  gcsContainer: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 8,
  },
  gcsScoreBadge: {
    backgroundColor: colors.slate900,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  gcsScoreBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
  },
  gcsPresetChipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  gcsPresetChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    alignItems: "center",
  },
  gcsPresetChipActive: {
    backgroundColor: colors.emergency,
    borderColor: colors.emergency,
  },
  gcsPresetChipText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  gcsPresetChipTextActive: {
    color: colors.white,
  },

  // Ranked Trauma Centres
  traumaSectionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.slate300,
    gap: spacing.md,
    ...shadows.sm,
  },
  categoryFiltersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  catFilterChip: {
    minHeight: 44,
    paddingHorizontal: spacing.base,
    justifyContent: "center",
    borderRadius: radii.sm,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
    alignItems: "center",
  },
  catFilterChipActive: {
    backgroundColor: colors.slate900,
    borderColor: colors.slate900,
  },
  catFilterText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
  catFilterTextActive: {
    color: colors.white,
  },
  hospitalsList: {
    gap: spacing.sm,
  },
  hospitalCard: {
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 6,
  },
  hospitalCardSelected: {
    borderColor: colors.emergency,
    backgroundColor: colors.emergencyLight,
    borderWidth: 2,
  },
  hospitalCardDisabled: {
    opacity: 0.5,
  },
  atCapacityBadge: {
    backgroundColor: colors.emergencyDark,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  atCapacityBadgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.white,
    letterSpacing: 0.3,
  },
  hospTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hospRankBadge: {
    backgroundColor: colors.slate200,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  hospRankText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate800,
  },
  hospNameBox: {
    flex: 1,
    flexShrink: 1,
  },
  hospNameText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  hospNameTextSelected: {
    color: colors.emergencyDark,
  },
  hospLevelText: {
    fontSize: 12,
    color: colors.slate600,
  },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radii.md,
    backgroundColor: colors.info,
  },
  directionsBtnText: {
    flexShrink: 1,
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.slate400,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    backgroundColor: colors.emergency,
  },
  hospEtaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hospEtaText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  catPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  catPillGovt: {
    backgroundColor: colors.infoLight,
  },
  catPillPrivate: {
    backgroundColor: colors.slate200,
  },
  catPillText: {
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  catPillTextGovt: {
    color: colors.info,
  },
  catPillTextPrivate: {
    color: colors.slate800,
  },
  capacityGrid: {
    flexDirection: "row",
    backgroundColor: colors.white,
    padding: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  capacityBox: {
    flex: 1,
    alignItems: "center",
  },
  capacityNum: {
    fontSize: 11,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate900,
  },
  capacitySub: {
    fontSize: 9,
    color: colors.slate600,
  },
  heldCountersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  heldBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  heldBadgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeights.bold,
    color: colors.warning,
  },
  inboundUnitsText: {
    fontSize: 9,
    color: colors.slate600,
  },
  selectedConfirmedBar: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignItems: "center",
    marginTop: 4,
  },
  selectedConfirmedBarText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },

  // Bottom Bar
  bottomBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? 24 : spacing.base,
    borderTopWidth: 2,
    borderTopColor: colors.slate200,
    gap: 8,
    ...shadows.md,
  },
  destinationSummaryBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  destinationSummaryLabel: {
    fontSize: 11,
    color: colors.slate600,
  },
  destinationSummaryHospital: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },
  startTransportBtn: {
    backgroundColor: colors.emergency,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    ...shadows.emergency,
  },
  startTransportBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.extrabold,
  },
  startTransportBtnSub: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 10,
    marginTop: 2,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.base,
  },
  handoffModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    ...shadows.md,
  },
  handoffBadgeCircle: {
    width: 60,
    height: 60,
    borderRadius: radii.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.success,
  },
  handoffCheckIcon: {
    fontSize: 28,
    color: colors.success,
    fontWeight: typography.fontWeights.extrabold,
  },
  handoffModalTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
  },
  handoffModalSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    textAlign: "center",
    lineHeight: typography.lineHeights.xs,
  },
  wardReservationBox: {
    width: "100%",
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
  },
  reservedHospitalName: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  reservedBayText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
  },
  reservedSpecialities: {
    fontSize: 10,
    color: colors.slate600,
  },
  traumaAlertNotice: {
    fontSize: 10,
    color: colors.slate700,
    textAlign: "center",
    lineHeight: 14,
  },
  launchTransportBtn: {
    width: "100%",
    backgroundColor: colors.emergency,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    ...shadows.emergency,
  },
  launchTransportBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
});
