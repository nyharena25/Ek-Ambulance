import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Platform,
  StatusBar,
  Linking,
  PanResponder,
  Animated,
  Dimensions,
} from "react-native";
import * as Location from "expo-location";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import {
  resolveJurisdiction,
  JurisdictionResolution,
  GeoPoint,
} from "@sahayak/domain";
import { SupportedLanguage } from "../i18n/onboardingStrings";
import {
  locationStrings,
  LANDMARK_PRESETS,
  LandmarkPreset,
} from "../i18n/locationStrings";

import { AppIcon } from "../components";
export interface PickupLocationScreenProps {
  onConfirmPickup?: (data: {
    point: GeoPoint;
    resolution: JurisdictionResolution;
    address: string;
  }) => void;
  onBack?: () => void;
  initialLanguage?: SupportedLanguage;
  initialLocation?: GeoPoint;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Default coordinates: AIIMS New Delhi (Main Emergency Ward)
const DEFAULT_COORDINATES: GeoPoint = {
  latitude: 28.5672,
  longitude: 77.2100,
};

export default function PickupLocationScreen({
  onConfirmPickup,
  onBack,
  initialLanguage = "en",
  initialLocation = DEFAULT_COORDINATES,
}: PickupLocationScreenProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const strings = locationStrings[language];

  // Map center coordinates & domain jurisdiction resolution
  const [coordinates, setCoordinates] = useState<GeoPoint>(initialLocation);
  const [jurisdiction, setJurisdiction] = useState<JurisdictionResolution>(() =>
    resolveJurisdiction(initialLocation)
  );

  // Address description state
  const [currentAddress, setCurrentAddress] = useState(
    language === "hi"
      ? "एम्स नई दिल्ली, मुख्य आपातकालीन वार्ड"
      : "AIIMS New Delhi, Main Emergency Ward"
  );

  // Search query & suggestion dropdown
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Center pin elevation animation (lifts up on pan, drops on release)
  const pinElevationAnim = useRef(new Animated.Value(0)).current;
  const mapPanX = useRef(new Animated.Value(0)).current;
  const mapPanY = useRef(new Animated.Value(0)).current;

  // Track pan delta for simulated map panning
  const panOffset = useRef({ x: 0, y: 0 });

  // Non-blocking GPS fallback banner: set on permission denial or a
  // getCurrentPositionAsync failure, cleared automatically - manual pin
  // placement (already fully functional) is never blocked by this.
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);

  // Update jurisdiction whenever coordinates change
  const updateCoordinates = useCallback((newCoords: GeoPoint, label?: string) => {
    setCoordinates(newCoords);
    const res = resolveJurisdiction(newCoords);
    setJurisdiction(res);
    if (label) {
      setCurrentAddress(label);
    }
  }, []);

  // Handle GPS "Locate Me": real device location via expo-location, with a
  // non-blocking fallback banner (never a crash, never a blocked flow) if
  // permission is denied or the GPS fix itself fails.
  const handleLocateMe = async () => {
    setLocationErrorMessage(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationErrorMessage(strings.locationPermissionDeniedBanner);
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      const newCoords: GeoPoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      updateCoordinates(
        newCoords,
        language === "hi" ? "वर्तमान GPS स्थान" : "Current GPS Position"
      );
      Animated.spring(mapPanX, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(mapPanY, { toValue: 0, useNativeDriver: true }).start();
      panOffset.current = { x: 0, y: 0 };
    } catch {
      // GPS disabled, no fix available, or any other native failure -
      // manual pin placement stays fully available.
      setLocationErrorMessage(strings.locationUnavailableBanner);
    }
  };

  // Handle emergency 108 phone dialer fallback
  const handleCall108 = () => {
    Linking.openURL("tel:108");
  };

  // PanResponder for gesture-driven interactive map movement
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Lift pin up when user touches map
        Animated.spring(pinElevationAnim, {
          toValue: -14,
          useNativeDriver: true,
          speed: 20,
        }).start();
      },
      onPanResponderMove: (_evt, gestureState) => {
        // Visual parallax pan of road grid
        mapPanX.setValue(panOffset.current.x + gestureState.dx);
        mapPanY.setValue(panOffset.current.y + gestureState.dy);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        // Drop pin down when user releases
        Animated.spring(pinElevationAnim, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 8,
        }).start();

        panOffset.current.x += gestureState.dx;
        panOffset.current.y += gestureState.dy;

        // Convert pixel pan delta to latitude & longitude offset
        // ~100px roughly corresponds to 0.015 degrees (~1.6 km)
        const latDelta = -(gestureState.dy / 3000);
        const lonDelta = gestureState.dx / 3000;

        setCoordinates((prev) => {
          const updated = {
            latitude: Number((prev.latitude + latDelta).toFixed(4)),
            longitude: Number((prev.longitude + lonDelta).toFixed(4)),
          };
          const res = resolveJurisdiction(updated);
          setJurisdiction(res);
          setCurrentAddress(
            `${updated.latitude.toFixed(4)}° N, ${updated.longitude.toFixed(
              4
            )}° E`
          );
          return updated;
        });
      },
    })
  ).current;

  // Handle Landmark Selection from Search List
  const handleSelectLandmark = (item: LandmarkPreset) => {
    setIsSearchActive(false);
    setSearchQuery("");
    const targetPoint: GeoPoint = {
      latitude: item.latitude,
      longitude: item.longitude,
    };
    updateCoordinates(
      targetPoint,
      language === "hi" ? item.hindiAddress : item.address
    );
  };

  // Handle Confirmation
  const handleConfirm = () => {
    if (!jurisdiction.isSupported) return;
    if (onConfirmPickup) {
      onConfirmPickup({
        point: coordinates,
        resolution: jurisdiction,
        address: currentAddress,
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

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
              onPress={() => {
                setSearchQuery("");
                setIsSearchActive(false);
              }}
              style={styles.clearSearchButton}
            >
              <AppIcon icon={{ set: "ion", name: "close" }} size={14} style={styles.clearSearchIcon} />
            </Pressable>
          )}
        </View>

        {/* Autocomplete Dropdown */}
        {isSearchActive && (
          <View style={styles.searchDropdown}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>
                {strings.searchRecentTitle}
              </Text>
              <Pressable onPress={() => setIsSearchActive(false)}>
                <Text style={styles.dropdownCloseText}>Done</Text>
              </Pressable>
            </View>

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
                <View
                  style={[
                    styles.landmarkStateTag,
                    item.expectedState === "DL"
                      ? styles.stateTagDL
                      : item.expectedState === "UP"
                      ? styles.stateTagUP
                      : styles.stateTagOOB,
                  ]}
                >
                  <Text
                    style={[
                      styles.landmarkStateTag,
                      item.expectedState === "DL"
                        ? styles.stateTextDL
                        : item.expectedState === "UP"
                        ? styles.stateTextUP
                        : styles.stateTextOOB,
                    ]}
                  >
                    {item.expectedState}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* INTERACTIVE MAP CANVAS WITH CENTER-PIN MARKER */}
      <View style={styles.mapContainer} {...panResponder.panHandlers}>
        {/* Visual Map Grid Lines */}
        <Animated.View
          style={[
            styles.mapGridLayer,
            {
              transform: [
                { translateX: mapPanX },
                { translateY: mapPanY },
              ],
            },
          ]}
        >
          {/* Simulated Road Grids */}
          <View style={styles.mapRoadHorizontal1} />
          <View style={styles.mapRoadHorizontal2} />
          <View style={styles.mapRoadHorizontal3} />
          <View style={styles.mapRoadVertical1} />
          <View style={styles.mapRoadVertical2} />
          <View style={styles.mapRoadVertical3} />

          {/* Simulated Landmarks on the map */}
          <View style={[styles.mapLandmarkDot, { top: 120, left: 80 }]}>
            <Text style={styles.mapLandmarkLabel}><AppIcon icon={{ set: "mci", name: "hospital-building" }} size={11} />{" "}AIIMS Delhi</Text>
          </View>
          <View style={[styles.mapLandmarkDot, { top: 220, left: 240 }]}>
            <Text style={styles.mapLandmarkLabel}><AppIcon icon={{ set: "ion", name: "business" }} size={11} />{" "}Connaught Pl</Text>
          </View>
          <View style={[styles.mapLandmarkDot, { top: 310, left: 160 }]}>
            <Text style={styles.mapLandmarkLabel}><AppIcon icon={{ set: "mci", name: "ambulance" }} size={11} />{" "}Dispatch Hub</Text>
          </View>
        </Animated.View>

        {/* FLOATING TOP BADGE: DYNAMIC JURISDICTION RESOLUTION */}
        <View style={styles.topOverlayContainer}>
          <View
            style={[
              styles.jurisdictionBadge,
              jurisdiction.stateCode === "DL" && styles.badgeDL,
              jurisdiction.stateCode === "UP" && styles.badgeUP,
              jurisdiction.stateCode === "OUT_OF_BOUNDS" && styles.badgeOOB,
            ]}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`${strings.jurisdictionLabel}: ${jurisdiction.displayName}`}
          >
            <View
              style={[
                styles.jurisdictionDot,
                jurisdiction.stateCode === "DL" && styles.dotDL,
                jurisdiction.stateCode === "UP" && styles.dotUP,
                jurisdiction.stateCode === "OUT_OF_BOUNDS" && styles.dotOOB,
              ]}
            />
            <View>
              <Text
                style={[
                  styles.jurisdictionTitleText,
                  jurisdiction.stateCode === "DL" && styles.textDL,
                  jurisdiction.stateCode === "UP" && styles.textUP,
                  jurisdiction.stateCode === "OUT_OF_BOUNDS" && styles.textOOB,
                ]}
              >
                {language === "hi"
                  ? jurisdiction.hindiDisplayName
                  : jurisdiction.displayName}
              </Text>
              <Text style={styles.jurisdictionSubText}>
                {jurisdiction.statutoryFramework}
              </Text>
            </View>
          </View>
        </View>

        {/* FIXED CENTER-PIN MARKER (GEOMETRICALLY CENTERED) */}
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
        <View style={styles.dragHintContainer} pointerEvents="none">
          <Text style={styles.dragHintText}>{strings.pinInstruction}</Text>
        </View>
      </View>

      {/* GPS FALLBACK BANNER: permission denied or position fetch failed -
          non-blocking, manual pin placement remains fully available below. */}
      {locationErrorMessage && (
        <View style={styles.gpsFallbackBanner} accessible accessibilityRole="alert">
          <AppIcon icon={{ set: "ion", name: "information-circle" }} size={16} color={colors.slate700} style={styles.gpsFallbackIcon} />
          <Text style={styles.gpsFallbackText}>{locationErrorMessage}</Text>
        </View>
      )}

      {/* OUT-OF-ZONE WARNING BANNER WITH 108 EMERGENCY DIALER FALLBACK */}
      {!jurisdiction.isSupported && (
        <View
          style={styles.outOfZoneBanner}
          accessible={true}
          accessibilityRole="alert"
        >
          <View style={styles.warningHeaderRow}>
            <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.slate700} style={styles.warningAlertIcon} />
            <Text style={styles.warningAlertTitle}>
              {strings.outOfZoneTitle}
            </Text>
          </View>

          <Text style={styles.warningAlertDescription}>
            {language === "hi"
              ? jurisdiction.hindiWarningMessage || strings.outOfZoneDescription
              : jurisdiction.warningMessage || strings.outOfZoneDescription}
          </Text>

          {/* Direct 108 Helpline Dialer Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.call108Button}
            accessibilityHint="Dials toll-free national ambulance helpline 108"
            style={({ pressed }) => [
              styles.call108Button,
              pressed && styles.call108ButtonPressed,
            ]}
            onPress={handleCall108}
          >
            <AppIcon icon={{ set: "ion", name: "call" }} size={20} color={colors.slate700} style={styles.call108PhoneIcon} />
            <View>
              <Text style={styles.call108ButtonTitle}>
                {strings.call108Button}
              </Text>
              <Text style={styles.call108ButtonSubtitle}>
                {strings.call108Subtitle}
              </Text>
            </View>
          </Pressable>
        </View>
      )}

      {/* BOTTOM CONFIRMATION DOCK */}
      <View style={styles.bottomDock}>
        <View style={styles.addressSummaryRow}>
          <View style={styles.addressPinIconBox}>
            <AppIcon icon={{ set: "ion", name: "location" }} size={20} color={colors.slate700} style={styles.addressPinIcon} />
          </View>
          <View style={styles.addressTextGroup}>
            <Text style={styles.addressMainText} numberOfLines={1}>
              {currentAddress}
            </Text>
            <Text style={styles.addressCoordsText}>
              {strings.coordinatesLabel}: {coordinates.latitude.toFixed(4)}° N,{" "}
              {coordinates.longitude.toFixed(4)}° E
            </Text>
          </View>
        </View>

        {/* Primary Action: Confirm Pickup Location */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.confirmPickupButton}
          accessibilityHint="Confirms the selected coordinates and proceeds to ambulance selection"
          disabled={!jurisdiction.isSupported}
          style={({ pressed }) => [
            styles.confirmButton,
            !jurisdiction.isSupported && styles.confirmButtonDisabled,
            pressed && styles.confirmButtonPressed,
          ]}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmButtonText}>
            {jurisdiction.isSupported
              ? strings.confirmPickupButton
              : strings.confirmDisabledText}
          </Text>
        </Pressable>

        {jurisdiction.isSupported && (
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
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
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
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  headerTagline: {
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
    zIndex: 30,
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate100,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.slate300,
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
    top: 56,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    maxHeight: 280,
    ...shadows.md,
    zIndex: 40,
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
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
    textTransform: "uppercase",
  },
  dropdownCloseText: {
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
  landmarkStateTag: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  stateTagDL: {
    backgroundColor: colors.successLight,
  },
  stateTextDL: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success,
  },
  stateTagUP: {
    backgroundColor: colors.infoLight,
  },
  stateTextUP: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.info,
  },
  stateTagOOB: {
    backgroundColor: colors.emergencyLight,
  },
  stateTextOOB: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.emergencyDark,
  },

  /* MAP CANVAS */
  mapContainer: {
    flex: 1,
    backgroundColor: colors.slate200, // nearest existing token; subtle realistic road map canvas color
    overflow: "hidden",
    position: "relative",
  },
  mapGridLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: SCREEN_WIDTH * 2,
    height: 900,
  },
  mapRoadHorizontal1: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: colors.slate300,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.slate400,
  },
  mapRoadHorizontal2: {
    position: "absolute",
    top: 240,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: colors.slate300,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.slate400,
  },
  mapRoadHorizontal3: {
    position: "absolute",
    top: 380,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: colors.slate300,
  },
  mapRoadVertical1: {
    position: "absolute",
    left: 120,
    top: 0,
    bottom: 0,
    width: 16,
    backgroundColor: colors.slate300,
  },
  mapRoadVertical2: {
    position: "absolute",
    left: 280,
    top: 0,
    bottom: 0,
    width: 24,
    backgroundColor: colors.slate300,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.slate400,
  },
  mapRoadVertical3: {
    position: "absolute",
    left: 440,
    top: 0,
    bottom: 0,
    width: 14,
    backgroundColor: colors.slate300,
  },
  mapLandmarkDot: {
    position: "absolute",
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  mapLandmarkLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.slate800,
  },

  /* TOP OVERLAY: DYNAMIC JURISDICTION BADGE */
  topOverlayContainer: {
    position: "absolute",
    top: spacing.md,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    alignItems: "center",
  },
  jurisdictionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.md,
  },
  badgeDL: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  badgeUP: {
    backgroundColor: colors.infoLight,
    borderColor: colors.info,
  },
  badgeOOB: {
    backgroundColor: colors.emergencyLight,
    borderColor: colors.emergencyDark,
  },
  jurisdictionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotDL: {
    backgroundColor: colors.success,
  },
  dotUP: {
    backgroundColor: colors.info,
  },
  dotOOB: {
    backgroundColor: colors.emergencyDark,
  },
  jurisdictionTitleText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  textDL: {
    color: colors.success,
  },
  textUP: {
    color: colors.info,
  },
  textOOB: {
    color: colors.emergencyDark,
  },
  jurisdictionSubText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
    marginTop: 1,
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

  /* OUT-OF-ZONE WARNING BANNER & 108 DIALER */
  outOfZoneBanner: {
    backgroundColor: colors.emergencyLight,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.emergencyDark,
    padding: spacing.md,
    zIndex: 25,
  },
  warningHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  warningAlertIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  warningAlertTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.emergencyDark,
  },
  warningAlertDescription: {
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
    color: colors.slate800,
    marginBottom: spacing.md,
  },
  call108Button: {
    backgroundColor: colors.emergency,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.emergencyDark,
    ...shadows.emergency,
  },
  call108ButtonPressed: {
    backgroundColor: colors.emergencyDeep,
  },
  call108PhoneIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  call108ButtonTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  call108ButtonSubtitle: {
    fontSize: 10,
    color: colors.emergencyLight,
    fontWeight: typography.fontWeights.medium,
  },

  /* BOTTOM DOCK */
  bottomDock: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.base,
    borderTopWidth: 1.5,
    borderTopColor: colors.slate200,
    ...shadows.md,
    zIndex: 20,
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
