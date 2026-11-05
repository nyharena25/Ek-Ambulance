import assert from "node:assert";
import { bookingStepCount, isVehicleEligible, soleEligibleVehicle } from "./vehicleEligibility.core.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Vehicle Eligibility Core Tests");
console.log("=================================================\n");

console.log("Test 1: ALS allows only Type D...");
assert.strictEqual(isVehicleEligible("ALS", "TYPE_D_ALS"), true);
assert.strictEqual(isVehicleEligible("ALS", "TYPE_C_BLS"), false);
assert.strictEqual(isVehicleEligible("ALS", "TYPE_B_PTA"), false);
assert.strictEqual(isVehicleEligible("ALS", "TYPE_A_MFR"), false);

console.log("Test 2: BLS allows Type C and the upgraded Type D...");
assert.strictEqual(isVehicleEligible("BLS", "TYPE_C_BLS"), true);
assert.strictEqual(isVehicleEligible("BLS", "TYPE_D_ALS"), true);
assert.strictEqual(isVehicleEligible("BLS", "TYPE_B_PTA"), false);

console.log("Test 3: PTA allows every stretcher vehicle, never Type A...");
assert.strictEqual(isVehicleEligible("PTA", "TYPE_B_PTA"), true);
assert.strictEqual(isVehicleEligible("PTA", "TYPE_A_MFR"), false);

console.log("Test 4: only ALS has a single eligible vehicle, so only ALS skips the vehicle step...");
assert.strictEqual(soleEligibleVehicle("ALS"), "TYPE_D_ALS");
assert.strictEqual(soleEligibleVehicle("BLS"), null);
assert.strictEqual(soleEligibleVehicle("PTA"), null);

console.log("Test 5: the review screen's step count follows the skip...");
assert.strictEqual(bookingStepCount("ALS"), 3);
assert.strictEqual(bookingStepCount("BLS"), 4);
assert.strictEqual(bookingStepCount("PTA"), 4);

console.log("\nALL VEHICLE ELIGIBILITY CORE TESTS PASSED (100% GREEN)");
