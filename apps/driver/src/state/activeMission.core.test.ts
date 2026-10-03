import assert from "node:assert/strict";
import { createActor } from "xstate";
import { driverLifecycleMachine, type DriverLifecycleState } from "@sahayak/domain";
import { readAssignedMissions } from "../lib/driverServer.core.ts";
import { mountMissionWatch } from "../services/driverRealtime.ts";
import {
  canOpenMission,
  currentMissionCard,
  holdsCurrentMission,
  missionRoute,
  reconcileRead,
  viewAfterMissionEndAcknowledged,
  type ActiveMissionView,
  type MachineSnapshot,
  type MissionReadResult,
} from "./activeMission.core.ts";

console.log("=================================================");
console.log("Running Current Mission recovery tests (server-authoritative)");
console.log("=================================================\n");

const D = "00000000-0000-4000-8000-0000000000d1";
const M = "00000000-0000-4000-8000-00000000a001";
const M2 = "00000000-0000-4000-8000-00000000a002";
const HOSP = "be32d962-003d-447b-9147-3e15ee30496c";
const point = (lng: number, lat: number) => ({ type: "Point", coordinates: [lng, lat] });

/** The rows exactly as the missions select returns them (ASSIGNED_MISSION_COLUMNS). */
const rowFor = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, status, display_ref: "MSN-UP-2026-000321", pickup_address: "Sector 62, Noida", pickup_location: point(77.3725, 28.6186),
  destination_hospital_id: null, destination: null, ...extra,
});
const ok = (rows: unknown[]): MissionReadResult => readAssignedMissions(rows) as MissionReadResult;
const GO_ONLINE = { type: "GO_ONLINE", payload: { driverId: D, ambulanceId: "AMB-1", careLevel: "BLS", ais125CertPath: "kyc/ais125.pdf" } } as never;
/** The machine's state and mission only (the call counters are checked where they matter). */
const at = (m: MachineSnapshot) => ({ currentState: m.currentState, activeMissionId: m.activeMissionId });
const offline: MissionReadResult = { ok: false, error: { code: "network", status: 0, retryable: true } };

/** A device: the real lifecycle machine plus the cached server view, driven exactly like activeMission.store's refresh. */
function device() {
  const actor = createActor(driverLifecycleMachine);
  actor.start();
  let view: ActiveMissionView = { kind: "checking" };
  const sent: string[] = [];
  const calls = { pending: 0, epoch: 0 };
  const machine = (): MachineSnapshot => ({
    currentState: actor.getSnapshot().value as DriverLifecycleState,
    activeMissionId: actor.getSnapshot().context.activeMissionId,
    pendingCalls: calls.pending,
    callEpoch: calls.epoch,
  });
  const send = (event: Parameters<typeof actor.send>[0]) => {
    sent.push(event.type);
    actor.send(event);
  };
  /** One server read; `during` simulates a local transition that lands while the read is in flight. */
  const read = (result: MissionReadResult, during?: () => void) => {
    const before = machine();
    during?.();
    const outcome = reconcileRead(view, result, before, machine());
    if (outcome.discard) return "discarded";
    view = outcome.view;
    if (outcome.sync.type === "hydrate") send({ type: "HYDRATE", payload: { missionId: outcome.sync.missionId, status: outcome.sync.status, driverId: D } });
    if (outcome.sync.type === "end") send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId: outcome.sync.missionId } });
    return outcome.sync.type;
  };
  return {
    actor, sent, machine, read, send, calls,
    view: () => view,
    card: () => currentMissionCard(view, machine()),
    acknowledgeEnd: (id: string) => (view = viewAfterMissionEndAcknowledged(view, id)),
  };
}

console.log("Test 0: the server read: own missions only, one at most, a bad row is an error (never 'none')...");
{
  assert.deepStrictEqual(readAssignedMissions([]), { ok: true, data: null });
  const one = readAssignedMissions([rowFor(M, "transporting", { destination_hospital_id: HOSP, destination: { name: "Sharda Hospital Greater Noida" } })]);
  assert.ok(one.ok && one.data);
  assert.deepStrictEqual(one.data, {
    missionId: M, status: "transporting", pickup: { longitude: 77.3725, latitude: 28.6186 }, destinationHospitalId: HOSP,
    displayRef: "MSN-UP-2026-000321", pickupAddress: "Sector 62, Noida", destinationName: "Sharda Hospital Greater Noida",
  });
  assert.strictEqual(readAssignedMissions([{ id: M, status: "flying" }]).ok, false, "an unreadable row is not 'no mission'");
  assert.strictEqual(readAssignedMissions(null).ok, false);
  const two = readAssignedMissions([rowFor(M, "en_route"), rowFor(M2, "on_scene")]);
  assert.deepStrictEqual(two, { ok: false, error: { code: "multiple_active_missions", status: 0, detail: `${M},${M2}`, retryable: false } }, "never limit(1) away a second mission");
}
console.log("✓ server read\n");

console.log("Test A: no active mission -> no Current Mission section, availability stays offered...");
{
  const d = device();
  d.send(GO_ONLINE);
  assert.strictEqual(d.card(), null, "nothing before the first server answer");
  assert.strictEqual(d.read(ok([])), "none");
  assert.strictEqual(d.card(), null, "absent with no mission");
  assert.ok(!holdsCurrentMission(d.view(), d.machine()), "the booking board is offered");
  assert.strictEqual(d.machine().currentState, "standby");
  assert.deepStrictEqual(d.sent, ["GO_ONLINE"], "no lifecycle event invented");
}
console.log("✓ A\n");

console.log("Test B/C/D: app restart -> the server's mission is recovered, shown, and Return opens exactly that id...");
{
  // 1-3: accepted on a first process, then the process dies (the machine is memory-only).
  const first = device();
  first.read(ok([rowFor(M, "en_route")]));
  assert.strictEqual(first.machine().activeMissionId, M);
  first.actor.stop();
  // 4-7: a brand-new process (fresh actor, nothing in memory) restores the session and reads the server.
  const d = device();
  assert.strictEqual(d.machine().currentState, "offline");
  assert.strictEqual(d.read(ok([rowFor(M, "on_scene")])), "hydrate", "D: recovered from the server, no realtime event needed");
  assert.deepStrictEqual(at(d.machine()), { currentState: "onScene", activeMissionId: M }, "D: the server's current stage, not the start");
  // 8: the section appears.
  const card = d.card();
  assert.ok(card && card.kind === "mission", "B: Current Mission appears");
  assert.strictEqual(card.mission.missionId, M);
  assert.ok(holdsCurrentMission(d.view(), d.machine()), "B: no availability UI while on a mission");
  // 9-10: Return to Mission -> the existing route, for that id, which accepts it.
  const route = missionRoute(card.mission);
  assert.deepStrictEqual(route, { pathname: "/mission/[id]", params: { id: M, pickupLat: "28.6186", pickupLng: "77.3725" } }, "C: exact mission id");
  assert.ok(canOpenMission(route.params.id, d.machine()), "C: the mission screen opens for it");
  // Not a second mission: an offer pushed now is not accepted by the machine.
  d.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: M2, missionId: M2 } } as never);
  assert.deepStrictEqual(at(d.machine()), { currentState: "onScene", activeMissionId: M }, "a driver on a mission is never offered another");
}
console.log("✓ B C D\n");

console.log("Test E: background -> foreground re-reads; the same answer changes nothing (no duplicate events)...");
{
  const d = device();
  d.read(ok([rowFor(M, "en_route")]));
  const events = d.sent.length;
  assert.strictEqual(d.read(ok([rowFor(M, "en_route")])), "none", "foreground read, same server state");
  assert.strictEqual(d.sent.length, events, "no duplicate HYDRATE");
  assert.strictEqual(d.read(ok([rowFor(M, "transporting")])), "hydrate", "the server moved on while backgrounded: follow it");
  assert.strictEqual(d.machine().currentState, "transporting");
  assert.strictEqual(d.read(ok([rowFor(M, "on_scene")])), "none", "an older answer never moves the machine backwards");
  assert.strictEqual(d.machine().currentState, "transporting");
  assert.ok(canOpenMission(M, d.machine()), "E: still accessible after the foreground");
}
console.log("✓ E\n");

console.log("Test F: realtime down / reads failing -> the mission stays, marked as refreshing...");
{
  const d = device();
  d.read(ok([rowFor(M, "transporting")]));
  for (let i = 0; i < 3; i++) assert.strictEqual(d.read(offline), "none");
  const card = d.card();
  assert.ok(card && card.kind === "mission" && card.stale, "F: last known mission kept, flagged stale");
  assert.deepStrictEqual(at(d.machine()), { currentState: "transporting", activeMissionId: M }, "F: never ended by an outage");
  assert.ok(canOpenMission(M, d.machine()), "F: still reachable");
  // A cold start while offline knows nothing yet: unknown, never 'none'.
  const cold = device();
  cold.read(offline);
  assert.deepStrictEqual(cold.card(), { kind: "unknown", errorCode: "network" }, "an unreachable server is not 'no mission'");
  // A failure after a confirmed 'none' keeps 'none'.
  const idle = device();
  idle.read(ok([]));
  idle.read(offline);
  assert.strictEqual(idle.card(), null);
}
console.log("✓ F\n");

console.log("Test G: realtime reconnect -> resubscribe re-reads once per subscribe, redelivered events are dropped...");
{
  const d = device();
  d.read(ok([rowFor(M, "en_route")]));
  const channels: string[] = [];
  let deliver: ((data: unknown) => void) | null = null;
  let resubscribed: (() => void) | null = null;
  const session = {
    subscribe: (channel: string, onData: (data: unknown) => void, onSubscribed: () => void) => {
      channels.push(channel);
      deliver = onData;
      resubscribed = onSubscribed;
      return () => {};
    },
  };
  const cancellations: number[] = [];
  let reads = 0;
  const unmount = mountMissionWatch(M, session as never, {
    onCancelled: (info) => cancellations.push(info.seq ?? -1),
    onSubscribed: () => {
      reads += 1;
      d.read(ok([rowFor(M, "on_scene")])); // the re-read the app performs (activeMission.store refresh)
    },
  });
  resubscribed!(); // first subscribe
  resubscribed!(); // the SDK resubscribed after a reconnect (same subscription object)
  assert.deepStrictEqual(channels, [`mission:${M}`], "G: one subscription, not one per reconnect");
  assert.strictEqual(reads, 2, "each (re)subscribe re-reads the server");
  assert.strictEqual(d.sent.filter((e) => e === "HYDRATE").length, 2, "G: one HYDRATE for recovery, one for the missed stage - none for the repeat");
  assert.deepStrictEqual(at(d.machine()), { currentState: "onScene", activeMissionId: M });
  const cancel = { v: 1, type: "lifecycle", event: "MISSION_CANCELLED", seq: 7, missionId: M, data: { cancelledBy: "patient" } };
  deliver!(cancel);
  deliver!(cancel); // replayed after the reconnect
  assert.deepStrictEqual(cancellations, [7], "G: a redelivered event is applied once");
  unmount();
}
console.log("✓ G\n");

console.log("Test H: mission completed -> the section disappears only on server confirmation...");
{
  // A local reset (machine remount) is not a server confirmation: the next read brings it back.
  const fresh = device();
  assert.strictEqual(fresh.card(), null, "a fresh process shows nothing until it hears from the server...");
  fresh.read(ok([rowFor(M, "arrived_hospital")]));
  assert.ok(fresh.card(), "...and the server still says active, so it is shown");
  // COMPLETE_MISSION returned 200: that is the server's confirmation.
  fresh.send({ type: "COMPLETE_MISSION", payload: { missionId: M, driverId: D, completedAt: "2026-10-03T10:00:00.000Z", handoff: {} } } as never);
  fresh.acknowledgeEnd(M);
  assert.strictEqual(fresh.card(), null, "H: gone after the server accepted the completion");
  assert.strictEqual(fresh.read(offline), "none");
  assert.strictEqual(fresh.card(), null, "H: a failed follow-up read does not revive it");
  // Completed elsewhere (e.g. by dispatch) while this device still holds it: the server read ends it.
  const other = device();
  other.read(ok([rowFor(M, "transporting")]));
  assert.strictEqual(other.read(ok([])), "end", "H: the server no longer lists it");
  assert.strictEqual(other.card(), null);
  assert.strictEqual(other.machine().currentState, "standby");
}
console.log("✓ H\n");

console.log("Test I: mission cancelled -> the section disappears after the server says so, not on a socket drop...");
{
  const d = device();
  d.read(ok([rowFor(M, "en_route")]));
  d.read(offline); // socket and API down
  assert.ok(d.card(), "I: not removed by an outage");
  assert.strictEqual(d.read(ok([])), "end", "I: server confirms it is no longer active");
  assert.strictEqual(d.card(), null);
  assert.deepStrictEqual(at(d.machine()), { currentState: "standby", activeMissionId: null });
  // The live cancellation event is also a server confirmation.
  const live = device();
  live.read(ok([rowFor(M, "en_route")]));
  live.send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId: M, cancelledBy: "patient" } });
  live.acknowledgeEnd(M);
  assert.strictEqual(live.card(), null);
}
console.log("✓ I\n");

console.log("Test J: a mission id from navigation alone opens nothing...");
{
  const d = device();
  assert.ok(!canOpenMission(M, d.machine()), "J: deep link with no server-confirmed mission");
  d.read(ok([rowFor(M, "en_route")]));
  assert.ok(!canOpenMission(M2, d.machine()), "J: someone else's / a stale id while on another mission");
  assert.ok(!canOpenMission(undefined, d.machine()));
  assert.ok(!canOpenMission("MSN-UP-2026-000321", d.machine()), "J: a display reference is not an id");
  assert.ok(canOpenMission(M, d.machine()));
  // The server side (RLS missions_select_driver, transition_mission PT404) is in supabase/tests/mission_api.behaviour.sql.
}
console.log("✓ J\n");

console.log("Test K: more than one active mission -> an explicit integrity error, never a silent choice...");
{
  const d = device();
  assert.strictEqual(d.read(ok([rowFor(M, "en_route"), rowFor(M2, "on_scene")])), "none", "K: the machine is not moved");
  assert.strictEqual(d.machine().activeMissionId, null, "K: neither mission is picked");
  assert.deepStrictEqual(d.card(), { kind: "integrity", missionIds: [M, M2], resumableId: null });
  assert.ok(holdsCurrentMission(d.view(), d.machine()), "K: not shown as available either");
  // A device already holding one of them from an earlier server confirmation keeps a way back to it.
  const holding = device();
  holding.read(ok([rowFor(M, "en_route")]));
  holding.read(ok([rowFor(M, "en_route"), rowFor(M2, "on_scene")]));
  assert.deepStrictEqual(holding.card(), { kind: "integrity", missionIds: [M, M2], resumableId: M });
  assert.deepStrictEqual(at(holding.machine()), { currentState: "enRouteToPatient", activeMissionId: M });
  holding.read(offline);
  assert.strictEqual(holding.card()?.kind, "integrity", "K: a failed read does not hide the anomaly");
}
console.log("✓ K\n");

console.log("Test R: a read that raced a local transition is discarded (it may predate the accept or completion)...");
{
  const d = device();
  d.send(GO_ONLINE);
  d.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: M, missionId: M } } as never);
  // The read started before the accept landed and came back empty: it must not end the mission just accepted.
  const r = d.read(ok([]), () => d.send({ type: "ACCEPT_DISPATCH", payload: { missionId: M, driverId: D, offerId: M, acceptedAt: "2026-10-03T10:00:00.000Z" } } as never));
  assert.strictEqual(r, "discarded");
  assert.deepStrictEqual(at(d.machine()), { currentState: "enRouteToPatient", activeMissionId: M });
  // A lost accept response: the server says assigned while the machine still shows the offer -> recovered.
  const lost = device();
  lost.send(GO_ONLINE);
  lost.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: M, missionId: M } } as never);
  assert.strictEqual(lost.read(ok([rowFor(M, "en_route")])), "hydrate");
  assert.strictEqual(lost.machine().currentState, "enRouteToPatient");
  // The driver's own COMPLETE is committed on the server, but its 200 has not reached the machine: a read that overlaps the
  // call sees "no mission" while the machine still says arrivedHospital. It must not be reported as a cancellation.
  const completing = device();
  completing.read(ok([rowFor(M, "arrived_hospital")]));
  completing.calls.pending = 1; // submit(COMPLETE_MISSION) in flight
  completing.calls.epoch += 1;
  assert.strictEqual(completing.read(ok([])), "discarded", "R: a read during a pending server call is discarded");
  assert.strictEqual(completing.read(ok([]), () => { completing.calls.pending = 0; completing.calls.epoch += 1; }), "discarded", "R: ...and one the call finished during");
  assert.ok(!completing.sent.includes("SERVER_MISSION_CANCELLED"), "R: no false 'mission ended' for the driver's own completion");
  completing.send({ type: "COMPLETE_MISSION", payload: { missionId: M, driverId: D, completedAt: "2026-10-03T10:00:00.000Z", handoff: {} } } as never);
  completing.acknowledgeEnd(M);
  assert.strictEqual(completing.read(ok([])), "none", "R: after the 200 the re-read agrees");
  assert.strictEqual(completing.card(), null);
}
console.log("✓ R\n");

console.log("CURRENT MISSION RECOVERY TESTS PASSED (100% GREEN)");
