import { driverStateForStatus, type ApiResult, type DriverLifecycleState, type MissionStatus } from "@sahayak/domain";
import type { AssignedMissionRow } from "../lib/driverServer.core.ts";

/**
 * Current Mission recovery (7.6), pure half. The server's answer to "which mission is this driver on?" is the only source:
 * this module decides what the UI shows for that answer and which lifecycle event (if any) brings the machine in line. No
 * I/O, so every case below is unit-tested (activeMission.core.test.ts).
 */
export type ActiveMissionView =
  /** No server answer yet in this session. */
  | { kind: "checking" }
  | { kind: "none" }
  /** `stale`: the last read failed, so this is the last server-confirmed state, being refreshed. */
  | { kind: "active"; mission: AssignedMissionRow; stale: boolean; errorCode?: string }
  /** Never had an answer in this session and the read failed: unknown, not "none". */
  | { kind: "unknown"; errorCode: string }
  /** The server returned more than one active mission for this driver: reported, never resolved by picking one. */
  | { kind: "integrity"; missionIds: string[] };

export type MissionReadResult = ApiResult<AssignedMissionRow | null>;

/** The view after a read. Only a successful read changes what is known; a failure keeps the last known mission. */
function nextActiveMissionView(previous: ActiveMissionView, result: MissionReadResult): ActiveMissionView {
  if (result.ok) return result.data ? { kind: "active", mission: result.data, stale: false } : { kind: "none" };
  if (result.error.code === "multiple_active_missions") {
    return { kind: "integrity", missionIds: (result.error.detail ?? "").split(",").filter(Boolean) };
  }
  if (previous.kind === "active") return { ...previous, stale: true, errorCode: result.error.code };
  if (previous.kind === "integrity" || previous.kind === "none") return previous;
  return { kind: "unknown", errorCode: result.error.code };
}

/** The server acknowledged the end of the mission (COMPLETE / ABORT returned 200): that 200 is the confirmation. */
export function viewAfterMissionEndAcknowledged(view: ActiveMissionView, missionId: string): ActiveMissionView {
  return view.kind === "active" && view.mission.missionId === missionId ? { kind: "none" } : view;
}

const ACTIVE: readonly DriverLifecycleState[] = ["enRouteToPatient", "onScene", "transporting", "arrivedHospital"];
const RANK: Partial<Record<DriverLifecycleState, number>> = { enRouteToPatient: 1, onScene: 2, transporting: 3, arrivedHospital: 4 };

export interface MachineSnapshot {
  currentState: DriverLifecycleState;
  activeMissionId: string | null;
  /** Server calls in flight and their start/end counter (driverLifecycle.store serverCallActivity); absent = none tracked. */
  pendingCalls?: number;
  callEpoch?: number;
}

export type LifecycleSync =
  | { type: "none" }
  | { type: "hydrate"; missionId: string; status: MissionStatus }
  | { type: "end"; missionId: string };

/**
 * What a FRESH successful read means for the lifecycle machine (the caller discards reads that raced a local transition).
 * - assigned mission the machine does not hold (restart, background, lost accept response) -> HYDRATE;
 * - same mission, server further along (it is server-first, so never behind) -> HYDRATE forward; never backwards;
 * - no mission on the server while the machine holds one -> it ended (completed or cancelled server-side).
 * A failed read and an integrity error never move the machine.
 */
function lifecycleSyncFor(result: MissionReadResult, machine: MachineSnapshot): LifecycleSync {
  if (!result.ok) return { type: "none" };
  const holds = ACTIVE.includes(machine.currentState) ? machine.activeMissionId : null;
  const row = result.data;
  if (!row) return holds ? { type: "end", missionId: holds } : { type: "none" };
  const target = driverStateForStatus(row.status);
  if (!target) return { type: "none" };
  if (holds !== row.missionId) return { type: "hydrate", missionId: row.missionId, status: row.status };
  return (RANK[target] ?? 0) > (RANK[machine.currentState] ?? 0) ? { type: "hydrate", missionId: row.missionId, status: row.status } : { type: "none" };
}

/** True when the machine changed, or a server call was in flight, during a read: its answer may not match the machine. */
function readRacedTransition(before: MachineSnapshot, after: MachineSnapshot): boolean {
  // A transition the server committed but whose 200 has not reached the machine (a call pending or finished during the read)
  // is invisible to the machine: such a read could report "no mission" right after the driver's own COMPLETE.
  if ((before.pendingCalls ?? 0) > 0 || (after.pendingCalls ?? 0) > 0 || before.callEpoch !== after.callEpoch) return true;
  return before.currentState !== after.currentState || before.activeMissionId !== after.activeMissionId;
}

/** The mission route opens only for the mission the machine holds from a server confirmation; never for a bare URL id. */
export function canOpenMission(routeMissionId: string | undefined, machine: MachineSnapshot): boolean {
  return !!routeMissionId && ACTIVE.includes(machine.currentState) && machine.activeMissionId === routeMissionId;
}

/** "Return to Mission": the existing mission route for exactly this mission id. */
export function missionRoute(mission: AssignedMissionRow): { pathname: "/mission/[id]"; params: { id: string; pickupLat?: string; pickupLng?: string } } {
  return {
    pathname: "/mission/[id]",
    params: { id: mission.missionId, ...(mission.pickup ? { pickupLat: String(mission.pickup.latitude), pickupLng: String(mission.pickup.longitude) } : {}) },
  };
}

const STAGE: Partial<Record<MissionStatus, { en: string; hi: string }>> = {
  matched: { en: "En route to patient", hi: "मरीज की ओर" },
  en_route: { en: "En route to patient", hi: "मरीज की ओर" },
  on_scene: { en: "On scene", hi: "घटनास्थल पर" },
  transporting: { en: "Transporting to hospital", hi: "अस्पताल ले जा रहे हैं" },
  arrived_hospital: { en: "At hospital - handoff pending", hi: "अस्पताल पर - हस्तांतरण बाकी" },
};

export function missionStageLabel(status: MissionStatus, language: "en" | "hi"): string {
  return STAGE[status]?.[language] ?? status;
}

/** True when the driver holds a mission (server view or machine): availability UI (booking board) must not be offered. */
export function holdsCurrentMission(view: ActiveMissionView, machine: MachineSnapshot): boolean {
  return view.kind === "active" || view.kind === "integrity" || ACTIVE.includes(machine.currentState);
}

export type CurrentMissionCardModel =
  | { kind: "mission"; mission: AssignedMissionRow; stale: boolean }
  /** `resumableId`: the listed mission the machine already holds from an earlier server confirmation, else none to open. */
  | { kind: "integrity"; missionIds: string[]; resumableId: string | null }
  | { kind: "unknown"; errorCode: string };

/** The Current Mission section: absent with no mission (or before the first answer), present for a server-known one. */
export function currentMissionCard(view: ActiveMissionView, machine: MachineSnapshot): CurrentMissionCardModel | null {
  switch (view.kind) {
    case "active":
      return { kind: "mission", mission: view.mission, stale: view.stale };
    case "integrity": {
      const held = machine.activeMissionId && view.missionIds.includes(machine.activeMissionId) && ACTIVE.includes(machine.currentState);
      return { kind: "integrity", missionIds: view.missionIds, resumableId: held ? machine.activeMissionId : null };
    }
    case "unknown":
      return { kind: "unknown", errorCode: view.errorCode };
    default:
      return null;
  }
}

/**
 * One read, start to finish: discarded when the machine moved while it was in flight (it may predate an accept/complete),
 * otherwise the new view plus the lifecycle event that brings the machine in line with the server.
 */
export function reconcileRead(
  previous: ActiveMissionView,
  result: MissionReadResult,
  before: MachineSnapshot,
  after: MachineSnapshot
): { discard: true } | { discard: false; view: ActiveMissionView; sync: LifecycleSync } {
  if (readRacedTransition(before, after)) return { discard: true };
  return { discard: false, view: nextActiveMissionView(previous, result), sync: lifecycleSyncFor(result, after) };
}
