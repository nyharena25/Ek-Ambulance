import assert from "node:assert/strict";
import { distanceKm, hospitalsFor } from "./hospitalSelection.core.ts";
import type { CatalogHospital } from "../lib/driverServer.core.ts";

// Synthetic catalog rows (test-only): the real catalog is read from the hospitals table at run time.
const at = (id: string, latitude: number, longitude: number, specialities: string[] = []): CatalogHospital => ({
  id: `00000000-0000-4000-8000-00000000000${id}`, name: `Hospital ${id}`, coordinates: { latitude, longitude }, specialities,
});
const NOIDA_62 = { latitude: 28.6186, longitude: 77.3725 };
const catalog = [at("1", 28.5672, 77.21, ["Cardiac"]), at("2", 28.6189, 77.3732), at("3", 28.4732, 77.482, ["Burns"])];

assert.ok(Math.abs(distanceKm(NOIDA_62, NOIDA_62)) < 1e-9, "same point is 0 km");
const cardiac = hospitalsFor("cardiac", NOIDA_62, catalog);
assert.deepEqual(cardiac.map((r) => r.hospital.id.slice(-1)), ["2", "1"], "cardiac match + hospital with no specialities on record, nearest first");
assert.equal(hospitalsFor("general", NOIDA_62, catalog).length, 3, "general lists every registered hospital");
assert.equal(hospitalsFor("stroke", NOIDA_62, []).length, 0, "no catalog, no hospitals: nothing is invented");
assert.ok(cardiac.every((r, i) => i === 0 || cardiac[i - 1]!.km <= r.km), "sorted nearest first");
assert.ok(cardiac.every((r) => /^[0-9a-f-]{36}$/.test(r.hospital.id)), "every selectable hospital carries its canonical id");
console.log("HOSPITAL SELECTION TESTS PASSED (100% GREEN)");
