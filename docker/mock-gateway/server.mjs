// DEV ONLY. Mints Centrifugo HS256 tokens for POST /realtime/token; does NOT verify the caller's
// Supabase JWT (it only reads `sub` from it). Replace with the real backend before any shared deploy.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const SECRET = process.env.HMAC_SECRET;
if (!SECRET) throw new Error("HMAC_SECRET is required");
const TTL_SECONDS = 300;
const SCOPE = /^(mission:[\w-]+|driver:[\w-]+:offers)$/;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(claims) {
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}`;
  return `${head}.${createHmac("sha256", SECRET).update(head).digest("base64url")}`;
}
function subjectOf(authHeader) {
  try {
    return JSON.parse(Buffer.from(authHeader.replace(/^Bearer /, "").split(".")[1], "base64url").toString()).sub;
  } catch {
    return undefined;
  }
}
const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== "/realtime/token") return send(res, 404, { error: "not_found" });
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || auth.length < 8) return send(res, 401, { error: "missing_bearer" });

  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "invalid_json" });
    }
    if (typeof body?.scope !== "string" || !SCOPE.test(body.scope)) return send(res, 403, { error: "forbidden_scope" });
    const publish = body.role === "publisher";
    // Driver publishers use this as a CONNECTION token (sub only; Centrifugo rejects a channel claim there).
    // Patients connect anonymously and use it as a SUBSCRIPTION token (channel claim, no sub).
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const token = publish
      ? sign({ sub: subjectOf(auth) || "dev-user", exp })
      : sign({ channel: body.scope, exp });
    send(res, 200, { token, channel: body.scope, publish });
  });
}).listen(8080, () => console.log("token-mint listening on :8080"));
