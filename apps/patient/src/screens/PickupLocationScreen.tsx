import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  type TextInputInstance,
  StyleSheet,
  Pressable,
  StatusBar,
  Animated,
  Keyboard,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import type { GeoPoint } from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import {
  locationStrings,
  LANDMARK_PRESETS,
  LandmarkPreset,
} from "../i18n/locationStrings";

import { AppIcon } from "../components";
import { OsmWebMap, type OsmWebMapHandle } from "../components/OsmWebMap";
import { CAN_MOUNT_MAP, OSM_TILE_URL } from "../components/nativeMap";
import { formatCoordinates, isValidPickup } from "../services/mapGeo.core";
import { resolveAddress as lookupAddress } from "../services/geocodingService";
export interface PickupLocationScreenProps {
  onConfirmPickup?: (data: {
    point: GeoPoint;
    address: string;
  }) => void;
  onBack?: () => void;
  initialLanguage?: SupportedLanguage;
}

const PICKUP_ZOOM = 16;
// A recent last-known fix shows the patient where they are at once; a fresh fix then refines it.
const LAST_KNOWN_MAX_AGE_MS = 120_000;
const LAST_KNOWN_MAX_ACCURACY_M = 200;
// getCurrentPositionAsync has no built-in client-side timeout - without this race a device with no fix (indoors, GPS
// off) would leave the patient staring at a screen that never resolves either way.
const GPS_TIMEOUT_MS = 15_000;

export default function PickupLocationScreen({
  onConfirmPickup,
  onBack,
  initialLanguage = "en",
}: PickupLocationScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = locationStrings[language];
  const insets = useSafeAreaInsets();

  // The pickup: null until a real source sets it (device GPS fix, map drag, landmark the patient picked). There is no
  // default position - the map itself mounts on the first real point. The service area is decided by the server (R-12).
  const [coordinates, setCoordinates] = useState<GeoPoint | null>(null);
  const canConfirm = isValidPickup(coordinates);
  const [locating, setLocating] = useState(true);
  // Set once the patient places the pin themselves: a late GPS fix must not move it away again.
  const userPicked = useRef(false);

  // Address: real reverse-geocoded text, or the formatted coordinates until/unless geocoding succeeds.
  const [currentAddress, setCurrentAddress] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const searchInputRef = useRef<TextInputInstance | null>(null);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search query & suggestion dropdown
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Center pin elevation animation (lifts while the map is dragged, drops on release)
  const pinElevationAnim = useRef(new Animated.Value(0)).current;
  const pinLifted = useRef(false);
  const mapRef = useRef<OsmWebMapHandle>(null);
  const geocodeSeq = useRef(0);
  const showMap = CAN_MOUNT_MAP;

  // Non-blocking GPS fallback banner: set on permission denial or a
  // getCurrentPositionAsync failure, cleared automatically - manual pin
  // placement (already fully functional) is never blocked by this.
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);

  const updateCoordinates = useCallback((newCoords: GeoPoint, label?: string) => {
    setCoordinates(newCoords);
    if (label) {
      setCurrentAddress(label);
      setAddressLine2("");
    }
  }, []);

  // Google -> device -> Nominatim reverse geocoding; stale replies are dropped.
  const resolveAddress = useCallback(async (point: GeoPoint) => {
    const seq = ++geocodeSeq.current;
    setCurrentAddress(formatCoordinates(point));
    setAddressLine2("");
    const { primary, secondary } = await lookupAddress(point);
    if (seq === geocodeSeq.current) {
      setCurrentAddress(primary);
      setAddressLine2(secondary);
    }
  }, []);

  // GPS "Locate Me" (also runs on mount): the device's own fix -> pickup + camera + address. Permission denied,
  // location services off, no fix, and a fix that never arrives in time each show a distinct non-blocking banner;
  // landmark search stays available in every case. Never a default or simulated position.
  const handleLocateMe = useCallback(async () => {
    setLocationErrorMessage(null);
    setLocating(true);
    userPicked.current = false;
    let located = false;
    const apply = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
      if (userPicked.current) return;
      located = true;
      updateCoordinates({ latitude, longitude });
      void resolveAddress({ latitude, longitude });
      mapRef.current?.flyTo({ latitude, longitude }, PICKUP_ZOOM, 600);
    };
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationErrorMessage(strings.locationPermissionDeniedBanner);
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setLocationErrorMessage(strings.locationServicesOffBanner);
        return;
      }
      const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: LAST_KNOWN_MAX_ACCURACY_M });
      if (last) apply(last.coords);
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("gps_timeout")), GPS_TIMEOUT_MS)),
      ]);
      apply(position.coords);
    } catch (err) {
      // A recent fix is already shown: a refinement that failed is not an error for the patient.
      if (!located) {
        setLocationErrorMessage(
          err instanceof Error && err.message === "gps_timeout" ? strings.locationTimeoutBanner : strings.locationUnavailableBanner
        );
      }
    } finally {
      setLocating(false);
    }
  }, [strings, updateCoordinates, resolveAddress]);

  useEffect(() => {
    void handleLocateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPinLifted = (lifted: boolean) => {
    if (pinLifted.current === lifted) return;
    pinLifted.current = lifted;
    Animated.spring(pinElevationAnim, { toValue: lifted ? -14 : 0, useNativeDriver: true, speed: 20 }).start();
  };

  // The pin is fixed at the screen centre, so a user drag ends with the map centre as the pickup point.
  const handleMoveEnd = (point: GeoPoint, isUserGesture: boolean) => {
    setPinLifted(false);
    if (!isUserGesture) return;
    if (dragTimer.current) clearTimeout(dragTimer.current);
    userPicked.current = true;
    dragTimer.current = setTimeout(() => {
      updateCoordinates(point);
      void resolveAddress(point);
    }, 300);
  };

  useEffect(() => () => {
    if (dragTimer.current) clearTimeout(dragTimer.current);
  }, []);

  const closeSearch = () => {
    setIsSearchActive(false);
    setSearchQuery("");
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  };

  // Handle Landmark Selection from Search List
  const handleSelectLandmark = (item: LandmarkPreset) => {
    closeSearch();
    userPicked.current = true;
    setLocationErrorMessage(null);
    const targetPoint: GeoPoint = {
      latitude: item.latitude,
      longitude: item.longitude,
    };
    updateCoordinates(
      targetPoint,
      language === "hi" ? item.hindiAddress : item.address
    );
    mapRef.current?.flyTo(targetPoint, PICKUP_ZOOM, 600);
  };

  // Handle Confirmation
  const handleConfirm = () => {
    if (!canConfirm) return;
    if (onConfirmPickup && coordinates) {
      onConfirmPickup({
        point: coordinates,
        address: addressLine2 ? `${currentAddress}, ${addressLine2}` : currentAddress,
      });
    }
  };

  // Filter landmarks by search query
  const filteredLandmarks = LANDMARK_PRESETS.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.address.toLowerCase().includes(q) ||
      item.hindiName.includes(q) ||
      item.hindiAddress.includes(q)
    );
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" />

      {/* TOP HEADER: Back, Title, & Persistent Bilingual Toggle */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.backButton}
              onPress={onBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AppIcon icon={{ set: "ion", name: "arrow-back" }} size={20} style={styles.backArrow} />
            </Pressable>
          )}
          <View>
            <Text style={styles.headerTitle}>{strings.headerTitle}</Text>
            <Text style={styles.headerTagline}>{strings.headerTagline}</Text>
          </View>
        </View>

        {/* Bilingual Toggle */}
        <View
          style={styles.languageToggleContainer}
          accessible={true}
          accessibilityRole="radiogroup"
        >
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === "en" }}
            accessibilityLabel="Switch to English"
            style={[
              styles.langButton,
              language === "en" && styles.langButtonActive,
            ]}
            onPress={() => setLanguage("en")}
          >
            <Text
              style={[
                styles.langButtonText,
                language === "en" && styles.langButtonTextActive,
              ]}
            >
              EN
            </Text>
          </Pressable>

          <View style={styles.langDivider} />

          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === "hi" }}
            accessibilityLabel="हिन्दी में बदलें"
            style={[
              styles.langButton,
              language === "hi" && styles.langButtonActive,
            ]}
            onPress={() => setLanguage("hi")}
          >
            <Text
              style={[
                styles.langButtonText,
                language === "hi" && styles.langButtonTextActive,
              ]}
            >
              हिन्दी
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ADDRESS SEARCH BAR & AUTOCOMPLETE OVERLAY */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputRow}>
          <AppIcon icon={{ set: "ion", name: "search" }} size={16} color={colors.slate700} style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchTextInput}
            placeholder={strings.searchPlaceholder}
            placeholderTextColor={colors.slate400}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setIsSearchActive(true);
            }}
            onFocus={() => setIsSearchActive(true)}
            accessibilityLabel={strings.searchPlaceholder}
          />
          {searchQuery.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={closeSearch}
              style={styles.clearSearchButton}
            >
              <AppIcon icon={{ set: "ion", name: "close" }} size={14} style={styles.clearSearchIcon} />
            </Pressable>
          )}
        </View>
      </View>

      {/* INTERACTIVE MAP CANVAS WITH CENTER-PIN MARKER */}
      <View style={styles.mapContainer}>
        {!coordinates ? (
          <View style={styles.mapUnavailable} accessibilityRole="summary">
            {locating ? (
              <ActivityIndicator color={colors.slate600} />
            ) : (
              <AppIcon icon={{ set: "mci", name: "crosshairs-question" }} size={28} color={colors.slate500} />
            )}
            <Text style={styles.mapUnavailableText}>{locating ? strings.locatingText : strings.noPickupYet}</Text>
          </View>
        ) : showMap ? (
          <OsmWebMap
            ref={mapRef}
            center={coordinates}
            zoom={PICKUP_ZOOM}
            tileUrlTemplate={OSM_TILE_URL}
            onDragStart={() => setPinLifted(true)}
            onMoveEnd={handleMoveEnd}
          />
        ) : (
          <View style={styles.mapUnavailable}>
            <AppIcon icon={{ set: "mci", name: "map-marker-off-outline" }} size={28} color={colors.slate500} />
            <Text style={styles.mapUnavailableText}>Map unavailable - pick a landmark or tap Locate Me</Text>
          </View>
        )}

        {/* Autocomplete overlay lives inside the map box (not under the search bar): Android drops taps on
            children drawn outside their parent's bounds, and the list scrolls instead of spilling over the map. */}
        {isSearchActive && <Pressable style={styles.searchBackdrop} onPress={closeSearch} accessibilityLabel="Close search" />}
        {isSearchActive && (
          <View style={styles.searchDropdown}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>
                {strings.searchRecentTitle}
              </Text>
              <Pressable onPress={closeSearch} hitSlop={8}>
                <Text style={styles.dropdownCloseText}>Done</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
            {filteredLandmarks.map((item) => (
              <Pressable
                key={item.id}
                style={styles.landmarkItem}
                onPress={() => handleSelectLandmark(item)}
              >
                <View style={styles.landmarkIconBox}>
                  <AppIcon icon={{ set: "mci", name: "hospital-building" }} size={16} color={colors.slate700} style={styles.landmarkIcon} />
                </View>
                <View style={styles.landmarkTextGroup}>
                  <Text style={styles.landmarkName}>
                    {language === "hi" ? item.hindiName : item.name}
                  </Text>
                  <Text style={styles.landmarkAddress} numberOfLines={1}>
                    {language === "hi" ? item.hindiAddress : item.address}
                  </Text>
                </View>
              </Pressable>
            ))}
            </ScrollView>
          </View>
        )}

        {/* FIXED CENTER-PIN MARKER (GEOMETRICALLY CENTERED): only over a real point */}
        {coordinates && (
        <View style={styles.centerPinWrapper} pointerEvents="none">
          {/* Animated Elevating Pin */}
          <Animated.View
            style={[
              styles.pinAnimatedGroup,
              {
                transform: [{ translateY: pinElevationAnim }],
              },
            ]}
          >
            {/* Floating Address Callout Bubble */}
            <View style={styles.pinCalloutBubble}>
              <Text style={styles.pinCalloutTitle} numberOfLines={1}>
                {strings.pinCalloutTitle}
              </Text>
              <Text style={styles.pinCalloutCoords}>
                {coordinates.latitude.toFixed(4)}° N,{" "}
                {coordinates.longitude.toFixed(4)}° E
              </Text>
            </View>

            {/* Emergency Red Center Pin */}
            <View style={styles.pinMarkerBody}>
              <View style={styles.pinHead}>
                <View style={styles.pinCrossH} />
                <View style={styles.pinCrossV} />
              </View>
              <View style={styles.pinStem} />
            </View>
          </Animated.View>

          {/* Ground Pulse Shadow */}
          <View style={styles.pinGroundShadow} />
        </View>
        )}

        {/* GPS "LOCATE ME" FLOATING ACTION BUTTON */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.locateMeLabel}
          accessibilityHint={strings.locateMeHint}
          style={({ pressed }) => [
            styles.locateMeButton,
            pressed && styles.locateMeButtonPressed,
          ]}
          onPress={handleLocateMe}
        >
          <AppIcon icon={{ set: "mci", name: "target" }} size={16} color={colors.slate700} style={styles.locateMeIcon} />
          <Text style={styles.locateMeText}>{strings.locateMeLabel}</Text>
        </Pressable>

        {/* Drag Hint Overlay */}
        {coordinates && showMap && (
          <View style={styles.dragHintContainer} pointerEvents="none">
            <Text style={styles.dragHintText}>{strings.pinInstruction}</Text>
          </View>
        )}
      </View>

      {/* GPS FALLBACK BANNER: permission denied or position fetch failed -
          non-blocking, manual pin placement remains fully available below. */}
      {locationErrorMessage && (
        <View style={styles.gpsFallbackBanner} accessible accessibilityRole="alert">
          <AppIcon icon={{ set: "ion", name: "information-circle" }} size={16} color={colors.slate700} style={styles.gpsFallbackIcon} />
          <Text style={styles.gpsFallbackText}>{locationErrorMessage}</Text>
        </View>
      )}

      {/* BOTTOM CONFIRMATION DOCK */}
      <View style={[styles.bottomDock, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.addressSummaryRow}>
          <View style={styles.addressPinIconBox}>
            <AppIcon icon={{ set: "ion", name: "location" }} size={20} color={colors.slate700} style={styles.addressPinIcon} />
          </View>
          <View style={styles.addressTextGroup}>
            <Text style={styles.addressMainText} numberOfLines={1}>
              {coordinates ? currentAddress : locating ? strings.locatingText : strings.noPickupYet}
            </Text>
            {coordinates && (
              <Text style={styles.addressCoordsText} numberOfLines={1}>
                {addressLine2 || `${strings.coordinatesLabel}: ${formatCoordinates(coordinates)}`}
              </Text>
            )}
          </View>
        </View>

        {/* Primary Action: Confirm Pickup Location */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.confirmPickupButton}
          accessibilityHint="Confirms the selected coordinates and proceeds to ambulance selection"
          disabled={!canConfirm}
          style={({ pressed }) => [
            styles.confirmButton,
            !canConfirm && styles.confirmButtonDisabled,
            pressed && styles.confirmButtonPressed,
          ]}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmButtonText}>
            {canConfirm
              ? strings.confirmPickupButton
              : strings.confirmDisabledText}
          </Text>
        </Pressable>

        {canConfirm && (
          <Text style={styles.nextStepHint}>{strings.nextStepNotice}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },

  /* HEADER */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    zIndex: 20,
    elevation: 2,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
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
  headerTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerTagline: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
  },

  /* BILINGUAL TOGGLE */
  languageToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderRadius: radii.full,
    padding: 2,
    borderWidth: 1.5,
    borderColor: colors.slate300,
  },
  langButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    minHeight: 32,
  },
  langButtonActive: {
    backgroundColor: colors.slate900,
  },
  langButtonText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate700,
  },
  langButtonTextActive: {
    color: colors.white,
  },
  langDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.slate300,
  },

  /* SEARCH BAR */
  searchBarContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    zIndex: 100,
    elevation: 30,
  },
  searchBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 90,
    elevation: 25,
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  searchTextInput: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate900,
  },
  clearSearchButton: {
    padding: 4,
  },
  clearSearchIcon: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.slate600,
  },

  /* DROPDOWN */
  searchDropdown: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    maxHeight: "85%",
    ...shadows.md,
    // Above the pin/badge/Locate Me (elevation <= 20): on Android elevation, not just zIndex, orders siblings.
    zIndex: 100,
    elevation: 30,
    padding: spacing.sm,
  },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    marginBottom: spacing.xs,
  },
  dropdownTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
    textTransform: "uppercase",
  },
  dropdownCloseText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },
  landmarkItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
  },
  landmarkIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  landmarkIcon: {
    fontSize: 16,
  },
  landmarkTextGroup: {
    flex: 1,
    marginRight: spacing.sm,
  },
  landmarkName: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  landmarkAddress: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 2,
  },

  /* MAP CANVAS */
  mapUnavailable: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
  },
  mapUnavailableText: {
    color: colors.slate600,
    textAlign: "center",
    fontWeight: "600",
  },
  mapContainer: {
    flex: 1,
    backgroundColor: colors.slate200, // nearest existing token; subtle realistic road map canvas color
    overflow: "hidden",
    position: "relative",
  },

  /* CENTER-PIN MARKER */
  centerPinWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 15,
    elevation: 15,
  },
  pinAnimatedGroup: {
    alignItems: "center",
  },
  pinCalloutBubble: {
    backgroundColor: colors.slate900,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
    marginBottom: 6,
    alignItems: "center",
    ...shadows.md,
  },
  pinCalloutTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  pinCalloutCoords: {
    fontSize: 10,
    color: colors.slate300,
    fontWeight: typography.fontWeights.medium,
    marginTop: 1,
  },
  pinMarkerBody: {
    alignItems: "center",
  },
  pinHead: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.emergency,
    borderWidth: 2,
    borderColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.md,
  },
  pinCrossH: {
    position: "absolute",
    width: 16,
    height: 5,
    backgroundColor: colors.white,
    borderRadius: 1.5,
  },
  pinCrossV: {
    position: "absolute",
    width: 5,
    height: 16,
    backgroundColor: colors.white,
    borderRadius: 1.5,
  },
  pinStem: {
    width: 4,
    height: 12,
    backgroundColor: colors.emergencyDark,
    marginTop: -2,
    borderRadius: 2,
  },
  pinGroundShadow: {
    width: 14,
    height: 6,
    borderRadius: 7,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    marginTop: -4,
  },

  /* GPS LOCATE ME BUTTON */
  locateMeButton: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.md,
    zIndex: 20,
  },
  locateMeButtonPressed: {
    backgroundColor: colors.slate100,
    transform: [{ scale: 0.98 }],
  },
  locateMeIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  locateMeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },

  /* DRAG HINT */
  dragHintContainer: {
    position: "absolute",
    bottom: spacing.md,
    left: spacing.lg,
    zIndex: 10,
    elevation: 10,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
  },
  dragHintText: {
    fontSize: 10,
    color: colors.slate700,
    fontWeight: typography.fontWeights.semibold,
  },

  /* GPS FALLBACK BANNER (non-blocking) */
  gpsFallbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.slate300,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  gpsFallbackIcon: {
    marginRight: spacing.sm,
  },
  gpsFallbackText: {
    flex: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
  },

  /* BOTTOM DOCK */
  bottomDock: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: 1.5,
    borderTopColor: colors.slate200,
    ...shadows.md,
    zIndex: 20,
    elevation: 8,
  },
  addressSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  addressPinIconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  addressPinIcon: {
    fontSize: 20,
  },
  addressTextGroup: {
    flex: 1,
  },
  addressMainText: {
    fontSize: typography.fontSizes.base,
    lineHeight: typography.lineHeights.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  addressCoordsText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 2,
    fontWeight: typography.fontWeights.medium,
  },
  confirmButton: {
    backgroundColor: colors.emergency,
    borderRadius: radii.xl,
    paddingVertical: 15,
    minHeight: 54,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.slate300,
    borderColor: colors.slate400,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonPressed: {
    backgroundColor: colors.emergencyDeep,
    transform: [{ scale: 0.99 }],
  },
  confirmButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  nextStepHint: {
    fontSize: 11,
    color: colors.slate600,
    textAlign: "center",
    marginTop: spacing.xs,
    fontWeight: typography.fontWeights.medium,
  },
});
