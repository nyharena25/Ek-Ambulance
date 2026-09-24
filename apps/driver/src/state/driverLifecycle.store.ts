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
import { newIdempotencyKey, type ApiError, type ApiResult } from "@sahayak/domain";
import { buildServerCall, type ServerCall } from "../lib/driverServer.core.ts";
import type { BoardSnapshot, DriverMissionEnd } from "@sahayak/domain";
import type { DriverProfile, DriverProfilePatch } from "../lib/driverProfile.core.ts";

/**
 * The server, as the store sees it. Injected by the app layer (app/_layout.tsx) once a verified session exists: this file
 * is loaded by node tests, so it must not import the supabase client (React Native) itself. While it is null the store
 * behaves exactly as before (local machine + the __DEV__ Design-B wire publish).
 */
export interface ServerAdapter {
  userId: string;
  accessToken: string;
  call: (call: ServerCall) => Promise<ApiResult<{ status?: string; seq?: number }>>;
  /** Go online / heartbeat / go offline. The server checks verification and writes the position (R-05). */
  setPresence: (isOnline: boolean, location?: { latitude: number; longitude: number }) => Promise<ApiResult<true>>;
  /** The Booking board: a per-driver read, so this driver only ever receives what the server allows them to see. */
  fetchBoard: () => Promise<ApiResult<BoardSnapshot>>;
  fetchProfile: () => Promise<ApiResult<DriverProfile>>;
  saveProfile: (patch: DriverProfilePatch) => Promise<ApiResult<DriverProfile>>;
}

export type SubmitResult = { ok: true; local: boolean } | { ok: false; error: ApiError };

let serverAdapter: ServerAdapter | null = null;
export function setServerAdapter(adapter: ServerAdapter | null): void {
  serverAdapter = adapter;
}
export const isServerAuthoritative = (): boolean => serverAdapter !== null;
export const getServerAdapter = (): ServerAdapter | null => serverAdapter;

// A retry after a lost response must reuse the same key so the server answers with the original result (7.8).
const pendingKeys = new Map<string, string>();
function keyFor(event: DriverLifecycleMachineEvent): string {
  const p = (event as { payload?: { missionId?: string; offerId?: string } }).payload;
  const scope = `${event.type}:${p?.missionId ?? p?.offerId ?? ""}`;
  let key = pendingKeys.get(scope);
  if (!key) {
    key = newIdempotencyKey();
    pendingKeys.set(scope, key);
  }
  return key;
}

export interface DriverLifecycleStoreState {
  currentState: DriverLifecycleState;
  driverId: string | null;
  activeMissionId: string | null;
  activeOfferId: string | null;
  missionEnd: DriverMissionEnd | null;
  error: string | null;
  send: (event: DriverLifecycleMachineEvent) => void;
  /**
   * Server-authoritative transition (7.5 rule 1): call the server first and advance the machine only on its 200. With no
   * server adapter (local development) it is the plain `send`.
   */
  submit: (event: DriverLifecycleMachineEvent) => Promise<SubmitResult>;
  reset: () => void;
}

// Same actor-wrapping shape as apps/patient/src/state/patientLifecycle.store.ts:
// the machine (packages/domain) is pure, mounting the actor here is the
// app-layer side effect. Kept flat (activeMissionId/activeOfferId/error as
// top-level fields, not nested under a `context` object) to match this
// store's pre-existing public shape - apps/driver/app/mission/[id].tsx
// already reads/writes `activeMissionId` at the top level.
let actor: Actor<typeof driverLifecycleMachine>;

// Local-development placeholder, used only while no verified session exists (no server adapter). The dev token minter
// accepts any bearer; the strict minter would reject it, which is the point.
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
    ? mountDriverTelemetryPublisher(missionId, serverAdapter?.accessToken ?? DEMO_AUTH_TOKEN, {
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
    missionEnd: context.missionEnd,
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
      // Design A (6.1): with a server adapter the SERVER publishes lifecycle events after its transaction commits, and the
      // driver publishes GPS only. The direct publish below is the local-development shortcut and would double-publish
      // (or be denied by the strict publish proxy) against a real backend.
      if (!serverAdapter) {
        publishForTransition(
          publisher,
          event.type,
          before.value as DriverLifecycleState,
          after.value as DriverLifecycleState,
          before.context.activeMissionId,
          before.context.driverId
        );
      }

      // Reconcile which mission (if any) the publisher should be
      // connected to, after any publish above has gone out. Mounts
      // proactively as soon as an offer sets activeMissionId
      // (SERVER_OFFER_RECEIVED, well before ACCEPT_DISPATCH), giving the
      // connection time to establish before the first lifecycle publish
      // is needed.
      ensurePublisherFor(after.context.activeMissionId);
    },
    submit: async (event) => {
      const server = serverAdapter;
      if (!server) {
        useDriverLifecycleStore.getState().send(event);
        return { ok: true, local: true };
      }
      const built = buildServerCall(event, keyFor(event));
      if (!built.ok) return { ok: false, error: { code: built.code, status: 0, retryable: false } };
      if (built.call) {
        const result = await server.call(built.call);
        // A refusal leaves the machine where it was: a mission the server did not accept is not one the driver holds.
        if (!result.ok) return result;
      }
      pendingKeys.delete(`${event.type}:${(event as { payload?: { missionId?: string; offerId?: string } }).payload?.missionId ?? (event as { payload?: { offerId?: string } }).payload?.offerId ?? ""}`);
      useDriverLifecycleStore.getState().send(event);
      return { ok: true, local: false };
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
