import { assign, setup } from "xstate";
import type { AIS125VehicleType, GeoPoint, Jurisdiction } from "../types/index.ts";
import type { TriageResult } from "../triage/index.ts";
import { type ItemizedStatutoryFare, computeItemizedStatutoryFare } from "../pricing/index.ts";
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
  error: null,
};

/**
 * Patient Mission Lifecycle State Machine (pure, side-effect-free)
 *
 * Mirrors PatientLifecycleState/PatientLifecycleMachineEvent from
 * patientLifecycle.types.ts exactly - this IS that contract, executable.
 * No I/O, no navigation, no timers: every transition is a synchronous,
 * deterministic reducer over its event payload. The app layer (Zustand
 * store in apps/patient) owns mounting the actor, driving navigation off
 * its state, and sending SERVER_* events (mocked for this slice, real
 * once Centrifugo lands).
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
                distanceKm: DEFAULT_DISPATCH_DISTANCE_KM,
              }),
          }),
        },
        CANCEL: {
          target: "cancelled",
          actions: assign({ error: null, missionId: null, driverHasArrived: false }),
        },
      },
    },

    requesting: {
      on: {
        SERVER_MISSION_ASSIGNED: {
          target: "tracking",
          actions: assign({
            missionId: ({ event }) => event.payload.missionId,
          }),
        },
        CANCEL: {
          target: "cancelled",
          actions: assign({ error: null, missionId: null, driverHasArrived: false }),
        },
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
          actions: assign({ driverHasArrived: false }),
        },
        CANCEL: {
          target: "cancelled",
          actions: assign({ error: null, missionId: null, driverHasArrived: false }),
        },
      },
    },

    // Patient is onboard; cancellation is no longer offered from here on -
    // matches the driver-side lifecycle, which has no cancel path past
    // CONFIRM_PATIENT_ONBOARD either.
    transporting: {
      on: {
        SERVER_MISSION_COMPLETED: {
          target: "awaitingReceipt",
        },
      },
    },

    awaitingReceipt: {
      on: {
        CONFIRM_RECEIPT: {
          target: "receiptConfirmed",
        },
      },
    },

    receiptConfirmed: {},

    cancelled: {},
  },
});
