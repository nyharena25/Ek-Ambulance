// Authenticated realtime probe against the hosted gateway: driver session -> POST /realtime/token (same shape as
// apps/driver/src/services/driverRealtime.ts) -> Centrifugo WSS connect -> subscribe driver:{id}:offers.
// Non-destructive by construction: anon key only (no service key, so it cannot delete or create rows), never creates a
// user (shouldCreateUser: false), never creates a mission/offer, never publishes, never touches driver presence.
// Event delivery is NOT verified here: it needs a dispatch, i.e. a separate controlled E2E.
//
//   HOSTED_TEST_OTP_NUMBER=1 SUPABASE_URL=… SUPABASE_ANON_KEY=… TEST_PHONE_DRIVER=… TEST_OTP_DRIVER=… \
//     node scripts/realtime-auth-probe.mjs
// HOSTED_TEST_OTP_NUMBER=1 asserts the phone is a Supabase test-OTP number on the hosted project, so no SMS is sent.
import assert from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/driver/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const { Centrifuge } = require("centrifuge");

const GATEWAY = process.env.GATEWAY_URL ?? "https://150-230-139-158.sslip.io";
const WS = process.env.CENTRIFUGO_WS_URL ?? "wss://150-230-139-158.sslip.io/connection/websocket";
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_PHONE_DRIVER, TEST_OTP_DRIVER } = process.env;
assert.ok(SUPABASE_URL && SUPABASE_ANON_KEY && TEST_PHONE_DRIVER && TEST_OTP_DRIVER, "SUPABASE_URL, SUPABASE_ANON_KEY, TEST_PHONE_DRIVER, TEST_OTP_DRIVER required");
assert.strictEqual(process.env.HOSTED_TEST_OTP_NUMBER, "1", "set HOSTED_TEST_OTP_NUMBER=1 only if the phone is a hosted test-OTP number (no SMS)");

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const token = async (scope, bearer) => {
  const r = await fetch(`${GATEWAY}/realtime/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ scope }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, token: body.token };
};
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

let client;
try {
  const sent = await db.auth.signInWithOtp({ phone: TEST_PHONE_DRIVER, options: { shouldCreateUser: false } });
  assert.ifError(sent.error);
  const v = await db.auth.verifyOtp({ phone: TEST_PHONE_DRIVER, token: TEST_OTP_DRIVER, type: "sms" });
  assert.ifError(v.error);
  const { access_token: jwt, user } = v.data.session;
  console.log(`✓ session for existing user ${user.id.slice(0, 8)}… role=${user.app_metadata?.role ?? "?"}`);

  const channel = `driver:${user.id}:offers`;
  const conn = await token("connect", jwt);
  assert.strictEqual(conn.status, 200, `A connect token HTTP ${conn.status}`);
  assert.strictEqual(claims(conn.token).sub, user.id, "A connect token sub");
  const sub = await token(channel, jwt);
  assert.strictEqual(sub.status, 200, `A channel token HTTP ${sub.status}`);
  assert.strictEqual(claims(sub.token).channel, channel, "A channel token channel");
  console.log("✓ A POST /realtime/token -> 200 (connect + own offers channel)");
  const other = await token("driver:00000000-0000-0000-0000-000000000000:offers", jwt);
  assert.ok([401, 403].includes(other.status), `A another driver's channel HTTP ${other.status}`);
  console.log(`✓ A another driver's channel -> ${other.status}`);

  client = new Centrifuge(WS, { getToken: async () => (await token("connect", jwt)).token });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("B subscribe timeout (15 s)")), 15_000);
    client.on("error", (ctx) => reject(new Error(`B client error ${ctx?.error?.message ?? ""}`)));
    client.on("connected", () => console.log("✓ B WSS connected (authenticated)"));
    const s = client.newSubscription(channel, { getToken: async () => (await token(channel, jwt)).token });
    s.on("error", (ctx) => reject(new Error(`B subscription error ${ctx?.error?.message ?? ""}`)));
    s.on("subscribed", () => { clearTimeout(t); resolve(); });
    s.subscribe();
    client.connect();
  });
  console.log(`✓ B subscribed to ${channel.replace(user.id, user.id.slice(0, 8) + "…")}`);
  console.log("NOT VERIFIED: event delivery (needs a dispatch; separate controlled E2E)");
} finally {
  client?.disconnect();
  await db.auth.signOut().catch(() => {}); // only ends this probe's session; nothing is deleted
}
