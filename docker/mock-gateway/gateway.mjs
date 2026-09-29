// Realtime gateway logic (DATA_AND_SYNC_SPECIFICATION.md 6.5, 6.8): token minter + Centrifugo publish proxy.
// Pure of I/O except the injected `fetchImpl`, so gateway.test.mjs can drive every branch without a network.
//
// Two modes, chosen by AUTH_MODE:
//   dev    (default) the historical behaviour: the caller's JWT is only *read* for `sub`, scopes are [\w-]+.
//                    Local development only; any client can obtain any token.
//   strict           the caller's JWT is verified with GoTrue, the scope is authorized (a mission scope must be
//                    readable by the caller under RLS; an offers scope must be the caller's own id), scopes must be
//                    UUIDs, no publish capability is ever issued, and client publishes to mission:* pass through
//                    the publish proxy, which admits only GPS pings from the assigned driver in an active status.
import { createHmac } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = (strict) => (strict ? UUID : /^[\w-]+$/);
export const ACTIVE_STATUSES = ["en_route", "on_scene", "transporting", "arrived_hospital"];

/** `connect`, `mission:{id}`, `driver:{id}:offers`. Strict mode requires UUID ids (mirrors @sahayak/domain parseRealtimeScope). */
export function parseScope(scope, { strict }) {
  if (typeof scope !== "string") return null;
  if (scope === "connect") return { kind: "connect", channel: null };
  const mission = /^mission:(.+)$/.exec(scope);
  if (mission && ID(strict).test(mission[1])) return { kind: "mission", missionId: mission[1], channel: scope };
  const offers = /^driver:(.+):offers$/.exec(scope);
  if (offers && ID(strict).test(offers[1])) return { kind: "offers", driverId: offers[1], channel: scope };
  return null;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function createGateway({
  secret,
  mode = "dev",
  supabaseUrl,
  anonKey,
  serviceKey,
  openRouterApiKey,
  fetchImpl = fetch,
  now = () => Date.now(),
  ttlSeconds = 300,
}) {
  if (!secret) throw new Error("HMAC secret is required");
  const strict = mode === "strict";
  if (strict && (!supabaseUrl || !anonKey || !serviceKey)) {
    throw new Error("strict mode needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");
  }

  const sign = (claims) => {
    const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}`;
    return `${head}.${createHmac("sha256", secret).update(head).digest("base64url")}`;
  };

  // dev only: reads `sub` without verifying the signature.
  const unverifiedSub = (bearer) => {
    try {
      return JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString()).sub;
    } catch {
      return undefined;
    }
  };

  // GoTrue validates any signing scheme (HS256 or asymmetric), unlike a local HMAC check.
  async function verifyUser(bearer) {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`auth upstream ${res.status}`);
    const user = await res.json();
    return typeof user?.id === "string" && UUID.test(user.id) ? user : null;
  }

  // The caller's own JWT is used, so RLS decides: a mission is readable only by its patient or assigned driver.
  async function canReadMission(bearer, missionId) {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/missions?id=eq.${missionId}&select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) throw new Error(`rest upstream ${res.status}`);
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  }

  async function mintToken(authHeader, body) {
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ") || authHeader.length < 8) {
      return { status: 401, body: { error: "missing_bearer" } };
    }
    const scope = parseScope(body?.scope, { strict });
    if (!scope) return { status: 403, body: { error: "forbidden_scope" } };
    const bearer = authHeader.slice(7);

    let sub;
    if (strict) {
      try {
        const user = await verifyUser(bearer);
        if (!user) return { status: 401, body: { error: "invalid_token" } };
        sub = user.id;
        if (scope.kind === "offers" && scope.driverId !== sub) return { status: 403, body: { error: "forbidden_scope" } };
        if (scope.kind === "mission" && !(await canReadMission(bearer, scope.missionId))) {
          return { status: 403, body: { error: "forbidden_scope" } };
        }
      } catch {
        return { status: 502, body: { error: "upstream_unavailable" } };
      }
    } else {
      sub = unverifiedSub(bearer) || "dev-user";
    }

    const exp = Math.floor(now() / 1000) + ttlSeconds;
    // dev only: the historical driver flow asked for role=publisher and used the token as a connection token.
    const legacyPublisher = !strict && body?.role === "publisher" && scope.kind === "mission";
    const token = scope.kind === "connect" || legacyPublisher ? sign({ sub, exp }) : sign({ sub, channel: scope.channel, exp });
    return { status: 200, body: { token, channel: scope.channel, publish: legacyPublisher } };
  }

  const deny = (message) => ({ status: 200, body: { error: { code: 1103, message } } });

  // Centrifugo publish proxy request: { user, channel, data, ... }. Clients may publish GPS only, never lifecycle.
  async function authorizePublish(req) {
    const scope = parseScope(req?.channel, { strict: true });
    if (scope?.kind !== "mission" || typeof req?.user !== "string" || !UUID.test(req.user)) return deny("permission denied");
    const d = req.data;
    const isPing =
      typeof d === "object" && d !== null && typeof d.latitude === "number" && typeof d.longitude === "number" &&
      d.event === undefined && (d.type === undefined || d.type === "telemetry");
    if (!isPing) return deny("lifecycle events are server-published only");
    try {
      const res = await fetchImpl(
        `${supabaseUrl}/rest/v1/missions?id=eq.${scope.missionId}&driver_id=eq.${req.user}&status=in.(${ACTIVE_STATUSES.join(",")})&select=id`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (!res.ok) return deny("temporarily unavailable");
      const rows = await res.json();
      return Array.isArray(rows) && rows.length > 0 ? { status: 200, body: { result: {} } } : deny("not the assigned driver");
    } catch {
      return deny("temporarily unavailable");
    }
  }

  // /triage/extract proxy (Phase B item 8): the OpenRouter key was previously bundled into the patient app
  // binary (EXPO_PUBLIC_OPENROUTER_API_KEY), extractable by anyone who downloads the APK. It now lives only
  // here. Verifies the caller's JWT via GoTrue in EVERY mode, including `dev` - unlike mintToken, a paid-key
  // relay must never be open just because the realtime gateway is still in its permissive local-dev mode.
  // The request/response bodies are OpenRouter's own shape, forwarded verbatim; only the model/messages
  // content are the caller's, never the key.
  async function extractTriage(authHeader, body) {
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ") || authHeader.length < 8) {
      return { status: 401, body: { error: "missing_bearer" } };
    }
    if (!supabaseUrl || !anonKey) return { status: 503, body: { error: "triage_gateway_unconfigured" } };
    if (!openRouterApiKey) return { status: 503, body: { error: "triage_unavailable" } };
    let user;
    try {
      user = await verifyUser(authHeader.slice(7));
    } catch {
      return { status: 502, body: { error: "upstream_unavailable" } };
    }
    if (!user) return { status: 401, body: { error: "invalid_token" } };
    try {
      const res = await fetchImpl(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${openRouterApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const upstreamBody = await res.json().catch(() => ({}));
      return { status: res.status, body: upstreamBody };
    } catch {
      return { status: 502, body: { error: "upstream_unavailable" } };
    }
  }

  return { mode, mintToken, authorizePublish, extractTriage };
}
