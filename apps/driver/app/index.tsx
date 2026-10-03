import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "@sahayak/ui";
import { driverKycGate } from "../src/hooks/otpAuth.core";
import { useDriverAuthStore } from "../src/state/driverAuth.store";
import { useDriverProfileStore } from "../src/state/driverProfile.store";
import { useDriverStandbyStore } from "../src/state/driverStandby.store";
import { driverVerificationStrings } from "../src/i18n/driverVerificationStrings";
import { confirmDriverSignOut } from "../src/screens/DriverVerificationScreen";
import { useDriverConsentStore } from "../src/state/driverConsent.store";
import { retrySessionRestore } from "../src/hooks/useServerSync";
import { signOut } from "../src/lib/driverServer";

/**
 * App entry. The root layout's route gate redirects from here once it knows both the session and the server's KYC state;
 * until then this says so. If the KYC state cannot be read the driver stays here - never on the shift - with a retry.
 */
export default function Index() {
  const status = useDriverAuthStore((s) => s.status);
  const kyc = useDriverProfileStore(driverKycGate);
  const consent = useDriverConsentStore((s) => s.gate);
  const t = driverVerificationStrings[useDriverStandbyStore((s) => s.language)];
  const [retrying, setRetrying] = useState(false);

  // A stored session the device could not renew (offline): still this driver's, never the sign-in screen.
  if (status === "restoring") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.white, justifyContent: "center", padding: spacing.xl, gap: spacing.md }}>
        <Text accessibilityRole="header" style={{ fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900 }}>
          {t.restoringTitle}
        </Text>
        <Text style={{ color: colors.slate700 }}>{t.restoringBody}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={retrying}
          onPress={() => {
            setRetrying(true);
            void retrySessionRestore().finally(() => setRetrying(false));
          }}
          style={{ minHeight: 48, borderRadius: radii.md, backgroundColor: colors.slate900, alignItems: "center", justifyContent: "center" }}
        >
          {retrying ? <ActivityIndicator color={colors.white} /> : <Text style={{ color: colors.white, fontWeight: typography.fontWeights.bold }}>{t.retry}</Text>}
        </Pressable>
        {/* Local scope: nothing to revoke on the server. auth-js still needs to read (refresh) the stored session first, so
            while the device is offline it refuses - said so, never a silent no-op. */}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void signOut("local").then((r) => {
              if (!r.ok) Alert.alert(t.signOutFailed);
            })
          }
          style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: colors.slate700, fontWeight: typography.fontWeights.semibold }}>{t.signOut}</Text>
        </Pressable>
      </View>
    );
  }
  if (status !== "signedIn") return <View style={{ flex: 1, backgroundColor: colors.white }} />;
  const failed = kyc === "error" || consent === "error";
  if (!failed) {
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
        onPress={() => {
          if (kyc === "error") void useDriverProfileStore.getState().load();
          const consentStore = useDriverConsentStore.getState();
          if (consent === "error" && consentStore.userId) void consentStore.load(consentStore.userId);
        }}
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
