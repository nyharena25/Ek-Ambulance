import assert from "node:assert";
import { createHmac } from "node:crypto";
import { createGateway, parseScope } from "./gateway.mjs";
import { parseRealtimeScope } from "../../packages/domain/src/index.ts";

console.log("=================================================");
console.log("Running Realtime Gateway Tests (token minter + publish proxy)");
console.log("=================================================\n");

const SECRET = "test-secret";
const P = "00000000-0000-4000-8000-0000000000a1"; // patient
const D = "00000000-0000-4000-8000-0000000000b1"; // assigned driver
const X = "00000000-0000-4000-8000-0000000000b2"; // another driver
const M = "6f0c1e9a-0000-4000-8000-000000000001";
const NOW = Date.parse("2026-09-24T09:00:00Z");

const decode = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
const verifySig = (token) => {
  const [h, p, s] = token.split(".");
  return createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") === s;
};
const fakeJwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;

/** Fake Supabase: /auth/v1/user resolves a bearer to a user id, /rest/v1/missions applies "RLS" by participant. */
function fakeSupabase({ users = {}, missions = {}, authStatus = 200, restStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const bearer = (init?.headers?.Authorization ?? "").replace("Bearer ", "");
    if (url.includes("/auth/v1/user")) {
      if (authStatus !== 200) return { ok: false, status: authStatus, json: async () => ({}) };
      const id = users[bearer];
      return id ? { ok: true, status: 200, json: async () => ({ id }) } : { ok: false, status: 401, json: async () => ({}) };
    }
    if (restStatus !== 200) return { ok: false, status: restStatus, json: async () => [] };
    const id = /id=eq\.([\w-]+)/.exec(url)?.[1];
    const m = missions[id];
    if (init.headers.apikey === "service-key") {
      // publish proxy lookup: driver + active status filters are in the query string
      const driver = /driver_id=eq\.([\w-]+)/.exec(url)?.[1];
      const statuses = /status=in\.\(([^)]*)\)/.exec(url)?.[1].split(",") ?? [];
      return { ok: true, status: 200, json: async () => (m && m.driver === driver && statuses.includes(m.status) ? [{ id }] : []) };
    }
    const user = users[bearer];
    return { ok: true, status: 200, json: async () => (m && (m.patient === user || m.driver === user) ? [{ id }] : []) };
  };
  return { fetchImpl, calls };
}

const strictGateway = (opts) =>
  createGateway({ secret: SECRET, mode: "strict", supabaseUrl: "http://sb", anonKey: "anon-key", serviceKey: "service-key", now: () => NOW, ...opts });

// ---------------------------------------------------------------------------
console.log("Test 1: dev mode keeps the historical permissive contract (local loop must survive)...");
{
  const g = createGateway({ secret: SECRET, mode: "dev", now: () => NOW });
  assert.strictEqual((await g.mintToken(undefined, { scope: "connect" })).status, 401, "no bearer");
  assert.strictEqual((await g.mintToken("Bearer ", { scope: "connect" })).status, 401, "empty bearer");
  assert.strictEqual((await g.mintToken("Bearer abc", { scope: "nope" })).status, 403, "bad scope");
  assert.strictEqual((await g.mintToken("Bearer abc", {})).status, 403);
  const conn = await g.mintToken(`Bearer ${fakeJwt(P)}`, { scope: "connect" });
  assert.strictEqual(conn.status, 200);
  assert.deepStrictEqual(decode(conn.body.token), { sub: P, exp: NOW / 1000 + 300 }, "connection token: sub + exp, no channel");
  assert.ok(verifySig(conn.body.token));
  const legacy = await g.mintToken("Bearer demo_auth_token", { scope: "mission:MSN-123456", role: "publisher" });
  assert.strictEqual(legacy.status, 200, "non-UUID mock mission ids still work in dev");
  assert.strictEqual(decode(legacy.body.token).sub, "dev-user", "unparseable bearer falls back to dev-user");
  assert.strictEqual(decode(legacy.body.token).channel, undefined, "legacy publisher token stays a connection token");
  assert.strictEqual(legacy.body.publish, true);
  const sub = await g.mintToken(`Bearer ${fakeJwt(P)}`, { scope: `mission:${M}` });
  assert.deepStrictEqual(decode(sub.body.token), { sub: P, channel: `mission:${M}`, exp: NOW / 1000 + 300 }, "subscription token carries sub + channel");
  assert.strictEqual(sub.body.publish, false);
  assert.strictEqual((await g.mintToken("Bearer a", { scope: `driver:${D}:offers` })).status, 200);
  assert.strictEqual((await g.mintToken("Bearer a", { scope: `driver:${D}` })).status, 403, "a bare driver:{id} is not a channel");
}
console.log("✓ dev mode\n");

// ---------------------------------------------------------------------------
console.log("Test 2: strict mode verifies the caller and never trusts the JWT payload...");
{
  const sb = fakeSupabase({ users: { "good-token": P }, missions: { [M]: { patient: P, driver: D, status: "en_route" } } });
  const g = strictGateway({ fetchImpl: sb.fetchImpl });
  assert.strictEqual((await g.mintToken(undefined, { scope: "connect" })).status, 401);
  // A forged JWT whose payload claims to be the patient must fail: only GoTrue's answer counts.
  const forged = await g.mintToken(`Bearer ${fakeJwt(P)}`, { scope: "connect" });
  assert.strictEqual(forged.status, 401, "unverified JWT rejected");
  assert.strictEqual(forged.body.error, "invalid_token");
  const ok = await g.mintToken("Bearer good-token", { scope: "connect" });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(decode(ok.body.token).sub, P, "sub comes from GoTrue, not from the request");
  assert.ok(sb.calls.some((c) => c.url === "http://sb/auth/v1/user" && c.headers.apikey === "anon-key"), "GoTrue called with the anon key");
}
console.log("✓ verification\n");

// ---------------------------------------------------------------------------
console.log("Test 3: strict scopes are authorized: missions by RLS, offers by identity, UUIDs only...");
{
  const sb = fakeSupabase({
    users: { "patient-token": P, "driver-token": D, "other-token": X },
    missions: { [M]: { patient: P, driver: D, status: "en_route" } },
  });
  const g = strictGateway({ fetchImpl: sb.fetchImpl });
  for (const [who, expected] of [["patient-token", 200], ["driver-token", 200], ["other-token", 403]]) {
    const r = await g.mintToken(`Bearer ${who}`, { scope: `mission:${M}` });
    assert.strictEqual(r.status, expected, `${who} on mission:${M}`);
  }
  const t = decode((await g.mintToken("Bearer patient-token", { scope: `mission:${M}` })).body.token);
  assert.deepStrictEqual(t, { sub: P, channel: `mission:${M}`, exp: NOW / 1000 + 300 }, "per-channel subscription token with sub");
  assert.ok(!("publish" in t) && !("role" in t), "no publish capability is ever signed into a token");
  const asked = sb.calls.filter((c) => c.url.includes("/rest/v1/missions"));
  assert.ok(asked.every((c) => c.headers.Authorization.startsWith("Bearer ") && c.headers.apikey === "anon-key"), "membership is read with the CALLER's JWT so RLS decides");
  assert.strictEqual((await g.mintToken("Bearer driver-token", { scope: `driver:${D}:offers` })).status, 200, "own offers channel");
  assert.strictEqual((await g.mintToken("Bearer driver-token", { scope: `driver:${X}:offers` })).status, 403, "another driver's offers channel");
  assert.strictEqual((await g.mintToken("Bearer patient-token", { scope: `driver:${D}:offers` })).status, 403);
  const publisherAsk = await g.mintToken("Bearer driver-token", { scope: `mission:${M}`, role: "publisher" });
  assert.strictEqual(decode(publisherAsk.body.token).channel, `mission:${M}`, "role=publisher is ignored: still a subscription token");
  assert.strictEqual(publisherAsk.body.publish, false);
  for (const bad of ["mission:MSN-DL-2026-8921", "mission:dev-user", "driver:abc:offers", `driver:${D}`, "mission:", "connect ", "*", 5]) {
    assert.strictEqual((await g.mintToken("Bearer patient-token", { scope: bad })).status, 403, `rejected scope ${String(bad)}`);
  }
}
console.log("✓ scope authorization\n");

// ---------------------------------------------------------------------------
console.log("Test 4: strict mode fails closed when Supabase is unreachable...");
{
  const down = fakeSupabase({ users: { t: P }, authStatus: 503 });
  assert.strictEqual((await strictGateway({ fetchImpl: down.fetchImpl }).mintToken("Bearer t", { scope: "connect" })).status, 502);
  const restDown = fakeSupabase({ users: { t: P }, restStatus: 500 });
  assert.strictEqual((await strictGateway({ fetchImpl: restDown.fetchImpl }).mintToken("Bearer t", { scope: `mission:${M}` })).status, 502);
  const boom = strictGateway({ fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.strictEqual((await boom.mintToken("Bearer t", { scope: "connect" })).status, 502, "network error => 502, never a token");
  assert.throws(() => createGateway({ secret: SECRET, mode: "strict" }), /SUPABASE_URL/, "strict mode refuses to start half-configured");
  assert.throws(() => createGateway({ mode: "dev" }), /secret/);
}
console.log("✓ fail closed\n");

// ---------------------------------------------------------------------------
console.log("Test 5: publish proxy admits GPS from the assigned driver only (G-04)...");
{
  const sb = fakeSupabase({
    missions: {
      [M]: { patient: P, driver: D, status: "transporting" },
      "11111111-0000-4000-8000-000000000002": { patient: P, driver: D, status: "completed" },
    },
  });
  const g = strictGateway({ fetchImpl: sb.fetchImpl });
  const ping = { latitude: 28.5672, longitude: 77.21, heading: 68, speed: 42.5, timestamp: "2026-09-24T08:31:07.412Z" };
  const allow = { status: 200, body: { result: {} } };
  assert.deepStrictEqual(await g.authorizePublish({ user: D, channel: `mission:${M}`, data: ping }), allow, "assigned driver GPS ping");
  assert.deepStrictEqual(await g.authorizePublish({ user: D, channel: `mission:${M}`, data: { v: 1, type: "telemetry", ...ping, deadZone: true } }), allow, "v1 ping");
  const denied = (r) => r.status === 200 && r.body.error?.code === 1103;
  assert.ok(denied(await g.authorizePublish({ user: X, channel: `mission:${M}`, data: ping })), "another driver cannot publish");
  assert.ok(denied(await g.authorizePublish({ user: P, channel: `mission:${M}`, data: ping })), "the patient cannot publish");
  assert.ok(denied(await g.authorizePublish({ user: D, channel: "mission:11111111-0000-4000-8000-000000000002", data: ping })), "no publish after completion");
  for (const forged of [
    { event: "DRIVER_ACCEPTED", missionId: M, driverId: D, timestamp: "t" },
    { event: "MISSION_COMPLETED", ...ping },
    { v: 1, type: "lifecycle", event: "MISSION_COMPLETED", seq: 9, missionId: M },
    { latitude: 1, longitude: 2, type: "lifecycle" },
    "DRIVER_ACCEPTED", null, { latitude: "1", longitude: 2 },
  ]) {
    assert.ok(denied(await g.authorizePublish({ user: D, channel: `mission:${M}`, data: forged })), `forged payload refused: ${JSON.stringify(forged)}`);
  }
  assert.ok(denied(await g.authorizePublish({ user: D, channel: `driver:${D}:offers`, data: ping })), "clients never publish offers");
  assert.ok(denied(await g.authorizePublish({ user: D, channel: "mission:MSN-1", data: ping })), "non-UUID channel");
  assert.ok(denied(await g.authorizePublish({ user: "dev-user", channel: `mission:${M}`, data: ping })), "non-UUID user");
  assert.ok(denied(await g.authorizePublish(undefined)));
  const svc = sb.calls.filter((c) => c.headers.apikey === "service-key");
  assert.ok(svc.length > 0 && svc.every((c) => c.headers.Authorization === "Bearer service-key"), "assignment lookup uses the service key, held only by the gateway");
  const down = strictGateway({ fetchImpl: async () => { throw new Error("down"); } });
  assert.ok(denied(await down.authorizePublish({ user: D, channel: `mission:${M}`, data: ping })), "upstream failure denies");
}
console.log("✓ publish proxy\n");

// ---------------------------------------------------------------------------
console.log("Test 6: scope parser parity with @sahayak/domain (one contract, two implementations)...");
for (const s of ["connect", `mission:${M}`, `driver:${D}:offers`, "mission:MSN-1", `driver:${D}`, "driver:x:offers", "mission:", "", `mission:${M}:x`, "CONNECT"]) {
  const a = parseScope(s, { strict: true });
  const b = parseRealtimeScope(s);
  assert.strictEqual(a?.kind ?? null, b?.kind ?? null, `kind parity for ${JSON.stringify(s)}`);
  if (a?.kind === "mission") assert.strictEqual(a.missionId, b.missionId);
  if (a?.kind === "offers") assert.strictEqual(a.driverId, b.driverId);
}
console.log("✓ parity\n");

console.log("REALTIME GATEWAY TESTS PASSED (100% GREEN)");
