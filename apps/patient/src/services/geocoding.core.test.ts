import assert from "node:assert";
import { fromGoogle, fromNominatim, fromPlace } from "./geocoding.core.ts";

console.log("Test 1: provider payloads -> two-line address...");
assert.deepStrictEqual(
  fromGoogle({ status: "OK", results: [{ address_components: [
    { long_name: "Sector 62", types: ["sublocality_level_1"] },
    { long_name: "Gautam Buddha Nagar", types: ["administrative_area_level_2"] },
    { long_name: "Uttar Pradesh", types: ["administrative_area_level_1"] },
  ] }] }),
  { primary: "Sector 62", secondary: "Gautam Buddha Nagar, Uttar Pradesh" }
);
assert.strictEqual(fromGoogle({ status: "ZERO_RESULTS" }), null);
assert.deepStrictEqual(fromNominatim({ address: { road: "Ring Rd", county: "South Delhi", state: "Delhi" } }), { primary: "Ring Rd", secondary: "South Delhi, Delhi" });
assert.deepStrictEqual(fromPlace({ street: "Aurobindo Marg", subregion: "New Delhi", region: "Delhi" }), { primary: "Aurobindo Marg", secondary: "New Delhi, Delhi" });
assert.strictEqual(fromPlace({}), null);
assert.strictEqual(fromNominatim({}), null);
console.log("✓ geocoding\n\nGEOCODING CORE TESTS PASSED (100% GREEN)");
