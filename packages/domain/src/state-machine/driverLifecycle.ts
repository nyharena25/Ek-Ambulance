import { assign, setup } from "xstate";
import type { CareLevel } from "../types/index.ts";
import type { CancelledBy } from "../mission-channel/index.ts";
import { driverStateForStatus } from "../dispatch/index.ts";
import type { DriverLifecycleMachineEvent, DriverLifecycleState } from "./driverLifecycle.types.ts";

/** Why the driver was returned to standby without acting: a notice for the UI, cleared by the next offer. */
export interface DriverMissionEnd {
  kind: "offer_revoked" | "mission_cancelled";
  reason: string | null;
  cancelledBy: CancelledBy | null;
}

export interface DriverLifecycleContext {
  driverId: string | null;
  ambulanceId: string | null;
  careLevel: CareLevel | null;
  activeOfferId: string | null;
  activeMissionId: string | null;
  missionEnd: DriverMissionEnd | null;
  error: string | null;
}

const initialContext: DriverLifecycleContext = {
  driverId: null,
  ambulanceId: null,
  careLevel: null,
  activeOfferId: null,
  activeMissionId: null,
  missionEnd: null,
  error: null,
};

type DriverHydrateTarget = "enRouteToPatient" | "onScene" | "transporting" | "arrivedHospital";

/**
 * Section 7.6: a driver process killed mid-mission loses its mission id. The assigned mission is a normal RLS read,
 * so the app resumes by jumping the machine to the state the server reports. Only the four in-mission states have a
 * driver screen; any other status maps to no state and the event is ignored.
 */
const hydrate = (["enRouteToPatient", "onScene", "transporting", "arrivedHospital"] as const).map((target) => ({
  guard: { type: "hydratesTo" as const, params: { target } },
  target,
  actions: "applyHydrate" as const,
}));

const endedByServer = {
  target: "standby" as const,
  actions: "applyServerCancel" as const,
};

/**
 * Driver Mission Lifecycle State Machine (pure, side-effect-free), per
 * docs/prompts/driver-app/P02-driver-lifecycle-state-machine.md.
 *
 * Same shape as patientLifecycle.machine.ts: no I/O, no navigation, no
 * timers - the app layer (apps/driver/src/state/driverLifecycle.store.ts)
 * owns mounting the actor and driving navigation off its snapshots.
 * SERVER_OFFER_RECEIVED/SERVER_OFFER_TIMEOUT/SERVER_OFFER_REVOKED are dispatch-service-driven
 * events; every other event is a driver action or a server-confirmed transition acknowledgment.
 */
export const driverLifecycleMachine = setup({
  types: {
    context: {} as DriverLifecycleContext,
    events: {} as DriverLifecycleMachineEvent,
  },
  guards: {
    hydratesTo: ({ event }, params: { target: DriverHydrateTarget }) =>
      event.type === "HYDRATE" && driverStateForStatus(event.payload.status) === params.target,
  },
  actions: {
    applyHydrate: assign(({ context, event }) => {
      if (event.type !== "HYDRATE") return {};
      return {
        activeMissionId: event.payload.missionId,
        driverId: event.payload.driverId ?? context.driverId,
        activeOfferId: null,
        missionEnd: null,
        error: null,
      };
    }),
    applyServerCancel: assign(({ event }) => {
      if (event.type !== "SERVER_MISSION_CANCELLED") return {};
      return {
        activeMissionId: null,
        activeOfferId: null,
        error: null,
        missionEnd: {
          kind: "mission_cancelled",
          reason: event.payload.reason ?? null,
          cancelledBy: event.payload.cancelledBy ?? null,
        } satisfies DriverMissionEnd,
      };
    }),
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
        HYDRATE: hydrate,
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
            missionEnd: null,
          }),
        },
        HYDRATE: hydrate,
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
        // Lost the race, or the patient cancelled: back to standby with a "no longer available" notice.
        SERVER_OFFER_REVOKED: {
          target: "standby",
          actions: assign({
            activeOfferId: null,
            activeMissionId: null,
            missionEnd: ({ event }): DriverMissionEnd => ({
              kind: "offer_revoked",
              reason: event.payload.reason,
              cancelledBy: null,
            }),
          }),
        },
        HYDRATE: hydrate,
      },
    },

    enRouteToPatient: {
      on: {
        CONFIRM_ARRIVAL_SCENE: { target: "onScene" },
        ABORT_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null, error: null }),
        },
        SERVER_MISSION_CANCELLED: endedByServer,
        HYDRATE: hydrate,
      },
    },

    onScene: {
      on: {
        CONFIRM_PATIENT_ONBOARD: { target: "transporting" },
        ABORT_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null, error: null }),
        },
        SERVER_MISSION_CANCELLED: endedByServer,
        HYDRATE: hydrate,
      },
    },

    transporting: {
      on: {
        CONFIRM_ARRIVAL_HOSPITAL: { target: "arrivedHospital" },
        ABORT_MISSION: {
          target: "standby",
          actions: assign({ activeMissionId: null, activeOfferId: null, error: null }),
        },
        SERVER_MISSION_CANCELLED: endedByServer,
        HYDRATE: hydrate,
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
        SERVER_MISSION_CANCELLED: endedByServer,
        HYDRATE: hydrate,
      },
    },
  },
});
