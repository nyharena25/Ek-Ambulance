import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  TextInput,
  Switch,
  Platform,
  StatusBar,
  Modal,
} from "react-native";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { ConfirmPatientOnboardPayload } from "@sahayak/domain";
import {
  driverOnSceneStrings,
  RANKED_TRAUMA_CENTRES,
  TraumaCentreItem,
} from "../i18n/driverOnSceneStrings";
import { SupportedLanguage } from "../i18n/driverOnboardingStrings";
import { isHospitalSelectable } from "../hooks/hospitalHandoff.core";

import { AppIcon } from "../components";
export interface OnSceneCareScreenProps {
  missionId?: string;
  initialLanguage?: SupportedLanguage;
  onConfirmPatientOnboard?: (payload: ConfirmPatientOnboardPayload) => void;
  onProceedToTransportNavigation?: (hospital: TraumaCentreItem) => void;
  onBack?: () => void;
}

export default function OnSceneCareScreen({
  missionId = "MSN-2026-8819",
  initialLanguage = "en",
  onConfirmPatientOnboard,
  onProceedToTransportNavigation,
  onBack,
}: OnSceneCareScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);

  // Vitals State
  const [pulse, setPulse] = useState(88);
  const [spO2, setSpO2] = useState(94);
  const [systolic, setSystolic] = useState(120);
  const [diastolic, setDiastolic] = useState(80);
  const [gcsScore, setGcsScore] = useState(13);

  // Immediate Departure Bypass (Load & Go)
  const [isBypassActive, setIsBypassActive] = useState(false);

  // Hospital Selection State
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("hosp_jaypee");
  const [filterCategory, setFilterCategory] = useState<"ALL" | "GOVERNMENT" | "PRIVATE">("ALL");

  // Handoff Alert Modal
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);

  const strings = driverOnSceneStrings[language];
  const selectedHospital =
    RANKED_TRAUMA_CENTRES.find((h) => h.id === selectedHospitalId) ||
    RANKED_TRAUMA_CENTRES[0];

  // Mean Arterial Pressure (MAP) computation
  const mapValue = Math.round(diastolic + (systolic - diastolic) / 3);

  // Filtered trauma centres
  const filteredHospitals = RANKED_TRAUMA_CENTRES.filter((h) => {
    if (filterCategory === "ALL") return true;
    return h.category === filterCategory;
  });

  const handleStartTransport = () => {
    // Defense-in-depth: card selection is already gated below, but never
    // let an overcrowded destination proceed even if selectedHospitalId
    // somehow points at one (e.g. a future filter/sort change).
    if (!isHospitalSelectable(selectedHospital)) return;

    const payload: ConfirmPatientOnboardPayload = {
      missionId,
      driverId: "DRV-DL-8821",
      destination: selectedHospital.coordinates,
      onboardAt: new Date().toISOString(),
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
                <Text style={styles.vitalLargeValue}>{pulse}</Text>
                <View style={styles.quickStepButtons}>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setPulse((p) => Math.max(30, p - 5))}
                  >
                    <Text style={styles.stepBtnText}>-5</Text>
                  </Pressable>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setPulse((p) => Math.min(220, p + 5))}
                  >
                    <Text style={styles.stepBtnText}>+5</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.vitalStatusGood}>
                {pulse > 100
                  ? strings.pulseStatusTachycardia
                  : pulse < 60
                  ? strings.pulseStatusBradycardia
                  : strings.pulseStatusNormal}
              </Text>
            </View>

            {/* 2. SpO2 Oxygen */}
            <View style={styles.vitalCard}>
              <View style={styles.vitalHeaderRow}>
                <Text style={styles.vitalLabel}>{strings.spO2Label}</Text>
                <Text style={styles.vitalUnit}>{strings.spO2Unit}</Text>
              </View>
              <View style={styles.vitalValueRow}>
                <Text style={styles.vitalLargeValue}>{spO2}%</Text>
                <View style={styles.quickStepButtons}>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setSpO2((s) => Math.max(50, s - 1))}
                  >
                    <Text style={styles.stepBtnText}>-1</Text>
                  </Pressable>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => setSpO2((s) => Math.min(100, s + 1))}
                  >
                    <Text style={styles.stepBtnText}>+1</Text>
                  </Pressable>
                </View>
              </View>
              <Text
                style={
                  spO2 < 90 ? styles.vitalStatusCritical : styles.vitalStatusGood
                }
              >
                {spO2 < 90 ? strings.spO2StatusHypoxia : strings.spO2StatusNormal}
              </Text>
            </View>
          </View>

          {/* Blood Pressure Row */}
          <View style={styles.bpContainer}>
            <View style={styles.vitalHeaderRow}>
              <Text style={styles.vitalLabel}>{strings.bpLabel}</Text>
              <Text style={styles.mapPillText}>MAP: {mapValue} mmHg</Text>
            </View>

            <View style={styles.bpInputsRow}>
              <View style={styles.bpCol}>
                <Text style={styles.bpSubLabel}>{strings.systolicLabel}</Text>
                <TextInput
                  style={styles.bpInput}
                  value={String(systolic)}
                  onChangeText={(val) => setSystolic(Number(val) || 0)}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
              <Text style={styles.bpDivider}>/</Text>
              <View style={styles.bpCol}>
                <Text style={styles.bpSubLabel}>{strings.diastolicLabel}</Text>
                <TextInput
                  style={styles.bpInput}
                  value={String(diastolic)}
                  onChangeText={(val) => setDiastolic(Number(val) || 0)}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
              <View style={styles.bpSummaryPill}>
                <Text style={styles.bpSummaryText}>
                  {systolic}/{diastolic} mmHg
                </Text>
              </View>
            </View>
          </View>

          {/* Glasgow Coma Scale (GCS) */}
          <View style={styles.gcsContainer}>
            <View style={styles.vitalHeaderRow}>
              <Text style={styles.vitalLabel}>{strings.gcsLabel}</Text>
              <View style={styles.gcsScoreBadge}>
                <Text style={styles.gcsScoreBadgeText}>
                  {strings.gcsTotalLabel(gcsScore)}
                </Text>
              </View>
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

        {/* RANKED NEAREST TRAUMA CENTRES LIST */}
        <View style={styles.traumaSectionCard}>
          <View style={styles.sectionHeaderRow}>
            <AppIcon icon={{ set: "mci", name: "hospital-building" }} size={22} color={colors.slate700} style={styles.sectionIcon} />
            <View style={styles.sectionTitleWrap}>
              <Text style={styles.sectionTitle}>{strings.traumaCentresTitle}</Text>
              <Text style={styles.sectionSub}>
                {strings.traumaCentresSubtitle}
              </Text>
            </View>
          </View>

          {/* Category Filter Chips */}
          <View style={styles.categoryFiltersRow}>
            {(["ALL", "GOVERNMENT", "PRIVATE"] as const).map((cat) => (
              <Pressable
                key={cat}
                style={[
                  styles.catFilterChip,
                  filterCategory === cat && styles.catFilterChipActive,
                ]}
                onPress={() => setFilterCategory(cat)}
              >
                <Text
                  style={[
                    styles.catFilterText,
                    filterCategory === cat && styles.catFilterTextActive,
                  ]}
                >
                  {cat === "ALL"
                    ? strings.filterAll
                    : cat === "GOVERNMENT"
                    ? strings.filterGovt
                    : strings.filterPrivate}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Hospital Cards List */}
          <View style={styles.hospitalsList}>
            {filteredHospitals.map((hospital, index) => {
              const isSelected = selectedHospitalId === hospital.id;
              const isSelectable = isHospitalSelectable(hospital);
              const displayName =
                language === "hi" ? hospital.hindiName : hospital.name;
              const displayLevel =
                language === "hi"
                  ? hospital.hindiTraumaLevel
                  : hospital.traumaLevel;

              return (
                <Pressable
                  key={hospital.id}
                  style={[
                    styles.hospitalCard,
                    isSelected && styles.hospitalCardSelected,
                    !isSelectable && styles.hospitalCardDisabled,
                  ]}
                  onPress={() => isSelectable && setSelectedHospitalId(hospital.id)}
                  disabled={!isSelectable}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: !isSelectable }}
                >
                  {/* Top Row: Rank + Name + Category */}
                  <View style={styles.hospTopRow}>
                    <View style={styles.hospRankBadge}>
                      <Text style={styles.hospRankText}>#{index + 1}</Text>
                    </View>
                    <View style={styles.hospNameBox}>
                      <Text
                        style={[
                          styles.hospNameText,
                          isSelected && styles.hospNameTextSelected,
                        ]}
                      >
                        {displayName}
                      </Text>
                      <Text style={styles.hospLevelText}>{displayLevel}</Text>
                    </View>
                    {!isSelectable ? (
                      <View style={styles.atCapacityBadge}>
                        <Text style={styles.atCapacityBadgeText}>
                          {strings.hospitalAtCapacityBadge}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.radioOuter}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    )}
                  </View>

                  {/* Distance & ETA Row */}
                  <View style={styles.hospEtaBar}>
                    <Text style={styles.hospEtaText}>
                      ⏱️{" "}
                      {strings.etaDistanceLabel(
                        hospital.etaMinutes,
                        hospital.distanceKm
                      )}
                    </Text>
                    <View
                      style={[
                        styles.catPill,
                        hospital.category === "GOVERNMENT"
                          ? styles.catPillGovt
                          : styles.catPillPrivate,
                      ]}
                    >
                      <Text
                        style={[
                          styles.catPillText,
                          hospital.category === "GOVERNMENT"
                            ? styles.catPillTextGovt
                            : styles.catPillTextPrivate,
                        ]}
                      >
                        {hospital.category}
                      </Text>
                    </View>
                  </View>

                  {/* Real-Time Bed Capacity & Held Counters */}
                  <View style={styles.capacityGrid}>
                    <View style={styles.capacityBox}>
                      <Text style={styles.capacityNum}>
                        {hospital.availableIcuBeds} / {hospital.totalIcuBeds}
                      </Text>
                      <Text style={styles.capacitySub}>{strings.capacityIcuFreeLabel}</Text>
                    </View>
                    <View style={styles.capacityBox}>
                      <Text style={styles.capacityNum}>
                        {hospital.availableTraumaBays}
                      </Text>
                      <Text style={styles.capacitySub}>{strings.capacityResusBaysLabel}</Text>
                    </View>
                    <View style={styles.capacityBox}>
                      <Text style={styles.capacityNum}>
                        {hospital.ventilatorsReady}
                      </Text>
                      <Text style={styles.capacitySub}>{strings.capacityVentilatorsLabel}</Text>
                    </View>
                  </View>

                  {/* HELD COUNTERS / PRE-ALERT RESERVATION BADGE */}
                  <View style={styles.heldCountersRow}>
                    <View style={styles.heldBadge}>
                      <Text style={styles.heldBadgeText}>
                        <AppIcon icon={{ set: "ion", name: "lock-closed" }} size={9} />{" "}{strings.bedsHeldBadge(hospital.bedsHeldCounter)}
                      </Text>
                    </View>
                    <Text style={styles.inboundUnitsText}>
                      <AppIcon icon={{ set: "mci", name: "ambulance" }} size={9} />{" "}{strings.inboundUnitsNotice(hospital.inboundAmbulances)}
                    </Text>
                  </View>

                  {/* Selected Indicator Banner */}
                  {isSelected && (
                    <View style={styles.selectedConfirmedBar}>
                      <Text style={styles.selectedConfirmedBarText}>
                        <AppIcon icon={{ set: "ion", name: "checkmark" }} size={10} />{" "}{strings.selectedDestinationLabel}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* STICKY BOTTOM ACTION BAR */}
      <View style={styles.bottomBar}>
        <View style={styles.destinationSummaryBar}>
          <Text style={styles.destinationSummaryLabel}>
            {strings.selectedDestinationLabel}:
          </Text>
          <Text style={styles.destinationSummaryHospital} numberOfLines={1}>
            {language === "hi"
              ? selectedHospital.hindiName
              : selectedHospital.name}{" "}
            ({selectedHospital.etaMinutes} mins ETA)
          </Text>
        </View>

        <Pressable
          style={styles.startTransportBtn}
          onPress={handleStartTransport}
          accessibilityRole="button"
        >
          <Text style={styles.startTransportBtnText}>
            {strings.btnStartTransport}
          </Text>
          <Text style={styles.startTransportBtnSub}>
            {strings.btnStartTransportSub}
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
              <Text style={styles.reservedBayText}>
                {strings.bedReservedConfirmation(
                  selectedHospital.name,
                  "Bay 02 - Red Trauma Resus"
                )}
              </Text>
              <Text style={styles.reservedSpecialities}>
                Team Alerted: {selectedHospital.specialities.join(" • ")}
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
    gap: 6,
  },
  catFilterChip: {
    flex: 1,
    paddingVertical: 6,
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
  },
  hospNameText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  hospNameTextSelected: {
    color: colors.emergencyDark,
  },
  hospLevelText: {
    fontSize: 10,
    color: colors.slate600,
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
    flex: 1,
    fontSize: 11,
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
