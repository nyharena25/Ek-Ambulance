import assert from "node:assert";
import {
  OFFER_WINDOW_SECONDS,
  tickOfferCountdown,
  isSwipeAcceptanceComplete,
  isVehicleTierEligible,
} from "./dispatchOffer.core.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Dispatch Offer Core Tests");
console.log("=================================================\n");

console.log("Test 1: 15-second countdown reaches exactly 0 with expiry firing once at the boundary...");
assert.strictEqual(OFFER_WINDOW_SECONDS, 15, "The offer window is exactly 15 seconds");
let seconds = OFFER_WINDOW_SECONDS;
let expiredCount = 0;
for (let tick = 0; tick < OFFER_WINDOW_SECONDS - 1; tick++) {
  const result = tickOfferCountdown(seconds);
  seconds = result.secondsLeft;
  if (result.expired) expiredCount++;
}
assert.strictEqual(seconds, 1, "After 14 ticks from 15, one second remains");
assert.strictEqual(expiredCount, 0, "Expiry has not fired before the window closes");
const finalTick = tickOfferCountdown(seconds);
assert.strictEqual(finalTick.secondsLeft, 0, "The 15th tick reaches exactly 0");
assert.strictEqual(finalTick.expired, true, "The 15th tick fires expiry exactly once");
console.log("✓ The 15-second window expires on its final tick, not before and not after.\n");

console.log("Test 2: Ticking again once already expired does not re-fire or go negative...");
const pastExpiry = tickOfferCountdown(0);
assert.strictEqual(pastExpiry.secondsLeft, 0, "Seconds-left never goes negative");
assert.strictEqual(pastExpiry.expired, false, "Expiry does not re-fire once already at 0 (no double onTimeout)");
console.log("✓ Polling past expiry is idempotent.\n");

console.log("Test 3: Swipe-to-Accept requires at least 75% drag completion...");
assert.strictEqual(isSwipeAcceptanceComplete(80, 100), true, "80% drag completes acceptance");
assert.strictEqual(isSwipeAcceptanceComplete(75, 100), true, "Exactly the 75% threshold completes acceptance");
assert.strictEqual(isSwipeAcceptanceComplete(70, 100), false, "70% drag (below threshold) does not accept");
assert.strictEqual(isSwipeAcceptanceComplete(-10, 100), false, "A negative drag (released backward) never accepts");
assert.strictEqual(isSwipeAcceptanceComplete(80, 0), false, "A zero-width track never accepts (guards div-by-zero)");
console.log("✓ Only a drag of 75% or more of the track completes the accidental-tap-proof swipe.\n");

console.log("Test 4: Vehicle-tier mismatch is rejected; exact matches are eligible...");
assert.strictEqual(isVehicleTierEligible("TYPE_D_ALS", "TYPE_D_ALS"), true, "Matching ALS tiers are eligible");
assert.strictEqual(isVehicleTierEligible("TYPE_D_ALS", "TYPE_C_BLS"), false, "A BLS unit cannot accept an ALS-required offer");
assert.strictEqual(
  isVehicleTierEligible("TYPE_B_PTA", "TYPE_A_MFR"),
  false,
  "A Type A first-responder is not a substitute for a Type B transport ambulance, even though both collapse to CareLevel PTA"
);
console.log("✓ Only an exact AIS-125 tier match is eligible; mismatches are rejected.\n");

console.log("=================================================");
console.log("ALL DRIVER DISPATCH OFFER CORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
