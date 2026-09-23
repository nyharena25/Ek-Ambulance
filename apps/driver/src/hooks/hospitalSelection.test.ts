import assert from "node:assert/strict";
import { distanceKm, hospitalsFor } from "./hospitalSelection.core.ts";

const NOIDA_62 = { latitude: 28.6186, longitude: 77.3725 };
assert.ok(Math.abs(distanceKm(NOIDA_62, NOIDA_62)) < 1e-9, "same point is 0 km");

const cardiac = hospitalsFor("cardiac", NOIDA_62);
assert.ok(cardiac.length > 0 && cardiac.every((r) => r.hospital.specialities.some((s) => /cardiac/i.test(s))), "only cardiac-capable centres");
assert.ok(cardiac.every((r, i) => i === 0 || cardiac[i - 1]!.km <= r.km), "sorted nearest first");
assert.equal(hospitalsFor("general", NOIDA_62).length, 6, "general lists every centre");
assert.ok(hospitalsFor("burns", NOIDA_62).every((r) => r.hospital.specialities.some((s) => /burn/i.test(s))));
console.log("HOSPITAL SELECTION TESTS PASSED (100% GREEN)");
