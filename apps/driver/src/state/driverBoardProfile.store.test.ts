import assert from "node:assert";
import type { ApiResult, BoardSnapshot } from "@sahayak/domain";
import { getServerAdapter, setServerAdapter, useDriverLifecycleStore, type ServerAdapter } from "./driverLifecycle.store.ts";
import { useDriverStandbyStore } from "./driverStandby.store.ts";
import { itemsInBand, startBoardPolling, useDriverBoardStore } from "./driverBoard.store.ts";
import { useDriverProfileStore } from "./driverProfile.store.ts";

const lifecycle = () => useDriverLifecycleStore.getState();
const standby = () => useDriverStandbyStore.getState();
const M = "6f0c1e9a-0000-4000-8000-000000000001";

// The dev build seeds the driver online on standby; make that explicit so the test does not lean on it.
standby().setJurisdiction("UP_NOIDA");
assert.strictEqual(lifecycle().currentState, "standby");
useDriverStandbyStore.setState({ isOnline: true });

console.log("Test 1: the dev board is oldest first and holds both sections; an offline driver sees none...");
await useDriverBoardStore.getState().refresh();
{
  const { items } = useDriverBoardStore.getState();
  assert.ok(items.length >= 4, "the mock feed has emergencies in range");
  assert.ok(itemsInBand(items, "green").length > 0 && itemsInBand(items, "red").length > 0, "both sections are populated");
  const created = items.map((i) => Date.parse(i.createdAt));
  assert.deepStrictEqual(created, [...created].sort((a, b) => a - b), "oldest on top");
  assert.ok(items.every((i) => i.band !== "red" || Date.now() - Date.parse(i.createdAt) >= 45_000), "red only after one designed time");
}
useDriverStandbyStore.setState({ isOnline: false });
await useDriverBoardStore.getState().refresh();
assert.strictEqual(useDriverBoardStore.getState().items.length, 0, "offline: not in the pool, nothing to show");
useDriverStandbyStore.setState({ isOnline: true });

console.log("Test 2: a claimed emergency leaves the board...");
await useDriverBoardStore.getState().refresh();
{
  const first = useDriverBoardStore.getState().items[0]!.missionId;
  useDriverBoardStore.getState().markTaken(first);
  assert.ok(!useDriverBoardStore.getState().items.some((i) => i.missionId === first));
  await useDriverBoardStore.getState().refresh();
  assert.ok(!useDriverBoardStore.getState().items.some((i) => i.missionId === first), "and stays gone on the next refresh");
}

console.log("Test 3: with a server, the board is the server's answer; a failed read keeps what is on screen...");
{
  let next: ApiResult<BoardSnapshot> = {
    ok: true,
    data: {
      serverNow: new Date(Date.now() + 5_000).toISOString(),
      items: [
        { missionId: "b", createdAt: "2026-09-24T08:30:00.000Z", dueAt: "2026-09-24T08:30:45.000Z", distanceKm: 6, band: "red", pickup: { latitude: 28.5, longitude: 77.3 } },
        { missionId: "a", createdAt: "2026-09-24T08:29:00.000Z", dueAt: "2026-09-24T08:29:45.000Z", distanceKm: 2, band: "green", pickup: { latitude: 28.5, longitude: 77.3 } },
      ],
    },
  };
  const fake = { userId: M, accessToken: "t", fetchBoard: async () => next } as unknown as ServerAdapter;
  setServerAdapter(fake);
  await useDriverBoardStore.getState().refresh();
  const s = useDriverBoardStore.getState();
  assert.deepStrictEqual(s.items.map((i) => i.missionId), ["a", "b"], "sorted oldest first, whatever order the server sent");
  assert.ok(Math.abs(s.clockOffsetMs - 5_000) < 1_000, "clock offset is server minus local");
  next = { ok: false, error: { code: "network", status: 0, retryable: true } };
  await useDriverBoardStore.getState().refresh();
  assert.strictEqual(useDriverBoardStore.getState().items.length, 2, "a network blip does not empty the list");
  assert.strictEqual(useDriverBoardStore.getState().status, "error");
  setServerAdapter(null);
}

console.log("Test 4: polling is ref-counted: one interval however many screens ask...");
{
  const stopA = startBoardPolling(60_000);
  const stopB = startBoardPolling(60_000);
  stopA();
  stopA(); // a second call is a no-op, never a double decrement
  stopB();
  const stopC = startBoardPolling(60_000);
  stopC();
}

console.log("Test 5: the profile freezes from the offer to the end of the mission...");
await useDriverProfileStore.getState().load();
{
  const profile = useDriverProfileStore.getState().profile;
  assert.ok(profile, "the dev profile is seeded");
  const gpsBefore = standby().gps;

  const ok = await useDriverProfileStore.getState().save({ fullName: "Asha Verma", serviceZone: "DL", vehicle: { crewCount: 4, color: "Silver" } });
  assert.deepStrictEqual(ok, { ok: true });
  assert.strictEqual(useDriverProfileStore.getState().profile?.fullName, "Asha Verma");
  assert.strictEqual(useDriverProfileStore.getState().profile?.vehicle.crewCount, 4);
  assert.strictEqual(standby().currentJurisdiction, "DL_SOUTH", "the service area reaches the standby label");
  assert.deepStrictEqual(standby().gps, gpsBefore, "changing the profile never moves the position");

  // An offer is held: locked, before any mission exists.
  lifecycle().send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "o1", missionId: M } });
  assert.strictEqual(lifecycle().currentState, "offered");
  assert.deepStrictEqual(await useDriverProfileStore.getState().save({ fullName: "Someone Else" }), { ok: false, code: "profile_locked" }, "locked while an offer is held");
  standby().setJurisdiction("UP_NOIDA");
  assert.strictEqual(standby().currentJurisdiction, "DL_SOUTH", "the standby service-area chips are locked too");

  // On a mission.
  lifecycle().send({ type: "ACCEPT_DISPATCH", payload: { missionId: M, driverId: "d", offerId: "o1", acceptedAt: new Date().toISOString() } });
  assert.strictEqual(lifecycle().currentState, "enRouteToPatient");
  assert.deepStrictEqual(await useDriverProfileStore.getState().save({ vehicle: { crewCount: 9 } }), { ok: false, code: "profile_locked" }, "locked on a mission");
  assert.strictEqual(useDriverProfileStore.getState().profile?.vehicle.crewCount, 4, "nothing changed");
  standby().setAis125Type("TYPE_B_PTA");
  assert.strictEqual(standby().registeredAis125Type, "TYPE_D_ALS", "the registered tier cannot be switched mid-mission");

  // The mission ends: free again.
  lifecycle().send({ type: "ABORT_MISSION", payload: { missionId: M, driverId: "d", abortedAt: new Date().toISOString() } });
  assert.strictEqual(lifecycle().currentState, "standby");
  assert.deepStrictEqual(await useDriverProfileStore.getState().save({ vehicle: { crewCount: 5 } }), { ok: true }, "editable again");
  assert.strictEqual(useDriverProfileStore.getState().profile?.vehicle.crewCount, 5);
}

console.log("Test 6: with a server the save goes through it, and the server's refusal is surfaced, not swallowed...");
{
  const saved = { ...useDriverProfileStore.getState().profile!, fullName: "From Server" };
  let reply: ApiResult<typeof saved> = { ok: true, data: saved };
  setServerAdapter({ userId: M, accessToken: "t", saveProfile: async () => reply } as unknown as ServerAdapter);
  assert.deepStrictEqual(await useDriverProfileStore.getState().save({ fullName: "From Server" }), { ok: true });
  assert.strictEqual(useDriverProfileStore.getState().profile?.fullName, "From Server");
  reply = { ok: false, error: { code: "kyc_locked", status: 409, retryable: false } };
  assert.deepStrictEqual(await useDriverProfileStore.getState().save({ fullName: "X Y" }), { ok: false, code: "kyc_locked" });
  assert.strictEqual(useDriverProfileStore.getState().profile?.fullName, "From Server", "a refused save leaves the profile as the server holds it");
  setServerAdapter(null);
  assert.strictEqual(getServerAdapter(), null);
}

console.log("\nDriver board and profile store tests passed.");
process.exit(0);
