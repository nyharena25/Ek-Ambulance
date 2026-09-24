import { Centrifuge, UnauthorizedError } from "centrifuge";
import {
  missionChannelName,
  isMissionTelemetryPing,
  parseLifecycleMessage,
  type MissionTelemetryPing,
  type MissionLifecycleEventType,
  type ParsedLifecycleMessage,
} from "@sahayak/domain";

/**
 * Real-time mission channel: connects the patient client to Centrifugo v5
 * for live driver GPS telemetry and mission lifecycle pushes, per
 * docs/prompts/patient-app/P04-centrifugo-mission-channel.md.
 *
 * Centrifugo entirely replaces Supabase Realtime for this channel (both GPS
 * and lifecycle events) per the Phase 4 architecture invariant - Broadcast
 * is not RLS-filtered, which is why Centrifugo exists for this at all.
 * NOTE: this supersedes docs/prompts/patient-app/P06-booking-flow-lifecycle-wiring.md,
 * which specifies Supabase Postgres Changes for the assigned/completed
 * transitions - that doc is now stale and should be corrected at source.
 *
 * Telemetry/lifecycle wire types and the channel-naming/guard functions now
 * come from @sahayak/domain's mission-channel module (Cross-Client
 * Integration & Stabilization Sweep) - this file previously defined its own
 * copy independently of apps/driver/src/services/driverTelemetry.ts, which
 * had silently drifted to a different field name (`bearing` vs this file's
 * `heading`) for the identical value. Re-exported under the same names so
 * every existing importer (useMissionChannel.ts, missionLifecycleBridge.ts,
 * goldenPath.test.ts) needs no changes.
 */

export type CentrifugoConnectionStatus = "connected" | "connecting" | "disconnected";
export type DriverTelemetry = MissionTelemetryPing;
export type { MissionLifecycleEventType };

export type MissionChannelPublication =
  | { kind: "telemetry"; telemetry: DriverTelemetry }
  | { kind: "lifecycle"; event: MissionLifecycleEventType; missionId: string };

export interface MissionChannelCallbacks {
  onStatusChange: (status: CentrifugoConnectionStatus) => void;
  /** Distinct from client connect state: the transport can be "connected"
   *  while this specific channel subscription is still pending or has
   *  failed (e.g. a 403 on this mission but the client stays up). */
  onSubscriptionStateChange: (isSubscribed: boolean) => void;
  onTelemetry: (telemetry: DriverTelemetry) => void;
  /** Legacy shape (event name + channel mission id). Used by the dev mock channel, and by the real channel when
   *  `onLifecycleMessage` is not provided. */
  onLifecycleEvent: (event: MissionLifecycleEventType, missionId: string) => void;
  /** Preferred: the parsed v1 message (seq, eventId, data) for sequence-aware application. */
  onLifecycleMessage?: (message: ParsedLifecycleMessage) => void;
  /** The subscription (re)established. `recovered === false` means events may have been missed: reconcile. */
  onResubscribed?: (info: { recovered: boolean }) => void;
  onError: (error: Error) => void;
}

export { missionChannelName };

const GATEWAY_URL =
  process.env.EXPO_PUBLIC_GATEWAY_URL || "http://localhost:8000";
const CENTRIFUGO_WS_URL =
  process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL ||
  "ws://localhost:8001/connection/websocket";

/**
 * POST /realtime/token per P04 - never cache the result; callers (the
 * subscription's getToken) must call this fresh on every reconnect.
 * Throws Centrifugo's own UnauthorizedError on 403, which the client
 * recognizes internally as permanent (no retry loop) rather than a
 * transient error it would otherwise back off and retry.
 */
export async function fetchChannelToken(
  missionId: string,
  authToken: string
): Promise<string> {
  return requestToken(missionChannelName(missionId), authToken);
}

/** Connection token (`scope: "connect"`): the socket is authenticated, so anonymous connects can be disabled (6.8). */
export async function fetchConnectionToken(authToken: string): Promise<string> {
  return requestToken("connect", authToken);
}

async function requestToken(scope: string, authToken: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/realtime/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ scope }),
  });

  if (response.status === 403) {
    throw new UnauthorizedError(
      "Not authorized for this mission channel"
    );
  }
  if (!response.ok) {
    throw new Error(`Channel token request failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { token: string; channel: string };
  return body.token;
}

/** Minimal surface this module needs from a Centrifuge client - lets the
 *  teardown test inject a fake without opening a real socket. */
export interface ClientLike {
  connect(): void;
  disconnect(): void;
  on(event: "connecting" | "connected" | "disconnected", cb: () => void): unknown;
  newSubscription(channel: string, options: { getToken: () => Promise<string> }): SubscriptionLike;
}
export interface SubscriptionLike {
  subscribe(): void;
  unsubscribe(): void;
  on(event: "subscribed", cb: (ctx?: { wasRecovering?: boolean; recovered?: boolean }) => void): unknown;
  on(event: "unsubscribed", cb: () => void): unknown;
  on(event: "publication", cb: (ctx: { data: unknown }) => void): unknown;
  on(event: "error", cb: (ctx: { error: Error }) => void): unknown;
}

/**
 * Mounts a real Centrifugo subscription to mission:{missionId} and wires
 * its events to the given callbacks. Returns a teardown function that
 * unsubscribes then disconnects - call it on unmount and whenever
 * missionId changes, exactly once per mount.
 *
 * `createClient` is injectable so the teardown contract (unsubscribe then
 * disconnect, each exactly once) can be unit-tested with a fake client
 * that never opens a socket.
 */
export function mountMissionChannel(
  missionId: string,
  authToken: string,
  callbacks: MissionChannelCallbacks,
  createClient: (endpoint: string, options: Record<string, unknown>) => ClientLike = (
    endpoint,
    options
  ) => new Centrifuge(endpoint, options) as unknown as ClientLike
): () => void {
  const client = createClient(CENTRIFUGO_WS_URL, {
    minReconnectDelay: 500,
    maxReconnectDelay: 20000,
    // Fresh connection token on every (re)connect; never cached.
    getToken: () => fetchConnectionToken(authToken),
  });

  client.on("connecting", () => callbacks.onStatusChange("connecting"));
  client.on("connected", () => callbacks.onStatusChange("connected"));
  client.on("disconnected", () => callbacks.onStatusChange("disconnected"));

  const sub = client.newSubscription(missionChannelName(missionId), {
    getToken: () => fetchChannelToken(missionId, authToken),
  });

  sub.on("subscribed", (ctx) => {
    callbacks.onSubscriptionStateChange(true);
    // Centrifugo history is shared with GPS pings, so a lifecycle event can fall out of the recovery window: whenever
    // recovery was attempted and did not fully succeed, the caller reconciles against the server (7.5 rule 3).
    if (ctx?.wasRecovering && ctx.recovered === false) callbacks.onResubscribed?.({ recovered: false });
  });
  sub.on("unsubscribed", () => callbacks.onSubscriptionStateChange(false));
  sub.on("publication", (ctx) => {
    // Runs inside the socket callback: nothing here may throw (G-18). Unknown events and shapes are ignored.
    try {
      const data = ctx.data;
      if (isMissionTelemetryPing(data)) {
        callbacks.onTelemetry(data);
        return;
      }
      const message = parseLifecycleMessage(data);
      if (!message) return;
      if (callbacks.onLifecycleMessage) callbacks.onLifecycleMessage(message);
      // Rule 6: the mission id is the channel's, never the payload's.
      else callbacks.onLifecycleEvent(message.event, missionId);
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  });
  sub.on("error", (ctx) => callbacks.onError(ctx.error));

  client.connect();
  sub.subscribe();

  let torn = false;
  return () => {
    if (torn) return;
    torn = true;
    sub.unsubscribe();
    client.disconnect();
  };
}


/**
 * Dev-only mock mission channel: simulates the full lifecycle progression
 * (and a slow drift of GPS telemetry) without a live Centrifugo/Dispatch
 * backend. Fires through the exact same MissionChannelCallbacks interface
 * as the real mount, so the bridge in booking/[id].tsx has one code path
 * regardless of which source is live.
 *
 * Triggerable two ways, both explicitly named in the Phase 4 directive:
 *  - "from a debug drawer": the returned `controls` object, wired to the
 *    onSimulate* buttons already on MissionTrackingScreen/TransportingScreen.
 *  - "from the terminal": exposed at globalThis.__mockMissionChannel so a
 *    developer can call e.g. __mockMissionChannel.triggerDriverArrived()
 *    directly from the Metro/React Native debugger console.
 *
 * __DEV__-guarded at the call site (useMissionChannel.ts), not here - this
 * function has no opinion on when it's appropriate to run, only how to run.
 */
export interface MockMissionChannelControls {
  triggerDriverAccepted: () => void;
  triggerDriverArrived: () => void;
  triggerTransportStarted: () => void;
  triggerMissionCompleted: () => void;
  triggerCancelled: () => void;
}

export function createMockMissionChannel(
  missionId: string,
  callbacks: MissionChannelCallbacks
): { controls: MockMissionChannelControls; teardown: () => void } {
  callbacks.onStatusChange("connecting");

  let latitude = 28.5672;
  let longitude = 77.21;
  let heading = 68;

  // Converts the ad-hoc setInterval telemetry that previously lived inline
  // in MissionTrackingScreen/TransportingScreen into one shared mock source.
  const telemetryTimer = setInterval(() => {
    latitude += 0.0002;
    longitude += 0.0003;
    heading = (heading + Math.floor(Math.random() * 6 - 3) + 360) % 360;
    const speed = 40 + Math.floor(Math.random() * 16);
    callbacks.onTelemetry({
      latitude,
      longitude,
      heading,
      speed,
      timestamp: new Date().toISOString(),
    });
  }, 3500);

  // Mock "connects" on a short delay so onStatusChange callers see a real
  // connecting -> connected transition rather than always-already-connected.
  const connectTimer = setTimeout(() => {
    callbacks.onStatusChange("connected");
    callbacks.onSubscriptionStateChange(true);
  }, 400);

  const trigger = (event: MissionLifecycleEventType) =>
    callbacks.onLifecycleEvent(event, missionId);

  const controls: MockMissionChannelControls = {
    triggerDriverAccepted: () => trigger("DRIVER_ACCEPTED"),
    triggerDriverArrived: () => trigger("DRIVER_ARRIVED"),
    triggerTransportStarted: () => trigger("TRANSPORT_STARTED"),
    triggerMissionCompleted: () => trigger("MISSION_COMPLETED"),
    triggerCancelled: () => trigger("MISSION_CANCELLED"),
  };

  (globalThis as Record<string, unknown>).__mockMissionChannel = controls;

  let torn = false;
  const teardown = () => {
    if (torn) return;
    torn = true;
    clearInterval(telemetryTimer);
    clearTimeout(connectTimer);
    delete (globalThis as Record<string, unknown>).__mockMissionChannel;
    callbacks.onSubscriptionStateChange(false);
    callbacks.onStatusChange("disconnected");
  };

  return { controls, teardown };
}
