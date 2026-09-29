import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import {
  AIS125VehicleType,
  Jurisdiction,
  ItemizedStatutoryFare,
  DEFAULT_DISPATCH_DISTANCE_KM,
  careLevelFromVehicleType,
  getDrivingRoute,
} from "@sahayak/domain";
import { StatutoryFareBottomSheet } from "../../src/screens";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";
import { usePatientAuthStore, realAccessToken } from "../../src/state/patientAuth.store";
import { confirmStrings } from "../../src/i18n/confirmStrings";
import { SupportedLanguage } from "../../src/i18n/onboardingStrings";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { createMission } from "../../src/lib/missionApi";
import { createMissionErrorMessage, newIdempotencyKey } from "../../src/lib/missionApi.core";
import { authStorage } from "../../src/lib/supabaseClient";
import { savePersistedMission } from "../../src/services/missionSession.core";

import { AppIcon } from "../../src/components";
import { DEFAULT_PICKUP, DISPATCH_HUB, formatCoordinates } from "../../src/services/mapGeo.core";
export default function BookingConfirmScreen() {
  const router = useRouter();
  const send = usePatientLifecycleStore((s) => s.send);
  // Task 4.1: real UID once verified via phone-OTP. Falls back to a
  // labeled placeholder for the anonymous "quick emergency access" path
  // (OnboardingScreen -> /booking/triage directly, skipping auth entirely
  // by design), which must keep working without forcing a login.
  const session = usePatientAuthStore((s) => s.session);
  const sessionUserId = session?.user.id;
  const accessToken = realAccessToken(session);
  // D-1: dispatch needs a verified phone. The anonymous fallback id below is cosmetic/local only - createMission
  // authenticates via the real JWT when a session exists, so this id is never what identifies the patient server-side.
  const patientId = sessionUserId ?? "PAT-ANONYMOUS-0001";
  const triageResult = usePatientLifecycleStore((s) => s.context.triageResult);
  const lifecycleState = usePatientLifecycleStore((s) => s.currentState);
  // One key per visit to this screen: a retry after a lost response returns the same mission instead of a second one.
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // StatutoryFareBottomSheet below has its own internal en/hi toggle with no
  // callback to report changes back up, so this only syncs the *initial*
  // language; if the patient flips the sheet's own toggle, this header stays
  // English until the sheet exposes an onLanguageChange prop.
  const [language] = useState<SupportedLanguage>("en");
  const strings = confirmStrings[language];
  const params = useLocalSearchParams<{
    vehicleType?: string;
    careLevel?: string;
    jurisdiction?: string;
    address?: string;
    lat?: string;
    lon?: string;
  }>();

  const vehicleType = (params.vehicleType as AIS125VehicleType) || "TYPE_D_ALS";
  const jurisdiction = (params.jurisdiction as Jurisdiction) || "DL";

  // A missing or non-finite lat/lon means this screen was reached without a real pickup location (e.g. a
  // stale deep link past PickupLocationScreen's real geolocation flow). It must never be silently replaced
  // by a hardcoded address before a real ambulance is dispatched - __DEV__ keeps a stand-in only so the
  // screen still previews when opened directly outside the normal navigation flow.
  const hasRealPickup =
    params.lat !== undefined && params.lon !== undefined && Number.isFinite(Number(params.lat)) && Number.isFinite(Number(params.lon));
  const pickupLat = hasRealPickup ? Number(params.lat) : __DEV__ ? DEFAULT_PICKUP.latitude : NaN;
  const pickupLon = hasRealPickup ? Number(params.lon) : __DEV__ ? DEFAULT_PICKUP.longitude : NaN;
  const pickupAddress = params.address || (hasRealPickup ? formatCoordinates({ latitude: pickupLat, longitude: pickupLon }) : "");

  const [routedDistanceKm, setRoutedDistanceKm] = useState(DEFAULT_DISPATCH_DISTANCE_KM);
  useEffect(() => {
    if (!hasRealPickup && !__DEV__) return;
    let cancelled = false;
    void getDrivingRoute(DISPATCH_HUB[jurisdiction] ?? DISPATCH_HUB.DL, {
      latitude: pickupLat,
      longitude: pickupLon,
    }).then((r) => {
      if (!cancelled) setRoutedDistanceKm(r.distanceKm);
    });
    return () => {
      cancelled = true;
    };
  }, [jurisdiction, pickupLat, pickupLon, hasRealPickup]);

  // Surface the missing-location error the moment the screen is reached, not only after a tap - the fare
  // sheet below is never shown without a real pickup point (release builds).
  useEffect(() => {
    if (!hasRealPickup && !__DEV__) setSubmitError(strings.pickupLocationMissing);
  }, [hasRealPickup]);

  const handleConfirmAndRequest = async (fareDetails: ItemizedStatutoryFare) => {
    if (submitting) return;
    if (!hasRealPickup && !__DEV__) {
      setSubmitError(strings.pickupLocationMissing);
      return;
    }
    setSubmitError(null);
    const pickup = { latitude: pickupLat, longitude: pickupLon };
    const requestPayload = {
      patientId,
      pickup,
      careLevel: careLevelFromVehicleType(vehicleType),
      vehicleType,
      jurisdiction,
      requestedAt: new Date().toISOString(),
      // The machine re-prices from this, so the locked fare matches the quote the sheet showed.
      distanceKm: fareDetails.totalDistanceKm,
      idempotencyKey: idempotencyKeyRef.current,
    };

    if (accessToken) {
      // The server creates the mission (jurisdiction from polygons, fare, first event, dispatch wave) BEFORE the machine
      // moves: a request that never reached the server must not put the patient on a "searching" screen.
      if (!triageResult || lifecycleState !== "triaged") {
        setSubmitError(createMissionErrorMessage("triage_required", language));
        return;
      }
      setSubmitting(true);
      const result = await createMission({
        idempotencyKey: idempotencyKeyRef.current,
        pickup,
        pickupAddress: params.address,
        vehicleType,
        urgency: triageResult.tier,
        triage: { engine_version: "start-esi-1", derived_flags: triageResult.symptomFlags },
        distanceKm: fareDetails.totalDistanceKm,
      });
      setSubmitting(false);
      if (!result.ok) {
        setSubmitError(createMissionErrorMessage(result.error.code, language));
        return;
      }
      send({ type: "REQUEST", payload: requestPayload });
      send({ type: "SERVER_MISSION_CREATED", payload: { missionId: result.data.missionId } });
      // Only the creation event (seq 1) has been seen: an instant no-driver cancel (seq 2) must be replayed, not skipped.
      await savePersistedMission(authStorage, { missionId: result.data.missionId, lastSeq: 1 });
    } else {
      setSubmitError(strings.signInRequired);
      return;
    }

    router.push({
      pathname: "/booking/matching",
      params: {
        vehicleType,
        jurisdiction,
        address: pickupAddress,
        lat: params.lat,
        lon: params.lon,
      },
    });
  };


  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/booking/category-select");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP BAR */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={20} style={styles.backArrow} />
        </Pressable>
        <View style={styles.topBarTitleGroup}>
          <Text style={styles.topBarTitle}>{strings.screenTitle}</Text>
          <Text style={styles.topBarTagline}>
            Step 4 of 4 • Statutory Fare Lock
          </Text>
        </View>
      </View>

      {/* MISSION DISPATCH PREVIEW CONTEXT */}
      <View style={styles.contextContainer}>
        {/* Pickup Location Card */}
        <View style={styles.contextCard}>
          <View style={styles.cardIconBadge}>
            <AppIcon icon={{ set: "ion", name: "location" }} size={20} color={colors.slate700} style={styles.cardIcon} />
          </View>
          <View style={styles.cardTextGroup}>
            <Text style={styles.cardSectionLabel}>{strings.pickupLocationLabel}</Text>
            <Text style={styles.cardMainText} numberOfLines={2}>
              {pickupAddress}
            </Text>
            {params.lat && params.lon && (
              <Text style={styles.cardSubText}>
                GPS: {Number(params.lat).toFixed(4)}° N,{" "}
                {Number(params.lon).toFixed(4)}° E
              </Text>
            )}
          </View>
        </View>

        {/* Selected AIS-125 Vehicle Card */}
        <View style={styles.contextCard}>
          <View style={styles.cardIconBadge}>
            <AppIcon icon={{ set: "mci", name: "ambulance" }} size={20} color={colors.slate700} style={styles.cardIcon} />
          </View>
          <View style={styles.cardTextGroup}>
            <Text style={styles.cardSectionLabel}>{strings.fleetVehicleLabel}</Text>
            <Text style={styles.cardMainText}>
              {vehicleType.replace(/_/g, " ")}
            </Text>
            <Text style={styles.cardSubText}>
              Certified Life-Support • Telemetry Active
            </Text>
          </View>
        </View>
      </View>

      {submitError && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{submitError}</Text>
          <Pressable accessibilityRole="button" style={styles.errorCallButton} onPress={() => void Linking.openURL("tel:108")}>
            <Text style={styles.errorCallButtonText}>{strings.call108}</Text>
          </Pressable>
        </View>
      )}

      {/* EXPANDABLE STATUTORY FARE BOTTOM SHEET: withheld without a real pickup point - a fare quote and
          "Confirm & Request" action must never be offered against a location the app made up. */}
      {(hasRealPickup || __DEV__) && (
        <StatutoryFareBottomSheet
          vehicleType={vehicleType}
          jurisdiction={jurisdiction}
          distanceKm={routedDistanceKm}
          initialExpanded={true}
          initialLanguage={language}
          onConfirmAndRequest={handleConfirmAndRequest}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.slate100,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  backArrow: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.slate900,
  },
  topBarTitleGroup: {
    flex: 1,
  },
  topBarTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  topBarTagline: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
  },
  contextContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    flex: 1,
  },
  contextCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  cardIconBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardTextGroup: {
    flex: 1,
  },
  cardSectionLabel: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate600,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  cardMainText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  cardSubText: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 2,
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    borderWidth: 1.5,
    borderColor: colors.slate900,
    gap: spacing.sm,
  },
  errorBannerText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  errorCallButton: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.slate900,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCallButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  nearbyTag: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  nearbyTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success,
  },
});
