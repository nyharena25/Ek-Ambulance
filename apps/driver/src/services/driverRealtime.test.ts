import assert from "node:assert";
import { createDriverRealtimeSession, mountOffersChannel, type SubscriptionClientLike, type SubscriptionLike } from "./driverRealtime.ts";

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

console.log("ALL DRIVER REALTIME TESTS PASSED (100% GREEN)");
