// Static checks over the Kong declarative configs (G3.2). No network. The behaviour through a running Kong is covered
// by apps/admin/src/kycAdmin.e2e.ts with GATEWAY_URL set.
import assert from "node:assert";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const strip = (s) => s.replace(/#.*$/gm, "");
const hosted = strip(read("./kong.yml"));
const local = strip(read("./kong.local.yml"));
const routeNames = (s) => [...s.matchAll(/^\s{6}- name: ([\w-]+)$/gm)].map((m) => m[1]).sort();
const service = (s, name) => s.match(new RegExp(`- name: ${name}\\n([\\s\\S]*?)(?=\\n  - name: |\\nplugins:)`))?.[1] ?? assert.fail(`missing service ${name}`);

console.log("Test: the local gateway never targets the hosted project...");
assert.doesNotMatch(local, /supabase\.co/i, "kong.local.yml has no hosted upstream");
for (const svc of ["supabase-auth", "supabase-rest", "supabase-storage"]) {
  assert.match(service(local, svc), /url: http:\/\/host\.docker\.internal:54321\//, `${svc} goes to the local stack`);
}
console.log("✓ local upstreams only\n");

console.log("Test: the local config is the hosted config plus the Storage route...");
const extra = routeNames(local).filter((r) => !routeNames(hosted).includes(r));
assert.deepStrictEqual(extra, ["storage-object"]);
assert.deepStrictEqual(routeNames(hosted).filter((r) => !routeNames(local).includes(r)), [], "no hosted route is missing locally");
console.log("✓ route parity\n");

console.log("Test: the Storage route is object-only and passes the caller's credentials through...");
const storage = service(local, "supabase-storage");
assert.match(storage, /url: http:\/\/host\.docker\.internal:54321\/storage\/v1\/object\n/);
assert.match(storage, /paths: \["\/storage\/v1\/object"\]/, "only /storage/v1/object (no /bucket, /s3, /upload/resumable)");
assert.match(storage, /strip_path: true/);
assert.match(storage, /methods: \["GET", "POST", "OPTIONS"\]/, "no PUT/PATCH/DELETE");
for (const cfg of [hosted, local]) {
  assert.doesNotMatch(cfg, /request-transformer|pre-function|post-function|key-auth|jwt:/i, "no plugin rewrites or injects credentials");
  assert.doesNotMatch(cfg, /eyJ[\w-]+\.[\w-]+|sb_secret_|service_role/i, "no key or token in a gateway config");
}
// Exactly the browser headers supabase-js was observed sending (admin console through Kong); no wildcard.
assert.match(local, /headers: \[Authorization, Content-Type, apikey, x-client-info, content-profile, x-supabase-api-version\]/, "CORS allows only observed headers");
assert.doesNotMatch(local, /headers: \[[^\]]*\*/, "no wildcard header");
console.log("✓ storage route\n");

console.log("Test: compose selects the config the Centrifugo way, defaulting to the hosted file...");
const compose = read("../docker-compose.yml");
assert.match(compose, /- \.\/docker\/\$\{KONG_CONFIG:-kong\.yml\}:\/kong\/kong\.yml:ro/);
assert.match(compose, /host\.docker\.internal:host-gateway/);
console.log("✓ compose\n");

console.log("KONG CONFIG TESTS PASSED");
