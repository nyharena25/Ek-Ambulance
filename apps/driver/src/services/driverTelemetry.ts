import { Centrifuge } from "centrifuge";
import { isMissionTelemetryPing, missionChannelName, type MissionTelemetryPing } from "@sahayak/domain";

/**
 * Driver-side telemetry publisher: streams coordinate updates to the
 * Centrifugo channel mission:{missionId} while enRouteToPatient or
 * transporting, per docs/prompts/driver-app/P05-centrifugo-dispatch-and-gps-channels.md
 * §(b). GPS only: lifecycle events are server-published. Publish-only
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
 * POST /realtime/token with { scope: "connect" }: an authenticated CONNECTION token (sub only). Publish authority is not a
 * token claim any more (6.5, 6.8): in strict mode Centrifugo asks the gateway's publish proxy, which admits GPS pings from
 * the assigned driver only. `missionId` stays in the signature for the dev minter's legacy behaviour and existing callers.
 * Never cache the result; pass this as the client's `getToken` so a reconnect always fetches a fresh one.
 */
export async function fetchPublisherToken(_missionId: string, authToken: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/realtime/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ scope: "connect" }),
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
  teardown: () => void;
}

export interface MountDriverTelemetryPublisherOptions {
  /** Called whenever a GPS publish rejects - the caller's chance to surface the existing low-connectivity indicator
   *  (driverConnection.store.ts) without this module knowing that store. Never called synchronously from publish(). */
  onPublishError?: (error: unknown) => void;
  createClient?: (endpoint: string, options: Record<string, unknown>) => PublisherClientLike;
}

/**
 * Mounts a publish-only Centrifugo connection for mission:{missionId} that carries GPS pings and nothing else.
 * Fire-and-forget: a dropped ping during a brief reconnect is acceptable, since the ~3s-throttled next tick supersedes it.
 *
 * Lifecycle events are never published from here (6.1 Design A): the server records the transition in mission_events and
 * its publish_realtime trigger sends the wire event, so the driver cannot forge or reorder a patient-visible milestone.
 * The strict publish proxy (docker/mock-gateway) refuses anything that is not a ping; publish() drops it first.
 */
export function mountDriverTelemetryPublisher(
  missionId: string,
  authToken: string,
  options: MountDriverTelemetryPublisherOptions = {}
): DriverTelemetryPublisher {
  const {
    onPublishError,
    createClient = (endpoint, opts) => new Centrifuge(endpoint, opts) as unknown as PublisherClientLike,
  } = options;

  const client = createClient(CENTRIFUGO_WS_URL, {
    minReconnectDelay: 500,
    maxReconnectDelay: 20000,
    getToken: () => fetchPublisherToken(missionId, authToken),
  });

  client.connect();

  const channel = missionChannelName(missionId);
  let torn = false;

  return {
    publish: (ping) => {
      // Same shape the publish proxy admits: coordinates, no `event`.
      if (torn || !isMissionTelemetryPing(ping) || "event" in ping) return;
      client.publish(channel, ping).catch((err: unknown) => {
        // Best-effort - see the doc comment above.
        onPublishError?.(err);
      });
    },
    teardown: () => {
      if (torn) return;
      torn = true;
      client.disconnect();
    },
  };
}
