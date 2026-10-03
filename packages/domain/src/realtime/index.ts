/**
 * One realtime connection state per app (Centrifugo is the only transport). Pure: the apps feed it the SDK's own lifecycle
 * callbacks (connecting / connected / disconnected, subscribing / subscribed / unsubscribed) and read health from it.
 *
 * Three things are kept apart on purpose:
 *   - transport health (this module): is the socket up and the channel subscribed;
 *   - GPS health (gpsHealth): how old the last position is;
 *   - business availability (driver online/offline, mission state): never derived from either of the above.
 *
 * State machine, from SDK evidence only:
 *   HEALTHY  connected + subscribed
 *   DEGRADED connected but not subscribed, or down for less than the grace period (a blip)
 *   RECONNECTING down past the grace period, still retrying
 *   DISCONNECTED down past the failure threshold or after N failed attempts (the only state that justifies fallback UI)
 * Silence on a channel is never evidence of failure: a searching mission can be quiet for minutes.
 */

export type ConnectionState = "disconnected" | "connecting" | "connected";
export type SubscriptionState = "unsubscribed" | "subscribing" | "subscribed";
export type TransportHealth = "healthy" | "degraded" | "reconnecting" | "disconnected";
export type GpsHealth = "none" | "stale" | "fresh";

export interface RealtimeSnapshot {
  transportName: "centrifugo";
  connectionState: ConnectionState;
  subscriptionState: SubscriptionState;
  lastConnectedAt: number | null;
  /** When the socket stopped being connected (or first started connecting); null while connected. */
  downSince: number | null;
  lastMessageAt: number | null;
  /** Last confirmed liveness signal the app has (e.g. a successful presence heartbeat); never synthesised. */
  lastHeartbeatAt: number | null;
  /** Failed connection attempts since the socket was last connected (the drop itself counts as one); 0 while connected. */
  reconnectAttempt: number;
  lastError: string | null;
}

export type RealtimeEvent =
  | { type: "connecting"; reason?: string }
  | { type: "connected" }
  | { type: "disconnected"; reason?: string }
  | { type: "subscribing" }
  | { type: "subscribed" }
  | { type: "unsubscribed" }
  | { type: "message" }
  | { type: "heartbeat" }
  | { type: "error"; message: string };

export interface RealtimeThresholds {
  /** A drop shorter than this is a blip: no reconnecting / fallback UI. */
  graceMs: number;
  /** Down this long = disconnected. */
  failAfterMs: number;
  /** This many failed attempts past the grace period = disconnected. */
  failAfterAttempts: number;
}

export const REALTIME_THRESHOLDS: RealtimeThresholds = { graceMs: 10_000, failAfterMs: 30_000, failAfterAttempts: 3 };
/** Same window the server uses for a driver's fix (dispatch_config().gpsFreshSeconds). */
export const GPS_FRESH_MS = 30_000;

export function initialRealtime(): RealtimeSnapshot {
  return {
    transportName: "centrifugo",
    connectionState: "disconnected",
    subscriptionState: "unsubscribed",
    lastConnectedAt: null,
    downSince: null,
    lastMessageAt: null,
    lastHeartbeatAt: null,
    reconnectAttempt: 0,
    lastError: null,
  };
}

export function reduceRealtime(s: RealtimeSnapshot, e: RealtimeEvent, now: number): RealtimeSnapshot {
  switch (e.type) {
    case "connecting":
      return {
        ...s,
        connectionState: "connecting",
        // The first attempt of a fresh client is not a reconnect; every attempt after a loss is.
        reconnectAttempt: s.lastConnectedAt === null && s.reconnectAttempt === 0 && s.downSince === null ? 0 : s.reconnectAttempt + 1,
        downSince: s.downSince ?? now,
        lastError: e.reason ?? s.lastError,
      };
    case "connected":
      return { ...s, connectionState: "connected", lastConnectedAt: now, downSince: null, reconnectAttempt: 0 };
    case "disconnected":
      return {
        ...s,
        connectionState: "disconnected",
        // The SDK resubscribes on its own when it reconnects.
        subscriptionState: s.subscriptionState === "unsubscribed" ? "unsubscribed" : "subscribing",
        downSince: s.downSince ?? now,
        lastError: e.reason ?? s.lastError,
      };
    case "subscribing":
      return { ...s, subscriptionState: "subscribing" };
    case "subscribed":
      return { ...s, subscriptionState: "subscribed" };
    case "unsubscribed":
      return { ...s, subscriptionState: "unsubscribed" };
    case "message":
      return { ...s, lastMessageAt: now };
    case "heartbeat":
      return { ...s, lastHeartbeatAt: now };
    case "error":
      // centrifuge-js emits `connecting` only on entering that state; each failed retry while down arrives as a client
      // `error` (transport / connect / token). Those are the reconnect attempts. An error while connected is diagnostic only.
      return { ...s, lastError: e.message, reconnectAttempt: s.connectionState === "connected" ? s.reconnectAttempt : s.reconnectAttempt + 1 };
  }
}

export function realtimeHealth(s: RealtimeSnapshot, now: number, t: RealtimeThresholds = REALTIME_THRESHOLDS): TransportHealth {
  if (s.connectionState === "connected") return s.subscriptionState === "subscribed" ? "healthy" : "degraded";
  // Idle: nothing is even trying (no session, unmounted).
  if (s.downSince === null) return "disconnected";
  const down = now - s.downSince;
  if (down < t.graceMs) return "degraded";
  if (down >= t.failAfterMs || s.reconnectAttempt >= t.failAfterAttempts) return "disconnected";
  return "reconnecting";
}

export function gpsHealth(lastFixAt: number | null, now: number, freshMs: number = GPS_FRESH_MS): GpsHealth {
  if (lastFixAt === null) return "none";
  return now - lastFixAt < freshMs ? "fresh" : "stale";
}

/** What the patient's tracking badge may claim. "paused" only on a real transport failure. */
export type TrackingBadge = "live" | "connecting" | "awaitingGps" | "paused";
export function trackingBadge(transport: TransportHealth, gps: GpsHealth): TrackingBadge {
  if (transport === "disconnected") return "paused";
  if (transport !== "healthy") return "connecting";
  return gps === "fresh" ? "live" : "awaitingGps";
}

/** Development-only lifecycle log line (no payloads, no patient data). */
export function realtimeLogLine(scope: string, event: string, ids: Record<string, string | number | undefined> = {}): string {
  const tail = Object.entries(ids)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return `[realtime:${scope}] ${event}${tail ? " " + tail : ""}`;
}
