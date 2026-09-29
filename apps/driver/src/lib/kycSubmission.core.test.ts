import assert from "node:assert";
import {
  parseFormDate,
  mapFormDataToApplicationFields,
  buildKycDocumentPath,
  extensionForMimeType,
  hasRequiredKycDocuments,
  REQUIRED_KYC_SLOTS,
} from "./kycSubmission.core.ts";
import type { DriverOnboardingFormData } from "../state/driverOnboarding.store.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance KYC Submission Core Tests");
console.log("=================================================\n");

console.log("Test 1: parseFormDate converts DD/MM/YYYY to ISO, rejects impossible dates...");
assert.strictEqual(parseFormDate("14/08/2028"), "2028-08-14");
assert.strictEqual(parseFormDate("31/02/2028"), null, "Feb 31 does not exist");
assert.strictEqual(parseFormDate("2028-08-14"), null, "wrong format is rejected, not guessed");
assert.strictEqual(parseFormDate(""), null);
console.log("✓ date parsing\n");

const baseForm: DriverOnboardingFormData = {
  commercialDlNumber: "  DL-0420180098712  ",
  dlExpiry: "14/08/2028",
  dlState: "NCT of Delhi (DL)",
  psvBadgeNumber: "PSV-AMB-2023-4109",
  emtLevel: "EMT_P",
  emtNumber: "HSSC/EMT-P/2022/7718",
  emtCouncil: "Healthcare Sector Skill Council (HSSC)",
  emtExpiry: "31/12/2027",
  isAclsCertified: true,
  isBlsCertified: true,
  vehicleRegistrationNumber: "DL 01 AB 7890",
  makeModel: "Force Traveller 3350 Ambulance",
  manufactureYear: "2023",
  vinChassisNumber: "MAT452098P1B76543",
  ais125VehicleType: "TYPE_D_ALS",
};

console.log("Test 2: mapFormDataToApplicationFields trims fields and converts both dates...");
const mapped = mapFormDataToApplicationFields(baseForm);
assert.strictEqual(mapped.ok, true);
if (mapped.ok) {
  assert.strictEqual(mapped.fields.licenseNumber, "DL-0420180098712", "trimmed, not altered otherwise");
  assert.strictEqual(mapped.fields.dlExpiry, "2028-08-14");
  assert.strictEqual(mapped.fields.emtExpiry, "2027-12-31");
  assert.strictEqual(mapped.fields.ais125Type, "TYPE_D_ALS");
  assert.strictEqual(mapped.fields.aclsCertified, true);
}
console.log("✓ field mapping\n");

console.log("Test 3: an unparseable required date fails closed with the field named, not a guessed value...");
const badDl = mapFormDataToApplicationFields({ ...baseForm, dlExpiry: "not-a-date" });
assert.strictEqual(badDl.ok, false);
if (!badDl.ok) assert.strictEqual(badDl.field, "dlExpiry");
console.log("✓ bad required date rejected\n");

console.log("Test 4: an empty optional emtExpiry is absent, not an error; a bad one is...");
const noEmt = mapFormDataToApplicationFields({ ...baseForm, emtExpiry: "" });
assert.strictEqual(noEmt.ok, true);
if (noEmt.ok) assert.strictEqual(noEmt.fields.emtExpiry, "");
const badEmt = mapFormDataToApplicationFields({ ...baseForm, emtExpiry: "32/13/2027" });
assert.strictEqual(badEmt.ok, false);
if (!badEmt.ok) assert.strictEqual(badEmt.field, "emtExpiry");
console.log("✓ optional vs. invalid emtExpiry\n");

console.log("Test 5: buildKycDocumentPath matches driver_documents_path_matches (driver_id/slot/uuid.ext)...");
const path = buildKycDocumentPath("11111111-1111-4111-8111-111111111111", "arai_certificate", "pdf", "22222222-2222-4222-8222-222222222222");
assert.strictEqual(path, "11111111-1111-4111-8111-111111111111/arai_certificate/22222222-2222-4222-8222-222222222222.pdf");
console.log("✓ storage path shape\n");

console.log("Test 6: extensionForMimeType only accepts the bucket's 3 allowed MIME types...");
assert.strictEqual(extensionForMimeType("application/pdf"), "pdf");
assert.strictEqual(extensionForMimeType("image/jpeg"), "jpg");
assert.strictEqual(extensionForMimeType("image/png"), "png");
assert.strictEqual(extensionForMimeType("image/heic"), null, "not in the bucket's allowed_mime_types");
assert.strictEqual(extensionForMimeType(undefined), null);
console.log("✓ mime allow-list\n");

console.log("Test 7: hasRequiredKycDocuments mirrors submit_kyc's 3-of-3 named-slot rule exactly...");
assert.deepStrictEqual([...REQUIRED_KYC_SLOTS].sort(), ["arai_certificate", "fitness_permit", "vehicle_rc"]);
assert.strictEqual(hasRequiredKycDocuments(new Set(["arai_certificate", "fitness_permit", "vehicle_rc"])), true);
assert.strictEqual(hasRequiredKycDocuments(new Set(["arai_certificate", "fitness_permit"])), false, "vehicle_rc missing");
assert.strictEqual(
  hasRequiredKycDocuments(new Set(["arai_certificate", "fitness_permit", "vehicle_rc", "commercial_dl"])),
  true,
  "extra optional slots don't hurt"
);
console.log("✓ required-slot rule\n");

console.log("=================================================");
console.log("ALL KYC SUBMISSION CORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
