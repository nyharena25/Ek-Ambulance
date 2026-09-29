// Static checks over the gateway and realtime deployment configs (G3.2, G4.3.1). No network, and no config value is ever
// printed: every assertion carries its own message. The behaviour through a running Kong is covered by
// apps/admin/src/kycAdmin.e2e.ts with GATEWAY_URL set.
import assert from "node:assert";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const strip = (s) => s.replace(/#.*$/gm, "");
const hosted = strip(read("./kong.yml"));
const local = strip(read("./kong.local.yml"));
const routeNames = (s) => [...s.matchAll(/^\s{6}- name: ([\w-]+)$/gm)].map((m) => m[1]).sort();
const service = (s, name) => s.match(new RegExp(`- name: ${name}\\n([\\s\\S]*?)(?=\\n  - name: |\\nplugins:)`))?.[1] ?? assert.fail(`missing service ${name}`);
const HOSTED = "https://nzwbwuhbtqhhjwnopwmm.supabase.co";
const LOCAL = "http://host.docker.internal:54321";
const SUPABASE = { "supabase-auth": "/auth/v1", "supabase-rest": "/rest/v1", "supabase-storage": "/storage/v1/object" };

console.log("Test: each gateway targets only its own Supabase...");
assert.doesNotMatch(local, /supabase\.co/i, "kong.local.yml has no hosted upstream");
assert.doesNotMatch(hosted, /host\.docker\.internal|localhost|127\.0\.0\.1|:54321/, "kong.yml has no local upstream");
for (const [svc, path] of Object.entries(SUPABASE)) {
  assert.match(service(local, svc), new RegExp(`url: ${LOCAL}${path}\\n`), `${svc} goes to the local stack`);
  assert.match(service(hosted, svc), new RegExp(`url: ${HOSTED.replace(/\./g, "\\.")}${path}\\n`), `${svc} goes to the hosted project`);
}
console.log("✓ upstreams\n");

console.log("Test: hosted and local gateways expose the same routes...");
assert.deepStrictEqual(routeNames(hosted), routeNames(local), "route parity");
for (const r of ["auth", "rest", "storage-object", "realtime-token", "triage-extract"]) assert.ok(routeNames(hosted).includes(r), `route ${r}`);
// Everything but the Supabase upstream hosts is identical, so a fix to one file cannot silently miss the other.
const body = (s) => s.split("\n").map((l) => l.trimEnd()).filter(Boolean).join("\n");
assert.strictEqual(body(hosted.replaceAll(HOSTED, "@")), body(local.replaceAll(LOCAL, "@")), "configs differ only in the Supabase upstream host");
console.log("✓ route parity\n");

console.log("Test: the Storage route is object-only and passes the caller's credentials through...");
for (const cfg of [hosted, local]) {
  const storage = service(cfg, "supabase-storage");
  assert.match(storage, /paths: \["\/storage\/v1\/object"\]/, "only /storage/v1/object (no /bucket, /s3, /upload/resumable)");
  assert.match(storage, /strip_path: true/);
  assert.match(storage, /methods: \["GET", "POST", "OPTIONS"\]/, "no PUT/PATCH/DELETE");
  assert.match(storage, /name: rate-limiting/, "storage is rate limited");
  assert.doesNotMatch(cfg, /request-transformer|pre-function|post-function|key-auth|jwt:/i, "no plugin rewrites or injects credentials");
  assert.doesNotMatch(cfg, /eyJ[\w-]+\.[\w-]+|sb_secret_|service_role/i, "no key or token in a gateway config");
  // Exactly the browser headers supabase-js was observed sending (admin console through Kong); no wildcard.
  assert.match(cfg, /headers: \[Authorization, Content-Type, apikey, x-client-info, content-profile, x-supabase-api-version\]/, "CORS allows only observed headers");
  assert.doesNotMatch(cfg, /headers: \[[^\]]*\*/, "no wildcard header");
}
console.log("✓ storage route and CORS\n");

console.log("Test: compose selects the config the Centrifugo way, defaulting to the hosted file...");
const compose = read("../docker-compose.yml");
assert.match(compose, /- \.\/docker\/\$\{KONG_CONFIG:-kong\.yml\}:\/kong\/kong\.yml:ro/);
assert.match(compose, /host\.docker\.internal:host-gateway/);
console.log("✓ compose\n");

console.log("Test: the production override cannot start permissive (B1)...");
const prod = strip(read("../docker-compose.prod.yml"));
const required = (name) => new RegExp(`\\$\\{${name}:\\?[^}]*\\}`);
for (const name of ["CENTRIFUGO_HMAC_SECRET", "CENTRIFUGO_API_KEY", "CENTRIFUGO_ALLOWED_ORIGINS", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  assert.match(prod, required(name), `${name} is required (no default)`);
}
assert.doesNotMatch(prod, /\$\{[A-Z_]+:-/, "no variable in the override has a default");
assert.doesNotMatch(prod, /dev-only|dev-api-key|dev-admin|change-me/i, "no development credential");
assert.match(prod, /AUTH_MODE: strict\n/, "token-mint is strict, not an env default");
assert.doesNotMatch(prod, /AUTH_MODE: *\$|AUTH_MODE: *dev/, "AUTH_MODE is not overridable to dev");
assert.match(prod, /HMAC_SECRET: \$\{CENTRIFUGO_HMAC_SECRET:\?/, "token-mint signs with the same required secret");
assert.match(prod, /- \.\/docker\/centrifugo\.secure\.json:\/centrifugo\/config\.json:ro/, "Centrifugo runs the secure config");
assert.doesNotMatch(prod, /CENTRIFUGO_CONFIG/, "the config file is fixed, not an env choice");
assert.match(prod, /- \.\/docker\/kong\.yml:\/kong\/kong\.yml:ro/, "Kong runs the hosted config");
console.log("✓ production compose override\n");

console.log("Test: the secure Centrifugo config has no development behaviour...");
const secure = JSON.parse(read("./centrifugo.secure.json"));
assert.strictEqual(secure.allow_anonymous_connect_without_token, false, "anonymous connect disabled");
assert.strictEqual(secure.admin, false, "admin UI disabled");
for (const k of ["token_hmac_secret_key", "api_key", "admin_password", "admin_secret", "allowed_origins", "api_insecure", "allow_publish_for_client", "allow_subscribe_for_client", "allow_subscribe_for_anonymous"]) {
  assert.ok(!(k in secure), `${k} is not set in the file (secrets come from the environment; no permissive flag)`);
}
const ns = Object.fromEntries(secure.namespaces.map((n) => [n.name, n]));
assert.deepStrictEqual(Object.keys(ns).sort(), ["driver", "mission"]);
for (const n of secure.namespaces) {
  for (const k of Object.keys(n)) assert.ok(!/^allow_|anonymous|insecure/.test(k), `${n.name}: no ${k}`);
}
// The one client publish path: driver GPS on mission:{id}, admitted by token-mint's publish proxy (assigned driver only).
assert.strictEqual(ns.mission.proxy_publish, true, "mission publishes go through the proxy");
assert.ok(!ns.driver.proxy_publish, "nothing publishes to driver channels from a client");
assert.match(secure.proxy_publish_endpoint, /^http:\/\/token-mint:8080\/centrifugo\/publish$/, "proxy is token-mint on the private network");
console.log("✓ secure Centrifugo config\n");

console.log("KONG CONFIG TESTS PASSED");
