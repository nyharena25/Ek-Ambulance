import assert from "node:assert";
import { DEV_DRIVER_PROFILES, DEV_OTP } from "../config/devDriverProfiles.ts";
import { devVerifyOtp } from "./devAuth.core.ts";
import { useDriverStandbyStore } from "../state/driverStandby.store.ts";
import { useDriverOnboardingStore } from "../state/driverOnboarding.store.ts";

console.log("Running Driver Dev Mock OTP Tests");

const phones = Object.keys(DEV_DRIVER_PROFILES);
assert.strictEqual(phones.length, 5);

for (const phone of phones) {
  const profile = DEV_DRIVER_PROFILES[phone]!;
  const result = devVerifyOtp(phone, DEV_OTP);
  assert.ok(result && result.ok, `${phone} authenticates with ${DEV_OTP}`);
  assert.strictEqual(result.session.user.app_metadata.role, "driver");
  assert.strictEqual(result.session.user.phone, phone);

  const bad = devVerifyOtp(phone, "000000");
  assert.ok(bad && !bad.ok && bad.error.error === "invalid_otp", `${phone} rejects wrong OTP`);

  const approved = useDriverOnboardingStore.getState().submissionResult?.status === "APPROVED";
  assert.strictEqual(approved, profile.isVerified, `${phone} verified status`);
  if (profile.ais125Type) {
    assert.strictEqual(useDriverStandbyStore.getState().registeredAis125Type, profile.ais125Type);
    assert.strictEqual(useDriverOnboardingStore.getState().formData.ais125VehicleType, profile.ais125Type);
    assert.strictEqual(result.session.user.id, `dev-driver-${profile.ais125Type.toLowerCase()}-uuid`);
  }
}

assert.strictEqual(devVerifyOtp("+919999999999", DEV_OTP), null, "non-dev numbers fall through to Supabase");
console.log("✓ All dev driver mock OTP tests passed.");
