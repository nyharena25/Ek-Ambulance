import assert from "node:assert";
import { EMPTY_FORM_DATA, useDriverOnboardingStore } from "./driverOnboarding.store.ts";
import { setServerAdapter, type ServerAdapter } from "./driverLifecycle.store.ts";
import { documentUploadErrorMessage } from "../lib/kycSubmission.core.ts";

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

console.log("Test 8: initForRealSession clears the __DEV__ seed once, and never overwrites real input...");
resetStore();
assert.strictEqual(useDriverOnboardingStore.getState().formData.commercialDlNumber, "DL-0420180098712", "starts from the dev seed");
useDriverOnboardingStore.getState().initForRealSession();
assert.strictEqual(useDriverOnboardingStore.getState().formData.commercialDlNumber, "", "real session starts blank, never a fake DL number");
assert.strictEqual(useDriverOnboardingStore.getState().documents.arai_certificate.status, "idle", "no document is falsely pre-marked uploaded");
useDriverOnboardingStore.getState().updateField("commercialDlNumber", "REAL-DL-123");
useDriverOnboardingStore.getState().initForRealSession();
assert.strictEqual(useDriverOnboardingStore.getState().formData.commercialDlNumber, "REAL-DL-123", "a second call must not wipe real input already typed");
console.log("✓ Real-session init is empty-once, never destructive to real input.\n");

// Real-server path: a recording fake adapter. Only the members uploadRealDocument touches are implemented.
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
type Call = { name: "submitApplication"; fields: Record<string, unknown> } | { name: "uploadDocument"; slot: string };
function fakeAdapter(userId: string, opts: { uploadError?: { code: string; detail?: string }; draftError?: { code: string } } = {}) {
  const calls: Call[] = [];
  const adapter = {
    userId,
    submitApplication: async (fields: Record<string, unknown>) => {
      calls.push({ name: "submitApplication", fields });
      return opts.draftError ? { ok: false, error: { ...opts.draftError, status: 403, retryable: false } } : { ok: true, data: { kycStatus: "draft" } };
    },
    uploadDocument: async (slot: string) => {
      calls.push({ name: "uploadDocument", slot });
      return opts.uploadError
        ? { ok: false, error: { ...opts.uploadError, status: 0, retryable: true } }
        : { ok: true, data: { slot, storagePath: `${userId}/${slot}/x.png`, sizeBytes: 2048 } };
    },
  } as unknown as ServerAdapter;
  return { adapter, calls };
}
const asset = { uri: "file:///cache/dl.png", name: "dl.png", mimeType: "image/png" };
const realStep1 = () => {
  resetStore();
  useDriverOnboardingStore.getState().initForRealSession();
  const s = useDriverOnboardingStore.getState();
  s.updateField("commercialDlNumber", "UP1620190012345");
  s.updateField("dlExpiry", "14/08/2030");
  s.updateField("dlState", "Uttar Pradesh");
  s.updateField("psvBadgeNumber", "PSV-4411");
  s.setAIS125VehicleType("TYPE_B_PTA");
};

console.log("Test 9: no draft yet -> the Step 1 draft (upsert_driver_application) is created BEFORE the first upload...");
realStep1();
{
  const { adapter, calls } = fakeAdapter(USER_A);
  setServerAdapter(adapter);
  await useDriverOnboardingStore.getState().uploadRealDocument("commercial_dl", asset);
  assert.deepStrictEqual(calls.map((c) => c.name), ["submitApplication", "uploadDocument"], "draft first, then the upload");
  const draft = calls[0] as Extract<Call, { name: "submitApplication" }>;
  assert.deepStrictEqual(Object.keys(draft.fields).sort(), ["ais125Type", "dlExpiry", "dlState", "licenseNumber", "psvBadgeNumber"], "only Step 1 values, no EMT/ACLS defaults");
  assert.strictEqual(draft.fields.ais125Type, "TYPE_B_PTA", "the type the driver chose");
  assert.strictEqual(draft.fields.dlExpiry, "2030-08-14");
  assert.strictEqual(useDriverOnboardingStore.getState().documents.commercial_dl.status, "uploaded");

  await useDriverOnboardingStore.getState().uploadRealDocument("emt_certificate", asset);
  assert.deepStrictEqual(calls.map((c) => c.name), ["submitApplication", "uploadDocument", "uploadDocument"], "the draft is created once, not per upload");

  const other = fakeAdapter(USER_B);
  setServerAdapter(other.adapter);
  await useDriverOnboardingStore.getState().uploadRealDocument("vehicle_rc", asset);
  assert.deepStrictEqual(other.calls.map((c) => c.name), ["submitApplication", "uploadDocument"], "another account on the same phone gets its own draft");
}
console.log("✓ The draft drivers row precedes every first KYC upload.\n");

console.log("Test 10: invalid Step 1 (no AIS-125 type chosen) -> nothing is sent, and Step 1 says why...");
realStep1();
useDriverOnboardingStore.setState((st) => ({ formData: { ...st.formData, ais125VehicleType: null } }));
assert.strictEqual(EMPTY_FORM_DATA.ais125VehicleType, null, "a fresh application has no preselected type");
{
  const { adapter, calls } = fakeAdapter(USER_A);
  setServerAdapter(adapter);
  await useDriverOnboardingStore.getState().uploadRealDocument("commercial_dl", asset);
  assert.deepStrictEqual(calls, [], "neither the draft nor the upload is attempted");
  const doc = useDriverOnboardingStore.getState().documents.commercial_dl;
  assert.strictEqual(doc.status, "error");
  assert.strictEqual(doc.errorCode, "step1_incomplete");
  assert.ok(useDriverOnboardingStore.getState().stepErrors[1]?.includes("VALIDATION_MISSING_AIS125"));
  useDriverOnboardingStore.getState().setStep(1);
  assert.strictEqual(useDriverOnboardingStore.getState().validateCurrentStep(), false, "Continue is blocked without a type too");
}
console.log("✓ No upload without a valid Step 1.\n");

console.log("Test 11: a failed upload keeps the server's code and detail on the slot...");
realStep1();
{
  const detail = "new row violates row-level security policy";
  const { adapter } = fakeAdapter(USER_A, { uploadError: { code: "upload_failed", detail } });
  setServerAdapter(adapter);
  await useDriverOnboardingStore.getState().uploadRealDocument("commercial_dl", asset);
  const doc = useDriverOnboardingStore.getState().documents.commercial_dl;
  assert.strictEqual(doc.status, "error");
  assert.strictEqual(doc.errorCode, "upload_failed");
  assert.strictEqual(doc.errorDetail, detail);
  assert.strictEqual(documentUploadErrorMessage(doc.errorCode!, doc.errorDetail), `The document was not uploaded. (${detail})`);

  realStep1();
  const refused = fakeAdapter(USER_A, { draftError: { code: "not_a_driver" } });
  setServerAdapter(refused.adapter);
  await useDriverOnboardingStore.getState().uploadRealDocument("commercial_dl", asset);
  assert.deepStrictEqual(refused.calls.map((c) => c.name), ["submitApplication"], "no upload after a refused draft");
  assert.strictEqual(useDriverOnboardingStore.getState().documents.commercial_dl.errorCode, "not_a_driver");
}
setServerAdapter(null);
console.log("✓ Upload failures are explained, not collapsed to a bare error.\n");

console.log("=================================================");
console.log("ALL DRIVER KYC ONBOARDING STORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
