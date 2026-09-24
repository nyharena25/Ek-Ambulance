import { Centrifuge, UnauthorizedError } from "centrifuge";
import { driverOffersChannelName, missionChannelName } from "@sahayak/domain";
import { routeMissionPublication, routeOfferPublication, type MissionWatchHandlers, type OfferHandlers } from "../lib/driverServer.core";

/**
 * Driver-side subscriptions (DATA_AND_SYNC_SPECIFICATION.md 6.3): `driver:{id}:offers` for dispatch offers and
 * `mission:{id}` so a server-side cancellation reaches a driver who is already driving (G-05). Same token flow as the patient:
 * a fresh connection token and a fresh per-channel token on every (re)connect, never cached.
 */

const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL || "http://localhost:8000";
const CENTRIFUGO_WS_URL = process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL || "ws://localhost:8001/connection/websocket";

async function requestToken(scope: string, authToken: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/realtime/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ scope }),
  });
  if (response.status === 403) throw new UnauthorizedError("Not authorized for this channel");
  if (!response.ok) throw new Error(`Token request failed: HTTP ${response.status}`);
  return ((await response.json()) as { token: string }).token;
}

export interface SubscriptionClientLike {
  connect(): void;
  disconnect(): void;
  newSubscription(channel: string, options: { getToken: () => Promise<string> }): {
    subscribe(): void;
    unsubscribe(): void;
    on(event: "publication", cb: (ctx: { data: unknown }) => void): unknown;
    on(event: "subscribed", cb: () => void): unknown;
    on(event: "unsubscribed", cb: () => void): unknown;
  };
}

type CreateClient = (endpoint: string, options: Record<string, unknown>) => SubscriptionClientLike;

function mount(
  channel: string,
  authToken: string,
  onData: (data: unknown) => void,
  onSubscribed: () => void,
  createClient: CreateClient
): () => void {
  const client = createClient(CENTRIFUGO_WS_URL, {
    minReconnectDelay: 500,
    maxReconnectDelay: 20000,
    getToken: () => requestToken("connect", authToken),
  });
  const sub = client.newSubscription(channel, { getToken: () => requestToken(channel, authToken) });
  sub.on("publication", (ctx) => onData(ctx.data));
  // A (re)subscribe may have lost a publication: the caller re-reads server state.
  sub.on("subscribed", onSubscribed);
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

const defaultClient: CreateClient = (endpoint, options) => new Centrifuge(endpoint, options) as unknown as SubscriptionClientLike;

export function mountOffersChannel(
  driverId: string,
  authToken: string,
  handlers: OfferHandlers & { onSubscribed?: () => void },
  createClient: CreateClient = defaultClient
): () => void {
  return mount(driverOffersChannelName(driverId), authToken, (data) => routeOfferPublication(data, Date.now(), handlers), () => handlers.onSubscribed?.(), createClient);
}

export function mountMissionWatch(
  missionId: string,
  authToken: string,
  handlers: MissionWatchHandlers & { onSubscribed?: () => void },
  createClient: CreateClient = defaultClient
): () => void {
  return mount(missionChannelName(missionId), authToken, (data) => routeMissionPublication(data, handlers), () => handlers.onSubscribed?.(), createClient);
}
