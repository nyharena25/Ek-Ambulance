import { useRouter } from "expo-router";
import { DriverOnboardingScreen, confirmDriverSignOut } from "../../src/screens";
import { useDriverProfileStore } from "../../src/state/driverProfile.store";
import { useDriverStandbyStore } from "../../src/state/driverStandby.store";
import { driverVerificationStrings } from "../../src/i18n/driverVerificationStrings";

export default function OnboardingRoute() {
  const router = useRouter();
  return (
    <DriverOnboardingScreen
      onFinishOnboarding={(_result) => {
        // Submitted: re-read the server's KYC state; the root route gate then opens the verification screen.
        void useDriverProfileStore.getState().load();
      }}
      onBackToAuth={() => {
        // An approved driver opened this from the shift: plain back. An applicant cannot reach the shift, so "back"
        // from the first step means leaving the account.
        if (useDriverProfileStore.getState().profile?.kycStatus === "approved" && router.canGoBack()) router.back();
        else confirmDriverSignOut(driverVerificationStrings[useDriverStandbyStore.getState().language]);
      }}
    />
  );
}
