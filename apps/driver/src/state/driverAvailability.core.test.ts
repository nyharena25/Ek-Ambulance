import assert from "node:assert";
import type { DriverLifecycleState } from "@sahayak/domain";
import { canAcceptFromBoard, holdsOfferOrMission, isProfileLocked } from "./driverAvailability.core.ts";

const STATES: DriverLifecycleState[] = ["offline", "standby", "offered", "enRouteToPatient", "onScene", "transporting", "arrivedHospital"];

console.log("Test 1: only standby may accept from the board...");
for (const s of STATES) assert.strictEqual(canAcceptFromBoard(s), s === "standby", `${s}`);

console.log("Test 2: the profile is locked from the offer to the end of the mission, and free otherwise...");
for (const s of STATES) assert.strictEqual(isProfileLocked(s), !["offline", "standby"].includes(s), `${s}`);
assert.strictEqual(holdsOfferOrMission("offered"), true, "a held offer already locks the profile");

console.log("Test 3: a locked profile always coincides with a blocked board...");
for (const s of STATES) assert.ok(!(canAcceptFromBoard(s) && isProfileLocked(s)), `${s}`);

console.log("\nDriver availability tests passed.");
