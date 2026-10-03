import assert from "node:assert";
import {
  mountMissionChannel,
  missionChannelName,
  type ClientLike,
  type SubscriptionLike,
  type MissionChannelCallbacks,
} from "./missionChannel.service.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Mission Channel Service Tests");
console.log("=================================================\n");

function noop() {}
const silentCallbacks: MissionChannelCallbacks = {
  onStatusChange: noop,
  onSubscriptionStateChange: noop,
  onTelemetry: noop,
  onLifecycleEvent: noop,
  onError: noop,
};

/** Fake client/subscription pair that never opens a real socket - lets the
 *  mount/teardown contract be verified without network access. */
function createFakeClient() {
  const calls = { connect: 0, disconnect: 0, subscribe: 0, unsubscribe: 0 };
  const sub: SubscriptionLike = {
    subscribe: () => {
      calls.subscribe += 1;
    },
    unsubscribe: () => {
      calls.unsubscribe += 1;
    },
    on: () => sub,
  };
  const client: ClientLike = {
    connect: () => {
      calls.connect += 1;
    },
    disconnect: () => {
      calls.disconnect += 1;
    },
    on: () => client,
    newSubscription: () => sub,
  };
  return { client, calls };
}

// Test 1: channel naming convention
console.log("Test 1: Validating mission:{missionId} channel naming...");
assert.strictEqual(missionChannelName("MSN-DL-2026-8921"), "mission:MSN-DL-2026-8921");
console.log("✓ Channel name matches the mission:{missionId} convention.\n");

// Test 2: mount connects and subscribes exactly once
console.log("Test 2: Validating mount connects the client and subscribes exactly once...");
const mounted = createFakeClient();
const teardown = mountMissionChannel(
  "MSN-TEST-0001",
  "fake-supabase-token",
  silentCallbacks,
  () => mounted.client
);
assert.strictEqual(mounted.calls.connect, 1, "connect() called exactly once on mount");
assert.strictEqual(mounted.calls.subscribe, 1, "subscribe() called exactly once on mount");
assert.strictEqual(mounted.calls.disconnect, 0, "disconnect() not called before teardown");
assert.strictEqual(mounted.calls.unsubscribe, 0, "unsubscribe() not called before teardown");
console.log("✓ Mount connects and subscribes exactly once, nothing torn down yet.\n");

// Test 3: teardown unsubscribes then disconnects, exactly once - this is
// the socket/memory-leak-on-unmount requirement from the verification list.
console.log("Test 3: Validating teardown unsubscribes then disconnects, exactly once...");
teardown();
assert.strictEqual(mounted.calls.unsubscribe, 1, "unsubscribe() called exactly once on teardown");
assert.strictEqual(mounted.calls.disconnect, 1, "disconnect() called exactly once on teardown");
console.log("✓ Teardown unsubscribed then disconnected exactly once.\n");

// Test 4: teardown is idempotent - a screen unmount racing a missionId
// change must never double-disconnect the same mount.
console.log("Test 4: Validating teardown is idempotent (safe to call twice)...");
teardown();
teardown();
assert.strictEqual(mounted.calls.unsubscribe, 1, "A second teardown() call does not unsubscribe again");
assert.strictEqual(mounted.calls.disconnect, 1, "A second teardown() call does not disconnect again");
console.log("✓ Calling teardown() again is a safe no-op.\n");

// Test 5: each mount gets its own independent client/subscription pair -
// switching missionId (unmount old, mount new) never cross-contaminates.
console.log("Test 5: Validating independent mounts don't share teardown state...");
const first = createFakeClient();
const second = createFakeClient();
const teardownFirst = mountMissionChannel("MSN-A", "token", silentCallbacks, () => first.client);
const teardownSecond = mountMissionChannel("MSN-B", "token", silentCallbacks, () => second.client);
teardownFirst();
assert.strictEqual(first.calls.disconnect, 1, "First mount's teardown disconnects only itself");
assert.strictEqual(second.calls.disconnect, 0, "Second mount is untouched by the first mount's teardown");
teardownSecond();
assert.strictEqual(second.calls.disconnect, 1, "Second mount's own teardown disconnects it");
console.log("✓ Independent mounts have independent, non-interfering teardown.\n");

console.log("=================================================");
console.log("Test 6: first subscribe reconciles; a recovered resubscribe does not...");
{
  const handlers: Record<string, (ctx?: unknown) => void> = {};
  const sub: SubscriptionLike = { subscribe: noop, unsubscribe: noop, on: (e: string, cb: (ctx?: unknown) => void) => ((handlers[e] = cb), sub) } as SubscriptionLike;
  const client: ClientLike = { connect: noop, disconnect: noop, on: () => client, newSubscription: () => sub };
  const seen: boolean[] = [];
  mountMissionChannel("MSN-TEST-0003", "t", { ...silentCallbacks, onResubscribed: (i) => seen.push(i.recovered) }, () => client);
  handlers.subscribed!({ wasRecovering: false });
  assert.deepStrictEqual(seen, [false], "first subscribe: an event before it would otherwise be lost");
  handlers.subscribed!({ wasRecovering: true, recovered: true });
  assert.deepStrictEqual(seen, [false], "fully recovered: nothing missed");
  handlers.subscribed!({ wasRecovering: true, recovered: false });
  assert.deepStrictEqual(seen, [false, false], "recovery failed: reconcile");
}
console.log("✓ Subscribe reconcile.\n");

console.log("Test 7: SDK lifecycle feeds the one connection state; token refresh needs no remount; no session refuses...");
{
  const clientHandlers: Record<string, (ctx?: unknown) => void> = {};
  const subHandlers: Record<string, (ctx?: unknown) => void> = {};
  let clientOptions: Record<string, unknown> = {};
  let subOptions: { getToken: () => Promise<string> } | null = null;
  const sub = { subscribe: noop, unsubscribe: noop, on: (e: string, cb: (ctx?: unknown) => void) => ((subHandlers[e] = cb), sub) } as unknown as SubscriptionLike;
  const client = {
    connect: noop,
    disconnect: noop,
    on: (e: string, cb: (ctx?: unknown) => void) => ((clientHandlers[e] = cb), client),
    newSubscription: (_c: string, o: { getToken: () => Promise<string> }) => ((subOptions = o), sub),
  } as unknown as ClientLike;
  const events: string[] = [];
  let token: string | null = "token-1";
  const seenTokens: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { headers: Record<string, string> }) => {
    seenTokens.push(init.headers.Authorization ?? "");
    return { ok: true, status: 200, json: async () => ({ token: "centrifugo-token", channel: "x" }) };
  }) as unknown as typeof fetch;
  try {
    const teardown = mountMissionChannel(
      "MSN-TEST-0004",
      () => token,
      { ...silentCallbacks, onTransportEvent: (e) => events.push(e.type) },
      (_endpoint, options) => ((clientOptions = options), client)
    );
    clientHandlers.connecting!({ reason: "connect called" });
    clientHandlers.connected!();
    subHandlers.subscribing!();
    subHandlers.subscribed!({ wasRecovering: false });
    subHandlers.publication!({ data: { event: "DRIVER_ACCEPTED", seq: 2, data: {} } });
    clientHandlers.disconnected!({ reason: "transport closed" });
    subHandlers.unsubscribed!();
    assert.deepStrictEqual(events, ["connecting", "connected", "subscribing", "subscribed", "message", "disconnected", "unsubscribed"],
      "every SDK callback reaches the connection state, in order");

    await (clientOptions.getToken as () => Promise<string>)();
    token = "token-2"; // the session refreshed while connected
    await (clientOptions.getToken as () => Promise<string>)();
    await subOptions!.getToken();
    assert.deepStrictEqual(seenTokens, ["Bearer token-1", "Bearer token-2", "Bearer token-2"], "each (re)connect reads the current session token");

    token = null; // signed out
    await assert.rejects((clientOptions.getToken as () => Promise<string>)(), /No authenticated session/, "no session: a permanent refusal, not a retry loop");
    teardown();
  } finally {
    globalThis.fetch = realFetch;
  }
}
console.log("✓ lifecycle + token refresh.\n");

console.log("ALL MISSION CHANNEL SERVICE TESTS PASSED (100% GREEN)");
console.log("=================================================");
