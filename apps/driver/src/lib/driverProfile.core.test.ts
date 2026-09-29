import assert from "node:assert";
import {
  diffProfile,
  draftFrom,
  isEmptyPatch,
  normalizePlate,
  parseDriverProfile,
  validateNewPassword,
  validateProfileDraft,
  type DriverProfile,
} from "./driverProfile.core.ts";

const server = {
  ok: true,
  fullName: "Asha Verma",
  phone: "+919876509011",
  serviceZone: "DL",
  hospitalId: "6f0c1e9a-0000-4000-8000-000000000009",
  hospitalName: "AIIMS New Delhi",
  ais125Type: "TYPE_D_ALS",
  kycStatus: "approved",
  regulatedEditable: false,
  vehicle: { registrationNumber: "DL01AB1111", makeModel: "Force Traveller", manufactureYear: 2023, color: "White", crewCount: 3 },
};

console.log("Test 1: the server profile parses, and a missing vehicle is empty rather than invented...");
const saved = parseDriverProfile(server)!;
assert.strictEqual(saved.fullName, "Asha Verma");
assert.strictEqual(saved.vehicle.crewCount, 3);
assert.strictEqual(saved.regulatedEditable, false);
const bare = parseDriverProfile({ ok: true, vehicle: null, serviceZone: "XX", ais125Type: "TYPE_Z" })!;
assert.strictEqual(bare.vehicle.registrationNumber, "");
assert.strictEqual(bare.vehicle.crewCount, null);
assert.strictEqual(bare.serviceZone, null, "an unknown zone is absent");
assert.strictEqual(bare.ais125Type, null);
assert.strictEqual(parseDriverProfile(null), null);
assert.strictEqual(parseDriverProfile([]), null);

console.log("Test 2: an untouched draft produces an empty patch...");
assert.ok(isEmptyPatch(diffProfile(saved, draftFrom(saved))));

console.log("Test 3: only changed fields are sent, trimmed...");
{
  const d = draftFrom(saved);
  d.fullName = "  Asha Verma-Singh ";
  d.vehicle.crewCount = 4;
  d.vehicle.color = "Silver";
  assert.deepStrictEqual(diffProfile(saved, d), { fullName: "Asha Verma-Singh", vehicle: { color: "Silver", crewCount: 4 } });
  const h = draftFrom(saved);
  h.hospitalId = null;
  assert.deepStrictEqual(diffProfile(saved, h), { hospitalId: null }, "clearing the hospital is a change");
  const z = draftFrom(saved);
  z.serviceZone = "UP";
  assert.deepStrictEqual(diffProfile(saved, z), { serviceZone: "UP" });
}

console.log("Test 4: plate and make are never sent once KYC has locked them, and an equivalent plate is no change...");
{
  const d = draftFrom(saved);
  d.vehicle.registrationNumber = "DL 01 AB 9999";
  d.vehicle.makeModel = "Tata Winger";
  assert.ok(isEmptyPatch(diffProfile(saved, d)), "locked by KYC: not sent");
  const open: DriverProfile = { ...saved, regulatedEditable: true, vehicle: { ...saved.vehicle, registrationNumber: "DL 01 AB 1111" } };
  const same = draftFrom(open);
  same.vehicle.registrationNumber = "  dl 01  ab 1111 ";
  assert.ok(isEmptyPatch(diffProfile(open, same)), "case and spacing are the same plate");
  same.vehicle.registrationNumber = "dl 01 ab 2222";
  assert.deepStrictEqual(diffProfile(open, same), { vehicle: { registrationNumber: "DL 01 AB 2222" } });
}

console.log("Test 5: a first vehicle carries its plate even if only the crew size changed...");
{
  const fresh = parseDriverProfile({ ok: true, fullName: "New Driver", regulatedEditable: true })!;
  const d = draftFrom(fresh);
  d.vehicle.registrationNumber = "dl01ab5555";
  d.vehicle.crewCount = 2;
  assert.deepStrictEqual(diffProfile(fresh, d), { vehicle: { registrationNumber: "DL01AB5555", crewCount: 2 } });
  assert.strictEqual(normalizePlate(" dl  01 ab 1 "), "DL 01 AB 1");
}

console.log("Test 6: validation mirrors update_driver_profile...");
{
  const ok = draftFrom(saved);
  assert.deepStrictEqual(validateProfileDraft(ok), []);
  assert.deepStrictEqual(validateProfileDraft({ ...ok, fullName: "x" }), ["name"]);
  assert.deepStrictEqual(validateProfileDraft({ ...ok, fullName: "x".repeat(81) }), ["name"]);
  assert.deepStrictEqual(validateProfileDraft({ ...ok, vehicle: { ...ok.vehicle, crewCount: 0 } }), ["crew"]);
  assert.deepStrictEqual(validateProfileDraft({ ...ok, vehicle: { ...ok.vehicle, crewCount: 13 } }), ["crew"]);
  assert.deepStrictEqual(validateProfileDraft({ ...ok, vehicle: { ...ok.vehicle, registrationNumber: "!!" } }), ["plate"]);
  assert.deepStrictEqual(validateProfileDraft({ ...ok, vehicle: { ...ok.vehicle, color: "c".repeat(31) } }), ["color"]);
  const noVehicle = { fullName: "Asha Verma", serviceZone: null, hospitalId: null, vehicle: { registrationNumber: "", makeModel: "", color: "", crewCount: null } };
  assert.deepStrictEqual(validateProfileDraft(noVehicle), [], "no vehicle at all is fine");
  assert.deepStrictEqual(validateProfileDraft({ ...noVehicle, vehicle: { ...noVehicle.vehicle, crewCount: 2 } }), ["plate"], "a crew size needs a plate to belong to");
}

console.log("Test 7: password rules...");
assert.strictEqual(validateNewPassword("short1", "short1"), "too_short");
assert.strictEqual(validateNewPassword("onlyletters", "onlyletters"), "needs_letter_and_digit");
assert.strictEqual(validateNewPassword("12345678", "12345678"), "needs_letter_and_digit");
assert.strictEqual(validateNewPassword("goodpass1", "goodpass2"), "mismatch");
assert.strictEqual(validateNewPassword("goodpass1", "goodpass1"), null);

console.log("\nDriver profile core tests passed.");

console.log("Test: the staff rejection reason reaches the driver (G3)...");
assert.strictEqual(parseDriverProfile({ kycStatus: "rejected", kycRejectReason: "RC photo is illegible" })!.kycRejectReason, "RC photo is illegible");
assert.strictEqual(parseDriverProfile({ kycStatus: "approved" })!.kycRejectReason, null, "absent reason is null, never invented");
console.log("✓ rejection reason parsed\n");
