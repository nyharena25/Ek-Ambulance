import { assign, setup } from "xstate";
import type { CareLevel } from "../types/index.ts";
import type { DriverLifecycleMachineEvent, DriverLifecycleState } from "./driverLifecycle.types.ts";

export interface DriverLifecycleContext {
  driverId: string | null;
  ambulanceId: string | null;
  careLevel: CareLevel | null;
  activeOfferId: string | null;
  activeMissionId: string | null;
  error: string | null;
}

const initialContext: DriverLifecycleContext = {
  driverId: null,
  ambulanceId: null,
  careLevel: null,
  activeOfferId: null,
  activeMissionId: null,
  error: null,
};

/**
 * Driver Mission Lifecycle State Machine (pure, side-effect-free), per
 * docs/prompts/driver-app/P02-driver-lifecycle-state-machine.md.
 *
 * Same shape as patientLifecycle.machine.ts: no I/O, no navigation, no
 * timers - the app layer (apps/driver/src/state/driverLifecycle.store.ts)
 * owns mounting the actor and driving navigation off its snapshots.
 * SERVER_OFFER_RECEIVED/SERVER_OFFER_TIMEOUT are dispatch-service-driven
 * events (real-time channel in P05, a mock harness for now); every other
 * event is a driver action or a server-confirmed transition acknowledgment.
 */
export const driverLifecycleMachine = setup({
  types: {
    context: {} as DriverLifecycleContext,
    events: {} as DriverLifecycleMachineEvent,
  },
}).createMachine({
  id: "driverLifecycle",
  initial: "offline" satisfies DriverLifecycleState,
  context: initialContext,
  states: {
    offline: {
      on: {
        GO_ONLINE: [
          {
            guard: ({ event }) => event.payload.ais125CertPath.trim().length > 0,
            target: "standby",
            actions: assign({
              driverId: ({ event }) => event.payload.driverId,
              ambulanceId: ({ event }) => event.payload.ambulanceId,
              careLevel: ({ event }) => event.payload.careLevel,
              error: null,
            }),
          },
          {
            // Empty/missing AIS-125 certificate path: statutory guard fails,
            // driver stays offline (unverified crew cannot enter dispatch pool).
            actions: assign({ error: "AIS125_CERT_UNVERIFIED" }),
          },
        ],
      },
    },

    standby: {
      on: {
        GO_OFFLINE: {
          target: "offline",
          actions: assign({ activeOfferId: null, error: null }),
        },
        SERVER_OFFER_RECEIVED: {
          target: "offered",
          actions: assign({
            activeOfferId: ({ event }) => event.payload.offerId,
            activeMissionId: ({ event }) => event.payload.missionId,
          }),
        },
      },
    },

    offered: {
      on: {
        ACCEPT_DISPATCH: {
          target: "enRouteToPatient",
          actions: assign({
            activeMissionId: ({ event }) => event.payload.missionId,
            activeOfferId: null,
          }),
        },
        // Both driver-declined and server-timed-out offers return to standby
        // identically: the offer is gone, the shift session is untouched.
        DECLINE_DISPATCH: {
          target: "standby",
          actions: assign({ activeOfferId: null, activeMissionId: null }),
        },
        SERVER_OFFER_TIMEOUT: {
          target: "standby",
          actions: assign({ activeOfferId: null, activeMissionId: null }),
        },
      },
    },

    enRouteToPatient: {
      on: {
        CONFIRM_ARRIVAL_SCENE: { target: "onScene" },
        ABORT_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null, error: null }),
        },
      },
    },

    onScene: {
      on: {
        CONFIRM_PATIENT_ONBOARD: { target: "transporting" },
        ABORT_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null, error: null }),
        },
      },
    },

    transporting: {
      on: {
        CONFIRM_ARRIVAL_HOSPITAL: { target: "arrivedHospital" },
        ABORT_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null, error: null }),
        },
      },
    },

    arrivedHospital: {
      on: {
        COMPLETE_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null }),
        },
        ABORT_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null, error: null }),
        },
      },
    },
  },
});
