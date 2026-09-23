import assert from "node:assert";
import { isHospitalSelectable } from "./hospitalHandoff.core.ts";
import { RANKED_TRAUMA_CENTRES } from "../i18n/driverOnSceneStrings.ts";
import type { TraumaCentreItem } from "../i18n/driverOnSceneStrings.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Hospital Handoff Core Tests");
console.log("=================================================\n");

function centre(overrides: Partial<TraumaCentreItem>): TraumaCentreItem {
  return {
    id: "hosp_test",
    name: "Test Hospital",
    hindiName: "टेस्ट अस्पताल",
    category: "PRIVATE",
    traumaLevel: "Level 1",
    hindiTraumaLevel: "लेवल 1",
    distanceKm: 5,
    etaMinutes: 10,
    coordinates: { latitude: 0, longitude: 0 },
    totalIcuBeds: 10,
    availableIcuBeds: 5,
    availableTraumaBays: 2,
    ventilatorsReady: 2,
    bedsHeldCounter: 0,
    inboundAmbulances: 0,
    specialities: [],
    hindiSpecialities: [],
    ...overrides,
  };
}

console.log("Test 1: A hospital with real spare ICU capacity is selectable...");
assert.strictEqual(
  isHospitalSelectable(centre({ availableIcuBeds: 5, bedsHeldCounter: 1, inboundAmbulances: 1 })),
  true,
  "5 available - 1 held - 1 inbound = 3 net free beds: selectable"
);
console.log("✓ Real spare capacity is selectable.\n");

console.log("Test 2: A hospital fully committed by held beds + inbound units is rejected...");
assert.strictEqual(
  isHospitalSelectable(centre({ availableIcuBeds: 2, bedsHeldCounter: 1, inboundAmbulances: 1 })),
  false,
  "2 available - 1 held - 1 inbound = 0 net free beds: not selectable"
);
assert.strictEqual(
  isHospitalSelectable(centre({ availableIcuBeds: 1, bedsHeldCounter: 1, inboundAmbulances: 2 })),
  false,
  "Negative net capacity (Sharda's seeded case) is rejected"
);
console.log("✓ A facility with no real net free capacity is rejected, even if availableIcuBeds > 0.\n");

console.log("Test 3: Every existing Delhi-area seeded centre has real spare capacity (unaffected by the gate)...");
for (const hospital of RANKED_TRAUMA_CENTRES) {
  if (hospital.id === "hosp_sharda_gnoida") continue; // deliberately saturated, tested separately
  assert.strictEqual(
    isHospitalSelectable(hospital),
    true,
    `${hospital.name} should remain selectable - it was not seeded as overcrowded`
  );
}
console.log("✓ The pre-existing Delhi-area centres are unaffected by the new gate.\n");

console.log("Test 4: Sharda Hospital (Greater Noida) is deliberately overcrowded and rejected by the seeded fixture...");
const sharda = RANKED_TRAUMA_CENTRES.find((h) => h.id === "hosp_sharda_gnoida");
assert.ok(sharda, "Sharda Hospital (Greater Noida) is present in the seeded fixture, per the directive's named example");
assert.strictEqual(
  isHospitalSelectable(sharda!),
  false,
  "Sharda's seeded capacity numbers (1 available - 1 held - 2 inbound) must trip the gate live in the app"
);
console.log("✓ The capacity gate is exercised by real seeded demo data, not just a synthetic test fixture.\n");

console.log("=================================================");
console.log("ALL DRIVER HOSPITAL HANDOFF CORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
