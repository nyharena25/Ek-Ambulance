// HTTP wrapper around gateway.mjs. AUTH_MODE=dev (default) keeps the historical permissive token minter for local
// development; AUTH_MODE=strict verifies the caller's JWT, authorizes scopes and serves the Centrifugo publish proxy.
// See gateway.mjs and DATA_AND_SYNC_SPECIFICATION.md 6.5 / 6.8.
import { createServer } from "node:http";
import { createGateway } from "./gateway.mjs";

const gateway = createGateway({
  secret: process.env.HMAC_SECRET,
  mode: process.env.AUTH_MODE === "strict" ? "strict" : "dev",
  supabaseUrl: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

function readJson(req, res, then) {
  let raw = "";
  req.on("data", (c) => {
    raw += c;
    if (raw.length > 65536) req.destroy();
  });
  req.on("end", () => {
    try {
      then(JSON.parse(raw));
    } catch {
      send(res, 400, { error: "invalid_json" });
    }
  });
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true, mode: gateway.mode });

  if (req.method === "POST" && req.url === "/realtime/token") {
    const auth = req.headers.authorization;
    return readJson(req, res, async (body) => {
      const out = await gateway.mintToken(auth, body);
      send(res, out.status, out.body);
    });
  }

  // Centrifugo calls this before it accepts a client publish (proxy_publish); only reachable on the docker network.
  if (req.method === "POST" && req.url === "/centrifugo/publish" && gateway.mode === "strict") {
    return readJson(req, res, async (body) => {
      const out = await gateway.authorizePublish(body);
      send(res, out.status, out.body);
    });
  }

  send(res, 404, { error: "not_found" });
}).listen(8080, () => console.log(`token-mint (${gateway.mode}) listening on :8080`));
