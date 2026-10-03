import { assign, setup } from "xstate";
import type { AIS125VehicleType, GeoPoint, Jurisdiction } from "../types/index.ts";
import type { TriageResult } from "../triage/index.ts";
import { type ItemizedStatutoryFare, computeItemizedStatutoryFare } from "../pricing/index.ts";
import type {
  AssignedDriverInfo,
  CancelledBy,
  MaskedCallInfo,
  MissionCompletedData,
  MissionStatus,
  TransportDestination,
} from "../mission-channel/index.ts";
import { patientStateForStatus } from "../dispatch/index.ts";
import type { PatientLifecycleMachineEvent, PatientLifecycleState } from "./patientLifecycle.types.ts";

/**
 * Placeholder dispatch distance until real turn-by-turn routing (Centrifugo /
 * driver GPS) is wired in. Every step of the pipeline - the AIS-125 category
 * preview fares, the statutory fare bottom sheet, and the fare actually
 * locked into context on REQUEST - uses this SAME constant, so a mission's
 * quoted price is internally consistent even though the distance itself is
 * not yet real.
 */
export const DEFAULT_DISPATCH_DISTANCE_KM = 8.4;

export interface PatientCancellation {
  cancelledBy: CancelledBy | null;
  reason: string | null;
  note: string | null;
  fromState: MissionStatus | null;
}

export interface PatientLifecycleContext {
  patientId: string | null;
  missionId: string | null;
  pickup: GeoPoint | null;
  jurisdiction: Jurisdiction | null;
  triageResult: TriageResult | null;
  vehicleType: AIS125VehicleType | null;
  fareDetails: ItemizedStatutoryFare | null;
  /** True once the assigned driver has physically reached the patient -
   *  a same-screen visual cue (MissionTrackingScreen's progression stepper),
   *  not a state transition; the screen stays in `tracking` throughout. */
  driverHasArrived: boolean;
  /** Server-supplied facts only. Null means "not told": screens hide the field rather than invent one (P-UX-05). */
  assignedDriver: AssignedDriverInfo | null;
  maskedCall: MaskedCallInfo | null;
  etaMinutes: number | null;
  destination: TransportDestination | null;
  wardStatus: string | null;
  /** The driver reached the hospital and is signing off; still `transporting` for the patient. */
  hospitalArrived: boolean;
  completion: MissionCompletedData | null;
  /** Who ended the mission and why, so the cancelled screen can say something true (P12). */
  cancellation: PatientCancellation | null;
  error: string | null;
}

const initialContext: PatientLifecycleContext = {
  patientId: null,
  missionId: null,
  pickup: null,
  jurisdiction: null,
  triageResult: null,
  vehicleType: null,
  fareDetails: null,
  driverHasArrived: false,
  assignedDriver: null,
  maskedCall: null,
  etaMinutes: null,
  destination: null,
  wardStatus: null,
  hospitalArrived: false,
  completion: null,
  cancellation: null,
  error: null,
};

type HydrateTarget = "requesting" | "tracking" | "transporting" | "awaitingReceipt" | "cancelled";

/**
 * Section 7.5 rule 5: jump to whatever the server says the mission is (a snapshot read, or a gap recovery),
 * instead of replaying events in order. The snapshot is authoritative, so it may also move a machine backwards
 * (a missed DRIVER_RELEASED). Terminal states ignore it: those end a booking and `reset()` starts a new one.
 */
const hydrate = (["requesting", "tracking", "transporting", "awaitingReceipt", "cancelled"] as const).map(
  (target) => ({
    guard: { type: "hydratesTo" as const, params: { target } },
    target,
    actions: "applyHydrate" as const,
  })
);

/**
 * Patient Mission Lifecycle State Machine (pure, side-effect-free)
 *
 * Mirrors PatientLifecycleState/PatientLifecycleMachineEvent from
 * patientLifecycle.types.ts exactly - this IS that contract, executable.
 * No I/O, no navigation, no timers: every transition is a synchronous,
 * deterministic reducer over its event payload. The app layer (Zustand
 * store in apps/patient) owns mounting the actor, driving navigation off
 * its state, and sending SERVER_* events.
 *
 * `tracking` and `transporting` are deliberately separate states even
 * though both currently transition only to their one successor: they
 * render genuinely different screens (MissionTrackingScreen vs
 * TransportingScreen), which is exactly the distinction an app state is
 * for. `matched`/`accepted`/`en_route_to_patient`/`on_scene` are NOT
 * separate states - none of them has a distinct screen, so collapsing
 * them into `tracking` is correct, not a shortcut.
 */
export const patientLifecycleMachine = setup({
  types: {
    context: {} as PatientLifecycleContext,
    events: {} as PatientLifecycleMachineEvent,
  },
  guards: {
    hydratesTo: ({ event }, params: { target: HydrateTarget }) =>
      event.type === "HYDRATE" && patientStateForStatus(event.payload.status) === params.target,
  },
  actions: {
    applyHydrate: assign(({ context, event }) => {
      if (event.type !== "HYDRATE") return {};
      const p = event.payload;
      return {
        missionId: p.missionId,
        vehicleType: p.vehicleType ?? context.vehicleType,
        jurisdiction: p.jurisdiction ?? context.jurisdiction,
        pickup: p.pickup ?? context.pickup,
        fareDetails: p.fareDetails ?? context.fareDetails,
        // Back to `requesting` (driver released): nobody is assigned any more. ETA is never restored: it was only true when sent.
        assignedDriver: p.status === "requesting" ? null : (p.driver ?? context.assignedDriver),
        // Destination and final fare only exist from transport / completion on; a reconnect reloads them from the stored events.
        destination: p.status === "requesting" || p.status === "en_route" || p.status === "on_scene" ? null : (p.destination ?? context.destination),
        completion: p.completion ?? context.completion,
        cancellation: p.cancellation
          ? {
              cancelledBy: p.cancellation.cancelledBy ?? null,
              reason: p.cancellation.reason ?? null,
              note: p.cancellation.note ?? null,
              fromState: p.cancellation.fromState ?? null,
            }
          : context.cancellation,
        driverHasArrived: p.status === "on_scene",
        hospitalArrived: p.status === "arrived_hospital",
        error: null,
      };
    }),
  },
}).createMachine({
  id: "patientLifecycle",
  initial: "idle" satisfies PatientLifecycleState,
  context: initialContext,
  states: {
    idle: {
      on: {
        SUBMIT_TRIAGE: {
          target: "triaged",
          actions: assign({
            triageResult: ({ event }) => event.payload.result,
            error: null,
          }),
        },
        HYDRATE: hydrate,
      },
    },

    triaged: {
      on: {
        REQUEST: {
          target: "requesting",
          actions: assign({
            patientId: ({ event }) => event.payload.patientId,
            pickup: ({ event }) => event.payload.pickup,
            jurisdiction: ({ event }) => event.payload.jurisdiction,
            vehicleType: ({ event }) => event.payload.vehicleType,
            fareDetails: ({ event }) =>
              computeItemizedStatutoryFare({
                vehicleType: event.payload.vehicleType,
                jurisdiction: event.payload.jurisdiction,
                distanceKm: event.payload.distanceKm ?? DEFAULT_DISPATCH_DISTANCE_KM,
              }),
          }),
        },
        CANCEL: {
          target: "cancelled",
          actions: assign({
            error: null,
            missionId: null,
            driverHasArrived: false,
            cancellation: ({ event }) => ({
              cancelledBy: "patient",
              reason: event.payload.reason ?? null,
              note: event.payload.reasonNote ?? null,
              fromState: null,
            }),
          }),
        },
        HYDRATE: hydrate,
      },
    },

    requesting: {
      on: {
        // The server accepted the request: the mission id exists from here on, and the matching screen can
        // subscribe to mission:{id} before any driver is assigned.
        SERVER_MISSION_CREATED: {
          actions: assign({ missionId: ({ event }) => event.payload.missionId }),
        },
        SERVER_MISSION_ASSIGNED: {
          target: "tracking",
          actions: assign({
            // Rule 6: a mission id already known wins over the payload's.
            missionId: ({ context, event }) => context.missionId ?? event.payload.missionId,
            assignedDriver: ({ event }) => event.payload.driver ?? null,
            maskedCall: ({ event }) => event.payload.maskedCall ?? null,
            etaMinutes: ({ event }) => event.payload.etaMinutes ?? null,
          }),
        },
        SERVER_MISSION_CANCELLED: {
          target: "cancelled",
          actions: assign({
            error: null,
            missionId: null,
            driverHasArrived: false,
            cancellation: ({ event }) => ({
              cancelledBy: event.payload.cancelledBy ?? null,
              reason: event.payload.reason ?? null,
              note: event.payload.note ?? null,
              fromState: event.payload.fromState ?? null,
            }),
          }),
        },
        CANCEL: {
          target: "cancelled",
          actions: assign({
            error: null,
            missionId: null,
            driverHasArrived: false,
            cancellation: ({ event }) => ({
              cancelledBy: "patient",
              reason: event.payload.reason ?? null,
              note: event.payload.reasonNote ?? null,
              fromState: "requesting",
            }),
          }),
        },
        HYDRATE: hydrate,
      },
    },

    tracking: {
      on: {
        // Context-only: the driver has physically arrived at the pickup
        // point, but this is still the same screen (MissionTrackingScreen)
        // as "en route" - no target, so state.value stays "tracking".
        SERVER_DRIVER_ARRIVED: {
          actions: assign({ driverHasArrived: true }),
        },
        SERVER_TRANSPORT_STARTED: {
          target: "transporting",
          actions: assign({
            driverHasArrived: false,
            destination: ({ event }) => event.payload.destination ?? null,
            etaMinutes: ({ event }) => event.payload.etaMinutes ?? null,
            wardStatus: ({ event }) => event.payload.wardStatus ?? null,
          }),
        },
        // D-3: a driver abort before pickup re-dispatches. The patient returns to matching, not to a dead end.
        SERVER_DRIVER_RELEASED: {
          target: "requesting",
          actions: assign({
            driverHasArrived: false,
            assignedDriver: null,
            maskedCall: null,
            etaMinutes: null,
          }),
        },
        SERVER_MISSION_CANCELLED: {
          target: "cancelled",
          actions: assign({
            error: null,
            missionId: null,
            driverHasArrived: false,
            cancellation: ({ event }) => ({
              cancelledBy: event.payload.cancelledBy ?? null,
              reason: event.payload.reason ?? null,
              note: event.payload.note ?? null,
              fromState: event.payload.fromState ?? null,
            }),
          }),
        },
        CANCEL: {
          target: "cancelled",
          actions: assign({
            error: null,
            missionId: null,
            driverHasArrived: false,
            cancellation: ({ event }) => ({
              cancelledBy: "patient",
              reason: event.payload.reason ?? null,
              note: event.payload.reasonNote ?? null,
              fromState: "en_route",
            }),
          }),
        },
        HYDRATE: hydrate,
      },
    },

    // Patient is onboard; the patient cannot cancel from here on (no CANCEL), matching the driver side. A
    // SERVER-side cancel (the driver aborted, D-3) is still handled: without it the patient was stranded (G-05).
    transporting: {
      on: {
        SERVER_HOSPITAL_ARRIVED: {
          actions: assign({ hospitalArrived: true }),
        },
        SERVER_MISSION_COMPLETED: {
          target: "awaitingReceipt",
          actions: assign({ completion: ({ event }) => event.payload.completion ?? null }),
        },
        SERVER_MISSION_CANCELLED: {
          target: "cancelled",
          actions: assign({
            error: null,
            missionId: null,
            driverHasArrived: false,
            cancellation: ({ event }) => ({
              cancelledBy: event.payload.cancelledBy ?? null,
              reason: event.payload.reason ?? null,
              note: event.payload.note ?? null,
              fromState: event.payload.fromState ?? "transporting",
            }),
          }),
        },
        HYDRATE: hydrate,
      },
    },

    awaitingReceipt: {
      on: {
        CONFIRM_RECEIPT: {
          target: "receiptConfirmed",
        },
        HYDRATE: hydrate,
      },
    },

    receiptConfirmed: {},

    cancelled: {},
  },
});
