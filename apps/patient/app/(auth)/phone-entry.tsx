import { useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { PhoneAuthScreen } from "../../src/screens";
import { VerifyOtpResponse } from "../../src/hooks/useOtpAuth";
import { recordConsent } from "../../src/lib/missionApi";
import { realAccessToken, usePatientAuthStore } from "../../src/state/patientAuth.store";

/** Version of the DPDP notice text shown on the phone screen; bump when that text changes. */
const CONSENT_NOTICE_VERSION = "2026-09";

export default function PhoneEntryScreen() {
  const router = useRouter();
  const { mode, phone, lang } = useLocalSearchParams<{ mode?: string; phone?: string; lang?: string }>();
  // Checked once, at mount: a patient who is already signed in never sees this screen (back navigation, a stale link).
  // Not re-checked live, so the session that a successful verify creates does not race handleAuthSuccess below.
  const [signedInAtMount] = useState(() => realAccessToken(usePatientAuthStore.getState().session) !== null);
  if (signedInAtMount) return <Redirect href="/(tabs)/home" />;

  const handleAuthSuccess = (_authResponse: VerifyOtpResponse) => {
    // Session is already persisted by supabaseClient's secure-store adapter
    // and mirrored into usePatientAuthStore via onAuthStateChange - nothing
    // further to do here but navigate. Home is where a request starts; an active
    // request is resumed from there by useResumeActiveMission.
    // Consent was ticked by the patient (the boxes start unticked); the server records it with its own timestamp.
    // Failures are ignored here: consent must never block an emergency flow.
    void recordConsent("geolocation", CONSENT_NOTICE_VERSION, true);
    void recordConsent("medical_data", CONSENT_NOTICE_VERSION, true);
    router.replace("/(tabs)/home");
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const isSignup = mode === "signup";
  return (
    <PhoneAuthScreen
      // Remount on a mode switch so the OTP step, errors and consent start fresh for the new flow; number and language carry.
      key={isSignup ? "signup" : "signin"}
      mode={isSignup ? "signup" : "signin"}
      initialPhone={phone}
      initialLanguage={lang === "hi" ? "hi" : "en"}
      onCreateAccount={(rawPhone, language) => router.setParams({ mode: "signup", phone: rawPhone, lang: language })}
      onSignIn={(rawPhone, language) => router.setParams({ mode: "signin", phone: rawPhone, lang: language })}
      onSuccess={handleAuthSuccess}
      onBack={handleBack}
    />
  );
}
