import assert from "node:assert";
import { useDriverOnboardingStore } from "./driverOnboarding.store.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver KYC Onboarding Store Tests");
console.log("=================================================\n");

const resetStore = () => useDriverOnboardingStore.getState().resetOnboarding();

console.log("Test 1: Step 1 (CDL) rejects a too-short license number...");
resetStore();
useDriverOnboardingStore.getState().updateField("commercialDlNumber", "DL-1");
useDriverOnboardingStore.getState().updateField("dlExpiry", "");
useDriverOnboardingStore.getState().updateField("psvBadgeNumber", "");
assert.strictEqual(
  useDriverOnboardingStore.getState().validateCurrentStep(),
  false,
  "Short CDL, missing expiry, and missing PSV badge must fail step 1"
);
const step1Errors = useDriverOnboardingStore.getState().stepErrors[1];
assert.ok(step1Errors?.includes("VALIDATION_INVALID_DL"), "Flags invalid DL number");
assert.ok(step1Errors?.includes("VALIDATION_EXPIRED_DL"), "Flags missing/expired DL date");
assert.ok(step1Errors?.includes("VALIDATION_MISSING_PSV"), "Flags missing PSV badge");
console.log("✓ Step 1 correctly rejects incomplete/invalid CDL fields.\n");

console.log("Test 2: Step 1 passes with the seeded valid defaults...");
resetStore();
assert.strictEqual(
  useDriverOnboardingStore.getState().validateCurrentStep(),
  true,
  "The store's own seeded default CDL data must be internally valid"
);
console.log("✓ Step 1 accepts a well-formed CDL submission.\n");

console.log("Test 3: Step 2 (EMT) requires a certificate number and issuing council...");
resetStore();
useDriverOnboardingStore.getState().setStep(2);
useDriverOnboardingStore.getState().updateField("emtNumber", "");
useDriverOnboardingStore.getState().updateField("emtCouncil", "");
assert.strictEqual(
  useDriverOnboardingStore.getState().validateCurrentStep(),
  false,
  "Missing EMT number and council must fail step 2"
);
const step2Errors = useDriverOnboardingStore.getState().stepErrors[2];
assert.ok(step2Errors?.includes("VALIDATION_MISSING_EMT"), "Flags missing EMT certificate number");
assert.ok(step2Errors?.includes("VALIDATION_MISSING_COUNCIL"), "Flags missing issuing council");
console.log("✓ Step 2 enforces EMT certificate fields.\n");

console.log("Test 4: Step 3 requires a vehicle registration and AIS-125 classification...");
resetStore();
useDriverOnboardingStore.getState().setStep(3);
useDriverOnboardingStore.getState().updateField("vehicleRegistrationNumber", "AB");
useDriverOnboardingStore.getState().updateField("makeModel", "");
assert.strictEqual(
  useDriverOnboardingStore.getState().validateCurrentStep(),
  false,
  "Short registration number and missing make/model must fail step 3"
);
const step3Errors = useDriverOnboardingStore.getState().stepErrors[3];
assert.ok(step3Errors?.includes("VALIDATION_INVALID_VEHICLE_REG"), "Flags invalid vehicle registration");
assert.ok(step3Errors?.includes("VALIDATION_MISSING_MAKE_MODEL"), "Flags missing make/model");
console.log("✓ Step 3 enforces vehicle registration fields.\n");

console.log("Test 5: Step 4 requires ARAI, Fitness Permit, and RC uploads...");
resetStore();
useDriverOnboardingStore.getState().setStep(4);
useDriverOnboardingStore.getState().removeDocument("arai_certificate");
useDriverOnboardingStore.getState().removeDocument("fitness_permit");
useDriverOnboardingStore.getState().removeDocument("vehicle_rc");
assert.strictEqual(
  useDriverOnboardingStore.getState().validateCurrentStep(),
  false,
  "Missing statutory documents must fail step 4"
);
const step4Errors = useDriverOnboardingStore.getState().stepErrors[4];
assert.ok(step4Errors?.includes("VALIDATION_MISSING_ARAI"), "Flags missing ARAI certificate");
assert.ok(step4Errors?.includes("VALIDATION_MISSING_FITNESS"), "Flags missing fitness permit");
assert.ok(step4Errors?.includes("VALIDATION_MISSING_RC"), "Flags missing RC");
console.log("✓ Step 4 enforces all three mandatory statutory documents.\n");

console.log("Test 6: setStep clamps to the valid [1, 4] wizard range...");
resetStore();
useDriverOnboardingStore.getState().setStep(99);
assert.strictEqual(useDriverOnboardingStore.getState().currentStep, 4, "Clamps above range to step 4");
useDriverOnboardingStore.getState().setStep(-5);
assert.strictEqual(useDriverOnboardingStore.getState().currentStep, 1, "Clamps below range to step 1");
console.log("✓ Step navigation stays within the 4-step wizard bounds.\n");

console.log("Test 7: submitApplication resolves the AIS-125 type into the correct care-level code...");
resetStore();
useDriverOnboardingStore.getState().setAIS125VehicleType("TYPE_C_BLS");
const submitted = await useDriverOnboardingStore.getState().submitApplication();
assert.strictEqual(submitted, true, "Submission succeeds when called directly");
const result = useDriverOnboardingStore.getState().submissionResult;
assert.strictEqual(result?.vehicleType, "TYPE_C_BLS");
assert.strictEqual(result?.careLevelCode, "BLS (Basic Life Support)", "Type C maps to the BLS care-level label");
assert.strictEqual(result?.status, "PENDING_STA_VERIFICATION");
console.log("✓ Submission carries the selected AIS-125 tier through to the result.\n");

console.log("=================================================");
console.log("ALL DRIVER KYC ONBOARDING STORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
