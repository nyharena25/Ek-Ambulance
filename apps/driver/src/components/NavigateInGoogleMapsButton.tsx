import { Linking, Platform, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { colors, radii, spacing, typography } from "@sahayak/ui";
import { buildNavigationLinks, type GeoPoint } from "@sahayak/domain";
import AppIcon from "./AppIcon";

const LABELS = {
  en: { title: "Navigate in Google Maps", pickup: "To patient pickup", hospital: "To trauma hospital ER" },
  hi: { title: "Google Maps में नेविगेट करें", pickup: "मरीज के पिकअप तक", hospital: "ट्रॉमा अस्पताल ER तक" },
} as const;

/** `origin` plans the trip from that point (e.g. the pickup) instead of the phone's live position. */
export async function openGoogleMapsNavigation(dest: GeoPoint, origin?: GeoPoint): Promise<void> {
  const { android, universal } = buildNavigationLinks(dest, origin);
  // No canOpenURL gate: Android 11+ needs manifest <queries> for it, unavailable in Expo Go.
  if (Platform.OS === "android" && android) {
    try {
      await Linking.openURL(android);
      return;
    } catch {
      // Google Maps not installed - fall through to the universal link.
    }
  }
  await Linking.openURL(universal).catch(() => undefined);
}

export interface NavigateInGoogleMapsButtonProps {
  destination: GeoPoint;
  target: "pickup" | "hospital";
  language?: "en" | "hi";
}

export default function NavigateInGoogleMapsButton({
  destination,
  target,
  language = "en",
}: NavigateInGoogleMapsButtonProps) {
  const labels = LABELS[language];
  const subtitle = labels[target];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${labels.title}. ${subtitle}`}
      onPress={() => {
        Vibration.vibrate(15);
        void openGoogleMapsNavigation(destination);
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <AppIcon icon={{ set: "mci", name: "google-maps" }} size={28} color={colors.white} />
      <View style={styles.textBox}>
        <Text style={styles.title}>{labels.title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <AppIcon icon={{ set: "ion", name: "navigate" }} size={22} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.info, // #1D4ED8, 7.3:1 against white text
    borderWidth: 2,
    borderColor: colors.white,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  textBox: { flex: 1 },
  title: { color: colors.white, fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold },
  subtitle: { color: colors.white, fontSize: typography.fontSizes.xs, opacity: 0.9 },
});
