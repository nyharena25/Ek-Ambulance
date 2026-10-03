import { Centrifuge, UnauthorizedError } from "centrifuge";
import { driverOffersChannelName, missionChannelName, realtimeLogLine, type RealtimeEvent } from "@sahayak/domain";
import { routeMissionPublication, routeOfferPublication, type MissionWatchHandlers, type OfferHandlers } from "../lib/driverServer.core.ts";

/**
 * Driver-side realtime (DATA_AND_SYNC_SPECIFICATION.md 6.3): ONE Centrifugo connection per signed-in driver, carrying
 * `driver:{id}:offers`, `mission:{id}` (so a server-side cancellation reaches a driver who is already driving, G-05) and the
 * GPS publishes. Its SDK lifecycle is the app's single connection state (driverConnection.store via onTransportEvent).
 * Same token flow as the patient: a fresh connection token and a fresh per-channel token on every (re)connect, read from
 * the current session token, never cached.
 */

const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL || "http://localhost:8000";
const CENTRIFUGO_WS_URL = process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL || "ws://localhost:8001/connection/websocket";

async function requestToken(scope: string, authToken: string | null): Promise<string> {
  // No session: a permanent refusal (the SDK stops retrying) rather than a retry loop with no credentials.
  if (!authToken) throw new UnauthorizedError("No authenticated session");
  const response = await fetch(`${GATEWAY_URL}/realtime/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ scope }),
  });
  if (response.status === 403) throw new UnauthorizedError("Not authorized for this channel");
  if (!response.ok) throw new Error(`Token request failed: HTTP ${response.status}`);
  return ((await response.json()) as { token: string }).token;
}

declare const __DEV__: boolean | undefined;
/** Development builds only: lifecycle lines with ids, never payloads. */
export function devLog(event: string, ids: Record<string, string | number | undefined> = {}): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.log(realtimeLogLine("driver", event, ids));
}

export interface SubscriptionLike {
  subscribe(): void;
  unsubscribe(): void;
  on(event: "publication", cb: (ctx: { data: unknown }) => void): unknown;
  on(event: "subscribing" | "subscribed" | "unsubscribed", cb: () => void): unknown;
}
export interface SubscriptionClientLike {
  /** The SDK's state ("connected" | "connecting" | "disconnected"); publishes are only attempted while connected. */
  state?: string;
  connect(): void;
  disconnect(): void;
  on?(event: "connecting" | "connected" | "disconnected", cb: (ctx?: { reason?: string }) => void): unknown;
  on?(event: "error", cb: (ctx?: { type?: string; error?: Error }) => void): unknown;
  newSubscription(channel: string, options: { getToken: () => Promise<string> }): SubscriptionLike;
  removeSubscription?(sub: SubscriptionLike): void;
  publish?(channel: string, data: unknown): Promise<unknown>;
}
type CreateClient = (endpoint: string, options: Record<string, unknown>) => SubscriptionClientLike;
const defaultClient: CreateClient = (endpoint, options) => new Centrifuge(endpoint, options) as unknown as SubscriptionClientLike;

export interface DriverRealtimeSession {
  /** Subscribes `channel` on the shared connection. A second subscribe to the same channel replaces the first (the SDK
   *  allows one per channel), so a re-render or a retry can never stack listeners. Returns the unsubscribe. */
  subscribe: (channel: string, onData: (data: unknown) => void, onSubscribed?: () => void) => () => void;
  /** Publishes only while connected; false otherwise (the caller keeps the ping in its acknowledged upload buffer). */
  publish: (channel: string, data: unknown) => boolean;
  teardown: () => void;
}

export interface DriverRealtimeOptions {
  onTransportEvent?: (event: RealtimeEvent) => void;
  /** A publish the server rejected while connected (a proxy refusal, a timeout): diagnostic only, never a fallback trigger. */
  onPublishRejected?: (error: unknown) => void;
  createClient?: CreateClient;
}

export function createDriverRealtimeSession(
  getAuthToken: () => string | null,
  { onTransportEvent, onPublishRejected, createClient = defaultClient }: DriverRealtimeOptions = {}
): DriverRealtimeSession {
  const client = createClient(CENTRIFUGO_WS_URL, {
    minReconnectDelay: 500,
    maxReconnectDelay: 20000,
    getToken: () => requestToken("connect", getAuthToken()),
  });
  const emit = (event: RealtimeEvent) => onTransportEvent?.(event);
  client.on?.("connecting", (ctx) => {
    devLog("RECONNECTING", { reason: ctx?.reason });
    emit({ type: "connecting", reason: ctx?.reason });
  });
  client.on?.("connected", () => {
    devLog("CONNECTED");
    emit({ type: "connected" });
  });
  client.on?.("disconnected", (ctx) => {
    devLog("DISCONNECTED", { reason: ctx?.reason });
    emit({ type: "disconnected", reason: ctx?.reason });
  });

  // A failed (re)connect attempt: counted toward the reconnect threshold, never a fallback trigger on its own.
  client.on?.("error", (ctx) => emit({ type: "error", message: ctx?.error?.message ?? ctx?.type ?? "client error" }));

  // Aggregate subscription state across the channels this session holds: subscribed only when every one of them is.
  const subs = new Map<string, { sub: SubscriptionLike; subscribed: boolean }>();
  const reportSubscriptions = () => {
    const all = [...subs.values()];
    emit({ type: all.length === 0 ? "unsubscribed" : all.every((s) => s.subscribed) ? "subscribed" : "subscribing" });
  };
  const remove = (channel: string, entry: { sub: SubscriptionLike }) => {
    if (subs.get(channel)?.sub !== entry.sub) return; // already replaced or removed
    subs.delete(channel);
    if (client.removeSubscription) client.removeSubscription(entry.sub);
    else entry.sub.unsubscribe();
    devLog("UNSUBSCRIBED", { channel: channel.split(":")[0] });
    reportSubscriptions();
  };

  let torn = false;
  client.connect();
  return {
    subscribe: (channel, onData, onSubscribed) => {
      const previous = subs.get(channel);
      if (previous) remove(channel, previous);
      const sub = client.newSubscription(channel, { getToken: () => requestToken(channel, getAuthToken()) });
      const entry = { sub, subscribed: false };
      subs.set(channel, entry);
      sub.on("publication", (ctx) => {
        emit({ type: "message" });
        onData(ctx.data);
      });
      sub.on("subscribing", () => {
        entry.subscribed = false;
        devLog("SUBSCRIBING", { channel: channel.split(":")[0] });
        reportSubscriptions();
      });
      // A (re)subscribe may have lost a publication: the caller re-reads server state.
      sub.on("subscribed", () => {
        entry.subscribed = true;
        devLog("SUBSCRIBED", { channel: channel.split(":")[0] });
        reportSubscriptions();
        onSubscribed?.();
      });
      sub.on("unsubscribed", () => {
        entry.subscribed = false;
        reportSubscriptions();
      });
      sub.subscribe();
      return () => remove(channel, entry);
    },
    publish: (channel, data) => {
      if (torn || !client.publish || (client.state !== undefined && client.state !== "connected")) return false;
      client.publish(channel, data).catch((error: unknown) => onPublishRejected?.(error));
      return true;
    },
    teardown: () => {
      if (torn) return;
      torn = true;
      for (const [channel, entry] of [...subs]) remove(channel, entry);
      client.disconnect();
    },
  };
}

/** A session to share, or (tests and E2E scripts with several drivers in one process) a token for a private one. */
type SessionOrToken = DriverRealtimeSession | string;
function withSession(source: SessionOrToken, createClient: CreateClient | undefined, use: (s: DriverRealtimeSession) => () => void): () => void {
  if (typeof source !== "string") return use(source);
  const own = createDriverRealtimeSession(() => source, { createClient });
  const stop = use(own);
  return () => {
    stop();
    own.teardown();
  };
}

export function mountOffersChannel(
  driverId: string,
  session: SessionOrToken,
  handlers: OfferHandlers & { onSubscribed?: () => void },
  createClient?: CreateClient
): () => void {
  return withSession(session, createClient, (s) =>
    s.subscribe(driverOffersChannelName(driverId), (data) => routeOfferPublication(data, Date.now(), handlers), () => handlers.onSubscribed?.())
  );
}

export function mountMissionWatch(
  missionId: string,
  session: SessionOrToken,
  handlers: MissionWatchHandlers & { onSubscribed?: () => void },
  createClient?: CreateClient
): () => void {
  return withSession(session, createClient, (s) =>
    s.subscribe(missionChannelName(missionId), (data) => routeMissionPublication(data, handlers), () => handlers.onSubscribed?.())
  );
}
