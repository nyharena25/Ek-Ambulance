import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Pressable,
} from "react-native";
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
import { usePatientAuthStore } from "../../src/state/patientAuth.store";
import { confirmStrings } from "../../src/i18n/confirmStrings";
import { SupportedLanguage } from "../../src/i18n/onboardingStrings";
import { useEffect, useState } from "react";

import { AppIcon } from "../../src/components";
import { DISPATCH_HUB } from "../../src/services/mapGeo.core";
export default function BookingConfirmScreen() {
  const router = useRouter();
  const send = usePatientLifecycleStore((s) => s.send);
  // Task 4.1: real UID once verified via phone-OTP. Falls back to a
  // labeled placeholder for the anonymous "quick emergency access" path
  // (OnboardingScreen -> /booking/triage directly, skipping auth entirely
  // by design), which must keep working without forcing a login.
  const sessionUserId = usePatientAuthStore((s) => s.session?.user.id);
  const patientId = sessionUserId ?? "PAT-ANONYMOUS-0001";
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
  const pickupAddress =
    params.address || "AIIMS New Delhi, Main Emergency Ward";

  const pickupLat = params.lat ? Number(params.lat) : 28.5672;
  const pickupLon = params.lon ? Number(params.lon) : 77.21;
  const [routedDistanceKm, setRoutedDistanceKm] = useState(DEFAULT_DISPATCH_DISTANCE_KM);
  useEffect(() => {
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
  }, [jurisdiction, pickupLat, pickupLon]);

  const handleConfirmAndRequest = (fareDetails: ItemizedStatutoryFare) => {
    // Locks the mission request into machine context - vehicleType,
    // jurisdiction and pickup travel with the machine from here on, and
    // the machine recomputes fareDetails from the pure pricing engine
    // rather than trusting the sheet's own copy (same inputs, same
    // constant distance, so they agree; the machine's copy is what
    // downstream screens read).
    send({
      type: "REQUEST",
      payload: {
        patientId,
        pickup: {
          latitude: params.lat ? Number(params.lat) : 28.5672,
          longitude: params.lon ? Number(params.lon) : 77.21,
        },
        careLevel: careLevelFromVehicleType(vehicleType),
        vehicleType,
        jurisdiction,
        requestedAt: new Date().toISOString(),
        // The machine re-prices from this, so the locked fare matches the quote the sheet showed.
        distanceKm: fareDetails.totalDistanceKm,
        idempotencyKey: `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });

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
          <View style={styles.nearbyTag}>
            <Text style={styles.nearbyTagText}>3 NEARBY</Text>
          </View>
        </View>
      </View>

      {/* EXPANDABLE STATUTORY FARE BOTTOM SHEET */}
      <StatutoryFareBottomSheet
        vehicleType={vehicleType}
        jurisdiction={jurisdiction}
        distanceKm={routedDistanceKm}
        initialExpanded={true}
        initialLanguage={language}
        onConfirmAndRequest={handleConfirmAndRequest}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.slate100,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
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
