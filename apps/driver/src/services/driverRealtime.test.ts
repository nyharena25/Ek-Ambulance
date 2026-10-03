import assert from "node:assert";
import { AUTH_REQUIRED_REASON, createDriverRealtimeSession, mountMissionWatch, mountOffersChannel, type SubscriptionClientLike, type SubscriptionLike } from "./driverRealtime.ts";

console.log("=================================================");
console.log("Running Driver Realtime Session Tests (one connection, honest state)");
console.log("=================================================\n");

/** Fake Centrifuge client: records calls, lets the test fire SDK lifecycle callbacks, never opens a socket. */
function fakeClient() {
  const calls = { connect: 0, disconnect: 0, publish: [] as Array<[string, unknown]>, newSubscription: [] as string[], removed: [] as string[] };
  const clientHandlers: Record<string, (ctx?: unknown) => void> = {};
  const subs: Record<string, { handlers: Record<string, (ctx?: unknown) => void>; sub: SubscriptionLike }> = {};
  let options: Record<string, unknown> = {};
  const client: SubscriptionClientLike = {
    state: "disconnected",
    connect: () => void (calls.connect += 1),
    disconnect: () => void (calls.disconnect += 1),
    on: ((e: string, cb: (ctx?: unknown) => void) => ((clientHandlers[e] = cb), client)) as SubscriptionClientLike["on"],
    newSubscription: (channel) => {
      if (subs[channel]) throw new Error("Subscription to the channel " + channel + " already exists"); // the real SDK's rule
      calls.newSubscription.push(channel);
      const handlers: Record<string, (ctx?: unknown) => void> = {};
      const sub = { subscribe: () => {}, unsubscribe: () => {}, on: (e: string, cb: (ctx?: unknown) => void) => ((handlers[e] = cb), sub) } as unknown as SubscriptionLike;
      subs[channel] = { handlers, sub };
      return sub;
    },
    removeSubscription: (sub) => {
      const channel = Object.keys(subs).find((c) => subs[c]!.sub === sub)!;
      calls.removed.push(channel);
      delete subs[channel];
    },
    publish: (channel, data) => {
      calls.publish.push([channel, data]);
      return Promise.resolve({});
    },
  };
  const create = (_endpoint: string, o: Record<string, unknown>) => ((options = o), client);
  return { client, calls, clientHandlers, subs, create, options: () => options };
}

console.log("Test 1: one connection carries every channel; lifecycle events reach the connection state in order...");
{
  const f = fakeClient();
  const events: string[] = [];
  const s = createDriverRealtimeSession(() => "t", { createClient: f.create, onTransportEvent: (e) => events.push(e.type) });
  const offData: unknown[] = [];
  s.subscribe("driver:D1:offers", (d) => offData.push(d));
  s.subscribe("mission:M1", () => {});
  assert.strictEqual(f.calls.connect, 1, "exactly one client connection for offers + mission watch + GPS");
  assert.deepStrictEqual(f.calls.newSubscription, ["driver:D1:offers", "mission:M1"]);
  f.clientHandlers.connecting!({ reason: "connect called" });
  f.client.state = "connected";
  f.clientHandlers.connected!();
  f.subs["driver:D1:offers"]!.handlers.subscribed!();
  assert.strictEqual(events.at(-1), "subscribing", "not every channel is subscribed yet");
  f.subs["mission:M1"]!.handlers.subscribed!();
  assert.strictEqual(events.at(-1), "subscribed", "subscribed once every channel is");
  f.subs["driver:D1:offers"]!.handlers.publication!({ data: { type: "offer" } });
  assert.deepStrictEqual(offData, [{ type: "offer" }]);
  assert.deepStrictEqual(events.slice(0, 2), ["connecting", "connected"]);
  assert.ok(events.includes("message"), "a publication is recorded as activity");
  s.teardown();
}
console.log("✓ shared connection + lifecycle\n");

console.log("Test 2: GPS is published only while connected; a disconnected socket never produces a rejected publish...");
{
  const f = fakeClient();
  const rejected: unknown[] = [];
  const s = createDriverRealtimeSession(() => "t", { createClient: f.create, onPublishRejected: (e) => rejected.push(e) });
  assert.strictEqual(s.publish("mission:M1", { latitude: 1, longitude: 2 }), false, "connecting: not sent, caller keeps it buffered");
  assert.strictEqual(f.calls.publish.length, 0, "no publish attempt while not connected (this used to reject and force fallback)");
  f.client.state = "connected";
  assert.strictEqual(s.publish("mission:M1", { latitude: 1, longitude: 2 }), true);
  assert.deepStrictEqual(f.calls.publish, [["mission:M1", { latitude: 1, longitude: 2 }]]);
  assert.strictEqual(rejected.length, 0);
  s.teardown();
  assert.strictEqual(s.publish("mission:M1", { latitude: 1, longitude: 2 }), false, "after teardown: a silent no-op");
}
console.log("✓ connected-only publish\n");

console.log("Test 3: re-subscribing a channel replaces it (no duplicate listeners); cleanup is exact and idempotent...");
{
  const f = fakeClient();
  const s = createDriverRealtimeSession(() => "t", { createClient: f.create });
  const first = s.subscribe("mission:M1", () => {});
  const second = s.subscribe("mission:M1", () => {}); // a re-render / remount for the same mission
  assert.deepStrictEqual(f.calls.removed, ["mission:M1"], "the earlier subscription was removed, not stacked (the SDK would throw)");
  first(); // the stale owner's cleanup must not remove the new subscription
  assert.deepStrictEqual(f.calls.removed, ["mission:M1"]);
  second();
  second();
  assert.deepStrictEqual(f.calls.removed, ["mission:M1", "mission:M1"], "removed once by its own owner");
  s.subscribe("driver:D1:offers", () => {});
  s.teardown();
  s.teardown();
  assert.strictEqual(f.calls.disconnect, 1, "teardown disconnects exactly once");
  assert.deepStrictEqual(Object.keys(f.subs), [], "no subscription survives teardown");
}
console.log("✓ subscription cleanup\n");

console.log("Test 4: tokens are read on every (re)connect; no session refuses permanently...");
{
  const f = fakeClient();
  let token: string | null = "token-1";
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: { headers: Record<string, string> }) => {
    seen.push(init.headers.Authorization ?? "");
    return { ok: true, status: 200, json: async () => ({ token: "c" }) };
  }) as unknown as typeof fetch;
  try {
    const s = createDriverRealtimeSession(() => token, { createClient: f.create });
    const getToken = f.options().getToken as () => Promise<string>;
    await getToken();
    token = "token-2";
    await getToken();
    assert.deepStrictEqual(seen, ["Bearer token-1", "Bearer token-2"], "a refreshed session token is used without a new client");
    token = null;
    await assert.rejects(getToken(), /No authenticated session/);
    s.teardown();
  } finally {
    globalThis.fetch = realFetch;
  }
}
console.log("✓ token refresh\n");

console.log("Test 5: the legacy mount API (E2E scripts, one private connection per driver) still cleans up fully...");
{
  const f = fakeClient();
  const stop = mountOffersChannel("D9", "token", { onOffer: () => {}, onRevoked: () => {} }, f.create);
  assert.deepStrictEqual(f.calls.newSubscription, ["driver:D9:offers"]);
  stop();
  assert.strictEqual(f.calls.disconnect, 1);
}
console.log("✓ legacy mount\n");

console.log("Test 6: reconnect recovers on the same client: no new subscription, refused channels resubscribed...");
{
  const f = fakeClient();
  const subscribeCalls: string[] = [];
  const s = createDriverRealtimeSession(() => "t", { createClient: f.create });
  s.subscribe("driver:D1:offers", () => {});
  s.subscribe("mission:M1", () => {});
  for (const [channel, entry] of Object.entries(f.subs)) (entry.sub as { subscribe: () => void }).subscribe = () => void subscribeCalls.push(channel);
  f.client.state = "connected";
  f.subs["driver:D1:offers"]!.handlers.subscribed!();
  f.subs["mission:M1"]!.handlers.unsubscribed!(); // the server refused mission:M1

  s.reconnect(false); // app resume on a connected socket
  assert.strictEqual(f.calls.disconnect, 0, "resume never cycles a connected socket");
  assert.strictEqual(f.calls.connect, 1);

  s.reconnect(true); // the driver's Reconnect button
  assert.strictEqual(f.calls.disconnect, 1, "forced: one disconnect/connect cycle");
  assert.strictEqual(f.calls.connect, 2);
  assert.deepStrictEqual(subscribeCalls, ["mission:M1"], "only the channel that is not subscribed is asked to subscribe again");
  assert.deepStrictEqual(f.calls.newSubscription, ["driver:D1:offers", "mission:M1"], "no duplicate subscription is created");

  f.client.state = "disconnected"; // the SDK gave up (e.g. credentials refused)
  s.reconnect(false);
  assert.strictEqual(f.calls.disconnect, 1, "nothing to disconnect");
  assert.strictEqual(f.calls.connect, 3, "resume restarts a socket the SDK gave up on");

  f.client.state = "connecting"; // waiting out a backoff
  s.reconnect(false);
  assert.strictEqual(f.calls.disconnect, 2);
  assert.strictEqual(f.calls.connect, 4, "resume skips the pending backoff");

  s.teardown();
  s.reconnect(true);
  assert.strictEqual(f.calls.connect, 4, "a torn-down session never reconnects");
}
console.log("✓ reconnect\n");

console.log("Test 7: a refused-credentials disconnect is reported as auth, and a torn session is silent...");
{
  const f = fakeClient();
  const events: Array<{ type: string; reason?: string }> = [];
  const s = createDriverRealtimeSession(() => "t", { createClient: f.create, onTransportEvent: (e) => events.push(e as never) });
  f.clientHandlers.disconnected!({ code: 1, reason: "unauthorized" });
  f.clientHandlers.disconnected!({ code: 3500, reason: "invalid token" });
  f.clientHandlers.disconnected!({ code: 0, reason: "disconnect called" });
  assert.deepStrictEqual(
    events.map((e) => e.reason),
    [AUTH_REQUIRED_REASON, AUTH_REQUIRED_REASON, "disconnect called"],
    "client unauthorized and Centrifugo invalid token are auth; a local disconnect is not"
  );
  s.teardown();
  const before = events.length;
  f.clientHandlers.connecting!({ reason: "late" });
  f.clientHandlers.error!({ type: "transport" });
  assert.strictEqual(events.length, before, "a torn-down session never writes into the live connection state");
}
console.log("✓ auth + torn silence\n");

console.log("Test 8: the token getter may be async (session refreshed first); a 401 stays retryable...");
{
  const f = fakeClient();
  const realFetch = globalThis.fetch;
  let status = 200;
  const seen: string[] = [];
  globalThis.fetch = (async (_u: string, init: { headers: Record<string, string> }) => {
    seen.push(init.headers.Authorization ?? "");
    return { ok: status === 200, status, json: async () => ({ token: "c" }) };
  }) as unknown as typeof fetch;
  try {
    const s = createDriverRealtimeSession(async () => "refreshed", { createClient: f.create });
    const getToken = f.options().getToken as () => Promise<string>;
    assert.strictEqual(await getToken(), "c");
    assert.deepStrictEqual(seen, ["Bearer refreshed"]);
    status = 401; // expired JWT at the gateway
    await assert.rejects(getToken(), (e: Error) => e.name !== "UnauthorizedError" && /HTTP 401/.test(e.message), "retryable, not a permanent stop");
    status = 403; // a scope the server refuses
    await assert.rejects(getToken(), (e: Error) => e.name === "UnauthorizedError");
    s.teardown();
  } finally {
    globalThis.fetch = realFetch;
  }
}
console.log("✓ async token\n");

console.log("Test 9: mission events are idempotent: a redelivered seq is dropped, a gap still applies...");
{
  const f = fakeClient();
  const s = createDriverRealtimeSession(() => "t", { createClient: f.create });
  const cancelled: Array<number | undefined> = [];
  mountMissionWatch("M1", s, { onCancelled: (info) => cancelled.push(info.seq) });
  const deliver = (seq?: number) =>
    f.subs["mission:M1"]!.handlers.publication!({ data: { event: "MISSION_CANCELLED", missionId: "M1", ...(seq ? { seq } : {}), data: {} } });
  deliver(4);
  deliver(4); // duplicate delivery after a resubscribe
  deliver(3); // older
  deliver(6); // gap: applied (the onSubscribed re-read covers what was missed)
  deliver(); // a pre-seq publisher: applied
  assert.deepStrictEqual(cancelled, [4, 6, undefined]);
  s.teardown();
}
console.log("✓ seq dedup\n");

console.log("ALL DRIVER REALTIME TESTS PASSED (100% GREEN)");
