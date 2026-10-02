import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "@sahayak/ui";
import { driverKycGate } from "../src/hooks/otpAuth.core";
import { useDriverAuthStore } from "../src/state/driverAuth.store";
import { useDriverProfileStore } from "../src/state/driverProfile.store";
import { useDriverStandbyStore } from "../src/state/driverStandby.store";
import { driverVerificationStrings } from "../src/i18n/driverVerificationStrings";
import { confirmDriverSignOut } from "../src/screens/DriverVerificationScreen";

/**
 * App entry. The root layout's route gate redirects from here once it knows both the session and the server's KYC state;
 * until then this says so. If the KYC state cannot be read the driver stays here - never on the shift - with a retry.
 */
export default function Index() {
  const signedIn = useDriverAuthStore((s) => s.status === "signedIn");
  const kyc = useDriverProfileStore(driverKycGate);
  const t = driverVerificationStrings[useDriverStandbyStore((s) => s.language)];

  if (!signedIn) return <View style={{ flex: 1, backgroundColor: colors.white }} />;
  if (kyc !== "error") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
        <ActivityIndicator color={colors.slate700} />
        <Text style={{ color: colors.slate600 }}>{t.loading}</Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, justifyContent: "center", padding: spacing.xl, gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900 }}>
        {t.loadFailedTitle}
      </Text>
      <Text style={{ color: colors.slate700 }}>{t.loadFailedBody}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void useDriverProfileStore.getState().load()}
        style={{ minHeight: 48, borderRadius: radii.md, backgroundColor: colors.slate900, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: colors.white, fontWeight: typography.fontWeights.bold }}>{t.retry}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => confirmDriverSignOut(t)} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.slate700, fontWeight: typography.fontWeights.semibold }}>{t.signOut}</Text>
      </Pressable>
    </View>
  );
}
