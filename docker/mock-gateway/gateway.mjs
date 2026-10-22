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
const ACTIVE_STATUSES = ["en_route", "on_scene", "transporting", "arrived_hospital"];

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

/** A subscription token outlives the access it was minted for (a released driver, a closed mission) by at most this long:
 *  Centrifugo refreshes it through getToken, which re-checks RLS. Connection and offers tokens keep `ttlSeconds`. */
export const MISSION_TOKEN_TTL_SECONDS = 60;

const PING_KEYS = new Set(["v", "type", "latitude", "longitude", "heading", "speed", "accuracy", "timestamp", "deadZone"]);
const finite = (n) => typeof n === "number" && Number.isFinite(n);

/** The only thing a client may publish: one GPS ping, known keys, values in range. An optional field that is null is
 *  treated as absent (as it always was): a missing heading must never stop live tracking. */
export function isTelemetryPing(d) {
  if (typeof d !== "object" || d === null || Array.isArray(d)) return false;
  if (Object.keys(d).some((k) => !PING_KEYS.has(k))) return false;
  if (d.v !== undefined && d.v !== 1) return false;
  if (d.type !== undefined && d.type !== "telemetry") return false;
  if (!finite(d.latitude) || Math.abs(d.latitude) > 90 || !finite(d.longitude) || Math.abs(d.longitude) > 180) return false;
  if (d.heading != null && !(finite(d.heading) && d.heading >= 0 && d.heading <= 360)) return false;
  if (d.speed != null && !(finite(d.speed) && d.speed >= 0 && d.speed <= 400)) return false;
  if (d.accuracy != null && !(finite(d.accuracy) && d.accuracy >= 0)) return false;
  if (d.timestamp != null && !(typeof d.timestamp === "string" && d.timestamp.length <= 40 && !Number.isNaN(Date.parse(d.timestamp)))) return false;
  if (d.deadZone != null && typeof d.deadZone !== "boolean") return false;
  return true;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TRIAGE_DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";
const TRIAGE_MAX_INPUT_CHARS = 1000;
/** Per user: a real caller describes one emergency, maybe re-phrased a few times. */
const TRIAGE_QUOTA = { max: 10, windowMs: 10 * 60_000 };

// The request is built here, never by the client: the client only sends the patient's text.
const TRIAGE_SYSTEM_PROMPT = `You are a clinical intake assistant for an emergency ambulance service in India.
A caller describes a patient's condition in English, Hindi, or Hinglish. Extract structured indicators only; do not give medical advice.
- primaryComplaint: one of severe_trauma, chest_pain, breathing_distress, unconscious, minor_injury.
- respiratoryDistress: true if breathing is laboured, gasping, very fast, or absent.
- severeHemorrhage: true if there is heavy or uncontrolled bleeding.
- alteredMentalStatus: true if the patient is unresponsive, unconscious, confused, or fitting.
- recommendedTier: CAT_1_IMMEDIATE (life-threatening), CAT_2_URGENT, or CAT_3_DELAYED (minor).
When unsure, choose the more severe option. Respond with JSON only.`;
const TRIAGE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    primaryComplaint: { type: "string", enum: ["severe_trauma", "chest_pain", "breathing_distress", "unconscious", "minor_injury"] },
    respiratoryDistress: { type: "boolean" },
    severeHemorrhage: { type: "boolean" },
    alteredMentalStatus: { type: "boolean" },
    recommendedTier: { type: "string", enum: ["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"] },
  },
  required: ["primaryComplaint", "respiratoryDistress", "severeHemorrhage", "alteredMentalStatus", "recommendedTier"],
  additionalProperties: false,
};

export function createGateway({
  secret,
  mode = "dev",
  supabaseUrl,
  anonKey,
  serviceKey,
  openRouterApiKey,
  openRouterModel = TRIAGE_DEFAULT_MODEL,
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

    const exp = Math.floor(now() / 1000) + (scope.kind === "mission" ? Math.min(ttlSeconds, MISSION_TOKEN_TTL_SECONDS) : ttlSeconds);
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
    if (!isTelemetryPing(req.data)) return deny("only a valid GPS ping may be published; lifecycle events are server-published");
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

  // The caller's latest third_party_llm decision, read with their own JWT (RLS: own rows only). DPDP: free text describing
  // a patient's condition goes to a third party only after an explicit, recorded, unwithdrawn grant.
  async function hasLlmConsent(bearer) {
    const res = await fetchImpl(
      `${supabaseUrl}/rest/v1/consent_records?purpose=eq.third_party_llm&select=granted,withdrawn_at&order=granted_at.desc&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } }
    );
    if (!res.ok) throw new Error(`rest upstream ${res.status}`);
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.granted === true && rows[0]?.withdrawn_at == null;
  }

  const triageCalls = new Map(); // user id -> recent call times (ms)
  // ponytail: in-process quota; one gateway process today. Move to Redis (already deployed) if it ever scales out.
  function overQuota(userId) {
    const t = now();
    const recent = (triageCalls.get(userId) ?? []).filter((at) => t - at < TRIAGE_QUOTA.windowMs);
    const over = recent.length >= TRIAGE_QUOTA.max;
    if (!over) recent.push(t);
    triageCalls.set(userId, recent);
    return over;
  }

  // /triage/extract: the OpenRouter key lives only here. The caller sends { text } and nothing else: the model, prompt,
  // schema and token limit are fixed server-side, so the relay cannot be used as a general-purpose LLM proxy. Verifies the
  // caller via GoTrue in EVERY mode (including `dev`), allows patients only, requires their recorded third_party_llm
  // consent, applies a per-user quota, and returns only the model's message content.
  async function extractTriage(authHeader, body) {
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ") || authHeader.length < 8) {
      return { status: 401, body: { error: "missing_bearer" } };
    }
    if (!supabaseUrl || !anonKey) return { status: 503, body: { error: "triage_gateway_unconfigured" } };
    if (!openRouterApiKey) return { status: 503, body: { error: "triage_unavailable" } };
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length > TRIAGE_MAX_INPUT_CHARS || Object.keys(body).some((k) => k !== "text")) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    const bearer = authHeader.slice(7);
    let user;
    try {
      user = await verifyUser(bearer);
      if (!user) return { status: 401, body: { error: "invalid_token" } };
      const role = user.app_metadata?.role;
      if (role !== undefined && role !== "patient") return { status: 403, body: { error: "patients_only" } };
      if (!(await hasLlmConsent(bearer))) return { status: 403, body: { error: "consent_required" } };
    } catch {
      return { status: 502, body: { error: "upstream_unavailable" } };
    }
    if (overQuota(user.id)) return { status: 429, body: { error: "rate_limited" } };
    try {
      const res = await fetchImpl(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${openRouterApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: openRouterModel,
          temperature: 0,
          max_tokens: 200,
          messages: [
            { role: "system", content: TRIAGE_SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          response_format: { type: "json_schema", json_schema: { name: "triage_extraction", strict: true, schema: TRIAGE_RESPONSE_SCHEMA } },
        }),
      });
      if (!res.ok) return { status: res.status === 429 ? 429 : 502, body: { error: "upstream_error" } };
      const upstream = await res.json().catch(() => ({}));
      const content = upstream?.choices?.[0]?.message?.content;
      return { status: 200, body: { choices: [{ message: { content: typeof content === "string" ? content : null } }] } };
    } catch {
      return { status: 502, body: { error: "upstream_unavailable" } };
    }
  }

  return { mode, mintToken, authorizePublish, extractTriage };
}
