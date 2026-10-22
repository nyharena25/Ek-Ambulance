// Static security checks over every git-tracked file (no network, no database).
// Run: node scripts/security-static.test.mjs
//   1. No server secret is committed: service-role JWTs, sb_secret_ keys, OpenRouter / Anthropic keys, private keys.
//   2. No server-only secret is exposed to a client bundle: EXPO_PUBLIC_* / VITE_* names never carry one, and the
//      only JWTs in client config (eas.json) are anon keys.
//   3. Every SECURITY DEFINER function in every migration pins search_path.
//   4. The WebView map loads Leaflet only with Subresource Integrity.
//   5. The patient app cannot choose the LLM model or prompt (the gateway builds the request).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
  .split("\0").filter(Boolean)
  .filter((f) => f !== "pnpm-lock.yaml" && !/\.(png|jpe?g|gif|webp|ico|ttf|otf)$/i.test(f));
const read = (f) => {
  try {
    return readFileSync(join(ROOT, f), "utf8");
  } catch {
    return ""; // listed by git but deleted in the working tree
  }
};
const hits = [];

const jwtRole = (jwt) => {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).role;
  } catch {
    return undefined;
  }
};

// 1: committed secrets.
const SECRET_PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{16,}/, "Supabase secret key"],
  [/sk-or-v1-[a-f0-9]{16,}/, "OpenRouter API key"],
  [/sk-ant-[A-Za-z0-9_-]{16,}/, "Anthropic API key"],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
];
for (const f of tracked) {
  const text = read(f);
  for (const [re, why] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${f}: ${why}`);
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g) ?? []) {
    const role = jwtRole(jwt);
    if (role !== undefined && role !== "anon") hits.push(`${f}: committed JWT with role ${role}`);
  }
}

// 2: client-exposed variable names never name a server secret; builds bake in the anon key only.
const CLIENT_SECRET_NAME = /\b(EXPO_PUBLIC|VITE)_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PRIVATE|HMAC|OPENROUTER_API_KEY)[A-Z0-9_]*/;
for (const f of tracked.filter((p) => p.startsWith("apps/"))) {
  const m = CLIENT_SECRET_NAME.exec(read(f));
  if (m) hits.push(`${f}: client-exposed secret variable ${m[0]}`);
}
for (const f of ["apps/patient/eas.json", "apps/driver/eas.json"]) {
  for (const jwt of read(f).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    if (jwtRole(jwt) !== "anon") hits.push(`${f}: a non-anon key is baked into a build`);
  }
}

// 3: SECURITY DEFINER functions pin search_path (in the header, before the body).
for (const f of tracked.filter((p) => /^supabase\/migrations\/.*\.sql$/.test(p))) {
  const sql = read(f).replace(/--[^\n]*/g, "");
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([\s\S]*?)\bas\s+\$\$/gi)) {
    const header = m[2];
    if (/security\s+definer/i.test(header) && !/set\s+search_path\s*=\s*''/i.test(header)) {
      hits.push(`${f}: ${m[1]} is SECURITY DEFINER without set search_path = ''`);
    }
  }
}

// 4: Leaflet only with integrity.
for (const f of tracked.filter((p) => p.endsWith("OsmWebMap.tsx"))) {
  for (const tag of read(f).match(/<(script|link)[^>]*unpkg\.com[^>]*>/g) ?? []) {
    if (!/integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/.test(tag) || !/crossorigin=/.test(tag)) {
      hits.push(`${f}: CDN asset without SRI: ${tag.slice(0, 80)}`);
    }
  }
}

// 5: the patient app sends only text to /triage/extract.
const triage = read("apps/patient/src/services/openRouterTriage.ts");
if (/EXPO_PUBLIC_OPENROUTER|messages\s*:|\bmodel\s*:|max_tokens/.test(triage)) {
  hits.push("apps/patient/src/services/openRouterTriage.ts: the client builds the LLM request");
}
if (/EXPO_PUBLIC_OPENROUTER/.test(read("apps/patient/.env.example"))) hits.push("apps/patient/.env.example: client-side OpenRouter setting");

assert.ok(tracked.length > 200, `scanned only ${tracked.length} files: wrong root?`);
assert.deepEqual(hits, [], "security static checks failed:\n" + hits.join("\n"));
console.log(`SECURITY STATIC CHECKS PASSED (${tracked.length} files scanned)`);
