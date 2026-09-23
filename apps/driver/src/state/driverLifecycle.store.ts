import { create } from "zustand";
import { createActor, type Actor } from "xstate";
import {
  driverLifecycleMachine,
  type DriverLifecycleContext,
  type DriverLifecycleMachineEvent,
  type DriverLifecycleState,
} from "@sahayak/domain";
import { mountDriverTelemetryPublisher, type DriverTelemetryPublisher } from "../services/driverTelemetry.ts";
import { publishForTransition } from "./driverLifecycleWire.core.ts";
import { useDriverConnectionStore } from "./driverConnection.store.ts";

export interface DriverLifecycleStoreState {
  currentState: DriverLifecycleState;
  driverId: string | null;
  activeMissionId: string | null;
  activeOfferId: string | null;
  error: string | null;
  send: (event: DriverLifecycleMachineEvent) => void;
  reset: () => void;
}

// Same actor-wrapping shape as apps/patient/src/state/patientLifecycle.store.ts:
// the machine (packages/domain) is pure, mounting the actor here is the
// app-layer side effect. Kept flat (activeMissionId/activeOfferId/error as
// top-level fields, not nested under a `context` object) to match this
// store's pre-existing public shape - apps/driver/app/mission/[id].tsx
// already reads/writes `activeMissionId` at the top level.
let actor: Actor<typeof driverLifecycleMachine>;

// No real authenticated session/token store exists yet for the driver app
// (Phase 1 deliberately skipped one - nothing needed it until now); reuses
// the same placeholder DriverNavigationScreen.tsx already passes to
// useGpsPublisher, not a new invented value.
const DEMO_AUTH_TOKEN = "demo_auth_token";

// Wire Event Publishing Closure: one Centrifugo publisher, mounted for
// whichever mission is currently active and torn down when none is. Owned
// here (not per-screen like useGpsPublisher's telemetry publisher) because
// every domain event that needs to publish a wire lifecycle event already
// flows through this store's send() - centralizing here is what closes
// the "built and unit-tested but never wired into any UI action" gap this
// phase exists to fix, without needing to duplicate publish calls across
// (shift)/offer.tsx and mission/[id].tsx.
let publisher: DriverTelemetryPublisher | null = null;
let publisherMissionId: string | null = null;

function ensurePublisherFor(missionId: string | null) {
  if (missionId === publisherMissionId) return;
  const previous = publisher;
  publisher = missionId
    ? mountDriverTelemetryPublisher(missionId, DEMO_AUTH_TOKEN, {
        onPublishError: () => {
          // Surface the existing low-connectivity indicator
          // (OfflineConnectivityOverlay, driven by driverConnection.store)
          // rather than a new one - same mechanism useGpsPublisher.ts
          // already uses for a failed telemetry publish. The state
          // transition that triggered this has already been applied; a
          // dropped wire event never blocks or reverses it.
          useDriverConnectionStore.getState().setConnectionStatus("fallback");
          useDriverConnectionStore.getState().setFallbackActive(true);
        },
      })
    : null;
  publisherMissionId = missionId;
  previous?.teardown();
}

/** Live GPS pings ride the same publisher the lifecycle wire events use; a no-op when no mission is active. */
export function publishDriverTelemetry(ping: Parameters<DriverTelemetryPublisher["publish"]>[0]): void {
  publisher?.publish(ping);
}

function contextFields(context: DriverLifecycleContext) {
  return {
    driverId: context.driverId,
    activeMissionId: context.activeMissionId,
    activeOfferId: context.activeOfferId,
    error: context.error,
  };
}

export const useDriverLifecycleStore = create<DriverLifecycleStoreState>((set) => {
  const mount = () => {
    if (actor) actor.stop();
    actor = createActor(driverLifecycleMachine);
    actor.subscribe((snapshot) => {
      set({
        currentState: snapshot.value as DriverLifecycleState,
        ...contextFields(snapshot.context),
      });
    });
    actor.start();
  };

  mount();

  return {
    currentState: actor.getSnapshot().value as DriverLifecycleState,
    ...contextFields(actor.getSnapshot().context),
    send: (event) => {
      const before = actor.getSnapshot();
      actor.send(event);
      const after = actor.getSnapshot();

      // Publish against the mission this transition pertains to - the ID
      // active BEFORE the transition, since COMPLETE_MISSION/ABORT_MISSION
      // clear activeMissionId as part of the very same transition. The
      // publisher for that mission must still be connected to carry the
      // terminal wire event before ensurePublisherFor (below) tears it
      // down for the now-null missionId.
      publishForTransition(
        publisher,
        event.type,
        before.value as DriverLifecycleState,
        after.value as DriverLifecycleState,
        before.context.activeMissionId,
        before.context.driverId
      );

      // Reconcile which mission (if any) the publisher should be
      // connected to, after any publish above has gone out. Mounts
      // proactively as soon as an offer sets activeMissionId
      // (SERVER_OFFER_RECEIVED, well before ACCEPT_DISPATCH), giving the
      // connection time to establish before the first lifecycle publish
      // is needed.
      ensurePublisherFor(after.context.activeMissionId);
    },
    reset: () => {
      mount();
      ensurePublisherFor(null);
      set({
        currentState: actor.getSnapshot().value as DriverLifecycleState,
        ...contextFields(actor.getSnapshot().context),
      });
    },
  };
});
