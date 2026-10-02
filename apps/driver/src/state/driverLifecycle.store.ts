import { create } from "zustand";
import { createActor, type Actor } from "xstate";
import {
  driverLifecycleMachine,
  type DriverLifecycleContext,
  type DriverLifecycleMachineEvent,
  type DriverLifecycleState,
} from "@sahayak/domain";
import { mountDriverTelemetryPublisher, type DriverTelemetryPublisher } from "../services/driverTelemetry.ts";
import { useDriverConnectionStore } from "./driverConnection.store.ts";
import { newIdempotencyKey, type ApiError, type ApiResult } from "@sahayak/domain";
import { buildServerCall, type ServerCall } from "../lib/driverServer.core.ts";
import type { BoardSnapshot, DriverMissionEnd } from "@sahayak/domain";
import type { DriverProfile, DriverProfilePatch } from "../lib/driverProfile.core.ts";
import type { ApplicationFields, DraftApplicationFields } from "../lib/kycSubmission.core.ts";
import type { UploadedKycDocument } from "../lib/driverServer.ts";
import type { DocumentSlotKey } from "./driverOnboarding.store.ts";

/**
 * The server, as the store sees it. Injected by the app layer (app/_layout.tsx) once a verified session exists: this file
 * is loaded by node tests, so it must not import the supabase client (React Native) itself. While it is null the store
 * behaves exactly as before (local machine only).
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
  /** KYC (5.4): license/EMT/vehicle-tier fields, document upload, and the final submit. Each call is
   *  server-validated on its own - there is no client-side "approved" outcome anywhere in this adapter. */
  /** upsert_driver_application: the Step 1 draft before the first upload, then the full application on Submit. */
  submitApplication: (fields: ApplicationFields | DraftApplicationFields) => Promise<ApiResult<{ kycStatus: string }>>;
  submitKyc: () => Promise<ApiResult<{ kycStatus: string; kycReference?: string; submittedAt?: string }>>;
  uploadDocument: (
    slot: DocumentSlotKey,
    asset: { uri: string; name: string; mimeType: string | null | undefined }
  ) => Promise<ApiResult<UploadedKycDocument>>;
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

// One GPS publisher, mounted for whichever mission is currently active and torn down when none is.
let publisher: DriverTelemetryPublisher | null = null;
let publisherMissionId: string | null = null;

function ensurePublisherFor(missionId: string | null) {
  if (missionId === publisherMissionId) return;
  const previous = publisher;
  // Only a verified driver session may publish: without one there is no publisher (never a placeholder bearer).
  const accessToken = serverAdapter?.accessToken;
  publisher = missionId && accessToken
    ? mountDriverTelemetryPublisher(missionId, accessToken, {
        onPublishError: () => {
          // A failed GPS publish surfaces the existing low-connectivity indicator (OfflineConnectivityOverlay) and
          // switches pings to the acknowledged upload queue.
          useDriverConnectionStore.getState().setConnectionStatus("fallback");
          useDriverConnectionStore.getState().setFallbackActive(true);
        },
      })
    : null;
  publisherMissionId = missionId;
  previous?.teardown();
}

/** Live GPS pings; a no-op when no mission is active. */
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
      actor.send(event);
      const after = actor.getSnapshot();

      // Lifecycle events are server-published only (6.1 Design A): the server records the transition in mission_events and
      // its publish_realtime trigger sends the wire event. The driver publishes GPS pings, nothing else.

      // Reconcile which mission (if any) the GPS publisher should be connected to. Mounts as soon as an offer sets
      // activeMissionId (SERVER_OFFER_RECEIVED), giving the connection time to establish before the first ping.
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
