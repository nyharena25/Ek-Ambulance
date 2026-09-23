import { Centrifuge } from "centrifuge";
import {
  missionChannelName,
  type MissionTelemetryPing,
  type MissionLifecycleEventType,
} from "@sahayak/domain";

/**
 * Driver-side telemetry publisher: streams coordinate updates to the
 * Centrifugo channel mission:{missionId} while enRouteToPatient or
 * transporting, per docs/prompts/driver-app/P05-centrifugo-dispatch-and-gps-channels.md
 * §(b), and publishes the driver-lifecycle wire events the patient app's
 * missionLifecycleBridge.ts expects on the same channel. Publish-only
 * counterpart to the patient app's subscribe-only
 * apps/patient/src/services/missionChannel.service.ts - both now share the
 * exact wire types from @sahayak/domain's mission-channel module, closing
 * a real schema drift this pass found (this file previously published
 * `bearing`; the patient side has only ever read `heading`).
 */

export type { MissionTelemetryPing };

export { missionChannelName };

export interface LocationFix {
  latitude: number;
  longitude: number;
  /** Degrees; expo-location reports -1 / null when unknown. */
  heading?: number | null;
  /** Metres per second, as expo-location reports it; the wire ping carries km/h. */
  speed?: number | null;
}

export function locationToPing(fix: LocationFix, now: Date = new Date()): MissionTelemetryPing {
  const validHeading = typeof fix.heading === "number" && Number.isFinite(fix.heading) && fix.heading >= 0;
  const validSpeed = typeof fix.speed === "number" && Number.isFinite(fix.speed) && fix.speed >= 0;
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    heading: validHeading ? Math.round(fix.heading as number) % 360 : undefined,
    speed: validSpeed ? Math.round((fix.speed as number) * 3.6 * 10) / 10 : undefined,
    timestamp: now.toISOString(),
  };
}

const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL || "http://localhost:8000";
const CENTRIFUGO_WS_URL =
  process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL ||
  "ws://localhost:8001/connection/websocket";

/**
 * POST /realtime/token with { scope: "mission:{missionId}", role: "publisher" }
 * per P05 - the gateway signs a `publish: true` claim into the token,
 * distinguishing it from the patient's read-only token on the same channel.
 * Never cache the result; pass this as the client's `getToken` so a
 * reconnect always fetches a fresh one.
 */
export async function fetchPublisherToken(missionId: string, authToken: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/realtime/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ scope: missionChannelName(missionId), role: "publisher" }),
  });

  if (!response.ok) {
    throw new Error(`Publisher token request failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { token: string; channel: string; publish?: boolean };
  return body.token;
}

/** Minimal surface this module needs from a Centrifuge client - lets the
 *  teardown test inject a fake without opening a real socket. Publishing
 *  goes through client.publish(channel, data) directly (confirmed against
 *  centrifuge v5's own .d.ts) rather than a subscription, since a
 *  publish-only token needs no subscription to receive its own publishes. */
export interface PublisherClientLike {
  connect(): void;
  disconnect(): void;
  on(event: "connecting" | "connected" | "disconnected", cb: () => void): unknown;
  publish(channel: string, data: unknown): Promise<unknown>;
}

export interface DriverTelemetryPublisher {
  publish: (ping: MissionTelemetryPing) => void;
  /** Publishes a MissionLifecyclePublication that
   *  apps/patient/src/services/missionLifecycleBridge.ts translates into
   *  patient machine events - same channel, same wire shape, distinguished
   *  from a telemetry ping by shape (isMissionLifecyclePublication).
   *  `driverId` and `timestamp` are part of the shared contract
   *  (@sahayak/domain) but not yet read by the bridge - see its own
   *  doc comment.
   *
   *  Buffered and retried on failure (HANDOVER §17's own "not retried or
   *  queued" gap, closed here) - see the retry-queue doc comment below. */
  publishLifecycleEvent: (event: MissionLifecycleEventType, driverId: string) => void;
  teardown: () => void;
}

/** Three attempts total (one publish + two retries) spanning ~10s, per the
 *  Pre-Flight directive's "3 attempts over 10 seconds". Overridable so
 *  tests don't have to wait 10 real seconds per case. */
const DEFAULT_LIFECYCLE_RETRY_DELAYS_MS = [3000, 7000] as const;

export interface MountDriverTelemetryPublisherOptions {
  /** Called whenever a publish (telemetry, or a lifecycle event that has
   *  exhausted every retry) rejects - the caller's chance to surface the
   *  existing low-connectivity indicator (driverConnection.store.ts)
   *  without this module needing to know anything about that store. Never
   *  called synchronously from within publish()/publishLifecycleEvent()
   *  themselves - those never throw. Fires even if teardown() has already
   *  been called (a retry that was already in flight still reports its
   *  final outcome). */
  onPublishError?: (error: unknown) => void;
  createClient?: (endpoint: string, options: Record<string, unknown>) => PublisherClientLike;
  /** Delay before each retry, in order. Defaults to
   *  DEFAULT_LIFECYCLE_RETRY_DELAYS_MS; tests inject short delays (e.g.
   *  [5, 5]) so exhaustion doesn't require waiting 10 real seconds. */
  lifecycleRetryDelaysMs?: readonly number[];
}

/**
 * Mounts a publish-only Centrifugo connection for mission:{missionId}.
 * `publish()` (GPS telemetry) is fire-and-forget: a dropped ping during a
 * brief reconnect is acceptable, since the ~3s-throttled next tick
 * supersedes it.
 *
 * `publishLifecycleEvent()` is different: lifecycle events are low
 * frequency and higher-stakes (they drive the patient app's mission
 * state), so each one is buffered in a closure and retried with backoff
 * (`lifecycleRetryDelaysMs`, default 3 attempts spanning ~10s) before
 * `onPublishError` is called. Retries for every mission run on a single
 * FIFO promise chain (`lifecycleChain`) rather than independently, so a
 * retrying DRIVER_ARRIVED can never publish after a same-mission
 * TRANSPORT_STARTED that was sent moments later and succeeded first -
 * the patient machine would otherwise see events out of order.
 *
 * teardown() flips `torn` (blocking new publishLifecycleEvent() calls)
 * but does not disconnect the client until the chain has fully drained -
 * COMPLETE_MISSION/ABORT_MISSION both tear the publisher down in the same
 * synchronous tick that queues their own terminal wire event
 * (driverLifecycle.store.ts's ensurePublisherFor), so an immediate
 * disconnect would silently drop exactly the events retry exists to
 * protect.
 */
export function mountDriverTelemetryPublisher(
  missionId: string,
  authToken: string,
  options: MountDriverTelemetryPublisherOptions = {}
): DriverTelemetryPublisher {
  const {
    onPublishError,
    createClient = (endpoint, opts) => new Centrifuge(endpoint, opts) as unknown as PublisherClientLike,
    lifecycleRetryDelaysMs = DEFAULT_LIFECYCLE_RETRY_DELAYS_MS,
  } = options;

  const client = createClient(CENTRIFUGO_WS_URL, {
    minReconnectDelay: 500,
    maxReconnectDelay: 20000,
    getToken: () => fetchPublisherToken(missionId, authToken),
  });

  client.connect();

  const channel = missionChannelName(missionId);
  let torn = false;
  let lifecycleChain: Promise<void> = Promise.resolve();
  let pendingLifecyclePublishes = 0;

  function publishLifecycleWithRetry(payload: Record<string, unknown>, attempt: number): Promise<void> {
    return client.publish(channel, payload).then(
      () => {},
      (err: unknown) => {
        const delay = lifecycleRetryDelaysMs[attempt];
        if (delay === undefined) {
          // Exhausted every retry - surface even if teardown() already
          // ran, per the doc comment on onPublishError above.
          onPublishError?.(err);
          return;
        }
        return new Promise<void>((resolve) => {
          setTimeout(() => resolve(publishLifecycleWithRetry(payload, attempt + 1)), delay);
        });
      }
    );
  }

  return {
    publish: (ping) => {
      if (torn) return;
      client.publish(channel, ping).catch((err: unknown) => {
        // Best-effort - see the module doc comment above.
        onPublishError?.(err);
      });
    },
    publishLifecycleEvent: (event, driverId) => {
      if (torn) return;
      const payload = { event, missionId, driverId, timestamp: new Date().toISOString() };
      pendingLifecyclePublishes += 1;
      lifecycleChain = lifecycleChain
        .then(() => publishLifecycleWithRetry(payload, 0))
        .then(() => {
          pendingLifecyclePublishes -= 1;
          if (torn && pendingLifecyclePublishes === 0) {
            client.disconnect();
          }
        });
    },
    teardown: () => {
      if (torn) return;
      torn = true;
      // If a lifecycle retry is still draining, disconnect is deferred to
      // the last publishLifecycleEvent()'s chain callback above.
      if (pendingLifecyclePublishes === 0) {
        client.disconnect();
      }
    },
  };
}

/**
 * Dev-only mock telemetry emitter: interpolates steps along a route
 * polyline and calls onPing on the same cadence a real throttled publisher
 * would, so enRouteToPatient/transporting screens can be exercised on an
 * emulator without a live Centrifugo/GPS backend. __DEV__-guarded at the
 * call site, not here - same convention as
 * missionChannel.service.ts's createMockMissionChannel.
 */
export interface MockTelemetryEmitterControls {
  start: () => void;
  stop: () => void;
}

export function mockTelemetryEmitter(
  routePolyline: readonly { latitude: number; longitude: number }[],
  onPing: (ping: MissionTelemetryPing) => void,
  intervalMs = 3000
): MockTelemetryEmitterControls {
  let stepIndex = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start: () => {
      if (timer || routePolyline.length === 0) return;
      timer = setInterval(() => {
        const current = routePolyline[stepIndex % routePolyline.length];
        const next = routePolyline[(stepIndex + 1) % routePolyline.length];
        const heading =
          (Math.atan2(next!.longitude - current!.longitude, next!.latitude - current!.latitude) *
            180) /
          Math.PI;

        onPing({
          latitude: current!.latitude,
          longitude: current!.longitude,
          heading: (heading + 360) % 360,
          speed: 40 + Math.floor(Math.random() * 16),
          timestamp: new Date().toISOString(),
        });

        stepIndex += 1;
      }, intervalMs);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
