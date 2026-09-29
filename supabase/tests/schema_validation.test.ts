import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Static checks over the migration SQL (no database needed). Behavioural RLS checks need a real
// Postgres; see HANDOVER section 20 for how they were run.
const sql = readFileSync(
  fileURLToPath(new URL("../migrations/20260924000000_core_ems_schema.sql", import.meta.url)),
  "utf8"
);
const code = sql.replace(/--.*$/gm, "");

const TABLES = ["profiles", "drivers", "hospitals", "missions"] as const;
const policies = [...code.matchAll(/create policy (\w+) on public\.(\w+)([\s\S]*?);/gi)].map((m) => ({
  name: m[1]!,
  table: m[2]!,
  body: m[3]!,
}));

console.log("Test 1: extensions and enums...");
assert.match(code, /create extension if not exists postgis/i);
assert.match(code, /create extension if not exists "?pgcrypto"?/i);
assert.match(code, /create extension if not exists "pg_net" with schema extensions/i, "pg_net declared");
const enumValues = (name: string) =>
  [...(code.match(new RegExp(`create type public\\.${name} as enum \\(([^)]*)\\)`, "i"))?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.deepStrictEqual(enumValues("ais125_vehicle_type"), ["TYPE_A_MFR", "TYPE_B_PTA", "TYPE_C_BLS", "TYPE_D_ALS"]);
assert.deepStrictEqual(enumValues("urgency_tier"), ["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"]);
assert.deepStrictEqual(enumValues("jurisdiction_zone"), ["DL", "UP"]);
assert.ok(enumValues("mission_status").includes("matched"), "mission_status must include 'matched'");
console.log("✓ extensions + enums\n");

console.log("Test 2: table integrity...");
const tableBody = (t: string) => code.match(new RegExp(`create table public\\.${t} \\(([\\s\\S]*?)\\n\\);`, "i"))?.[1] ?? "";
const columns: Record<string, string[]> = {
  profiles: ["id", "phone", "role", "full_name", "dpdp_consent_at", "created_at"],
  drivers: ["id", "license_number", "emt_cert_id", "ais125_type", "is_verified", "is_online", "current_location"],
  hospitals: ["id", "name", "zone", "location", "trauma_level", "total_capacity", "held_capacity", "is_active"],
  missions: [
    "id", "patient_id", "driver_id", "destination_hospital_id", "status", "urgency", "vehicle_type",
    "pickup_location", "fare_details", "created_at", "updated_at",
  ],
};
for (const t of TABLES) {
  for (const col of columns[t]!) assert.match(tableBody(t), new RegExp(`^\\s*${col}\\s`, "m"), `${t}.${col} missing`);
}
assert.match(tableBody("profiles"), /id\s+uuid primary key references auth\.users/i);
assert.match(tableBody("drivers"), /id\s+uuid primary key references auth\.users/i);
assert.match(tableBody("profiles"), /role\s+text not null check \(role in \('patient', 'driver'\)\)/i);
for (const [t, col] of [["drivers", "current_location"], ["hospitals", "location"], ["missions", "pickup_location"]] as const) {
  assert.match(tableBody(t), new RegExp(`${col}\\s+(?:extensions\\.)?geography\\(Point, 4326\\)`, "i"), `${t}.${col} must be geography(Point, 4326)`);
}
assert.match(tableBody("drivers"), /check \(not is_online or is_verified\)/i, "an unverified driver must not be able to go online");
assert.match(tableBody("hospitals"), /held_capacity <= total_capacity/i);
console.log("✓ columns, FKs, constraints\n");

console.log("Test 3: RLS coverage...");
for (const t of TABLES) {
  assert.match(code, new RegExp(`alter table public\\.${t}\\s+enable row level security`, "i"), `${t}: RLS not enabled`);
  assert.ok(policies.some((p) => p.table === t), `${t}: RLS enabled but no policy`);
}
const expectedPolicies = [
  "profiles_select_own", "profiles_update_own", "drivers_select_own", "drivers_update_own",
  "hospitals_select_active", "missions_select_patient", "missions_select_driver",
];
assert.deepStrictEqual(policies.map((p) => p.name).sort(), expectedPolicies.sort());
console.log("✓ every table has RLS + policies\n");

console.log("Test 4: every policy is authenticated-only, scoped, and uses the (select auth.uid()) pattern...");
for (const p of policies) {
  assert.match(p.body, /\bto authenticated\b/i, `${p.name}: must target authenticated only`);
  assert.doesNotMatch(p.body, /\bfor all\b/i, `${p.name}: no FOR ALL`);
  assert.doesNotMatch(p.body, /using\s*\(\s*true\s*\)/i, `${p.name}: no permissive using(true)`);
  assert.doesNotMatch(p.body, /user_metadata/i, `${p.name}: user_metadata is client-editable`);
  const bare = [...p.body.matchAll(/auth\.uid\(\)/g)].filter((m) => !/\(\s*select\s+$/i.test(p.body.slice(0, m.index)));
  assert.strictEqual(bare.length, 0, `${p.name}: bare auth.uid() (wrap as (select auth.uid()))`);
}
assert.doesNotMatch(code.replace(/create policy[\s\S]*?;/gi, ""), /\bto anon\b|grant [^;]* to anon/i, "no anon grants");
const upd = policies.filter((p) => /for update/i.test(p.body));
for (const p of upd) assert.match(p.body, /with check/i, `${p.name}: UPDATE policy needs WITH CHECK`);
assert.match(policies.find((p) => p.name === "missions_select_driver")!.body, /status = 'matched'/);
console.log("✓ policy shape\n");

console.log("Test 5: column-level privilege escalation guards...");
assert.match(code, /grant update \(full_name, dpdp_consent_at\) on public\.profiles to authenticated/i);
assert.match(code, /grant update \(is_online, current_location\) on public\.drivers to authenticated/i);
assert.doesNotMatch(code, /grant (all|update|insert|delete)\s+on\s+(table\s+)?public\.(profiles|drivers|hospitals|missions)\s+to\s+(?!service_role)/i, "no table-wide write grants except service_role");
for (const t of ["profiles", "drivers", "hospitals", "missions"]) {
  assert.match(code, new RegExp(`grant all on table public\\.${t} to service_role;`, "i"), `service_role grant on ${t}`);
}
assert.doesNotMatch(code, /grant (insert|update|delete)[^;]*on public\.(hospitals|missions)/i, "hospitals/missions are service-role write only");
assert.match(code, /revoke all on public\.profiles, public\.drivers, public\.hospitals, public\.missions from anon, authenticated/i);
assert.match(code, /create view public\.assigned_driver_vehicle[\s\S]*?where m\.patient_id = \(select auth\.uid\(\)\)/i);
const view = code.match(/create view public\.assigned_driver_vehicle[\s\S]*?;/i)![0];
assert.doesNotMatch(view, /license_number|emt_cert_id|current_location/i, "assigned-driver view must not leak licence/cert/location");
console.log("✓ no self-promotion path, narrow driver view\n");

console.log("Test 6: indexes...");
assert.match(code, /create index idx_hospitals_location on public\.hospitals using gist \(location\);/i);
assert.match(code, /create index idx_missions_patient_id on public\.missions \(patient_id/i);
assert.match(code, /create index idx_missions_driver_id on public\.missions \(driver_id\)/i);
console.log("✓ spatial + policy-column indexes\n");

console.log("Test 7: seed data (lng lat order, exact coordinates)...");
const seeds: Array<[string, string]> = [
  ["AIIMS New Delhi", "POINT(77.2100 28.5672)"],
  ["Safdarjung Hospital", "POINT(77.2075 28.5694)"],
  ["Sharda Hospital Greater Noida", "POINT(77.4820 28.4732)"],
  ["Fortis Hospital Noida Sector 62", "POINT(77.3732 28.6189)"],
];
for (const [name, point] of seeds) {
  assert.match(code, new RegExp(`'${name}'\\s*,\\s*'(DL|UP)'\\s*,\\s*(?:extensions\\.)?st_geogfromtext\\('SRID=4326;${point.replace(/[()]/g, "\\$&")}'\\)`, "i"), `${name} seed`);
}
console.log("✓ 4 trauma centres seeded\n");

console.log("Test 8: operational migration (push tokens, dispatch waves, audit trail, telemetry)...");
const ops = readFileSync(
  fileURLToPath(new URL("../migrations/20260924000001_operational_ems_schema.sql", import.meta.url)),
  "utf8"
).replace(/--.*$/gm, "");
const OPS_TABLES = ["driver_push_tokens", "dispatch_waves", "mission_events", "telemetry_logs"] as const;
const opsTableBody = (t: string) => ops.match(new RegExp(`create table public\\.${t} \\(([\\s\\S]*?)\\n\\);`, "i"))?.[1] ?? assert.fail(`missing ${t}`);
for (const t of OPS_TABLES) {
  opsTableBody(t);
  assert.match(ops, new RegExp(`alter table public\\.${t}\\s+enable row level security`, "i"), `${t} RLS enabled`);
  assert.match(ops, new RegExp(`grant all on table public\\.${t} to service_role;`, "i"), `service_role grant on ${t}`);
}
assert.match(opsTableBody("driver_push_tokens"), /platform\s+text not null check \(platform in \('android', 'ios', 'web'\)\)/i);
assert.match(opsTableBody("dispatch_waves"), /status\s+text not null check \(status in \('broadcasting', 'accepted', 'expired', 'exhausted'\)\)/i);
assert.match(opsTableBody("dispatch_waves"), /wave_number\s+integer not null check \(wave_number between 1 and 3\)/i);
assert.match(opsTableBody("dispatch_waves"), /radius_km\s+numeric\(4, 2\) not null/i);
assert.match(opsTableBody("mission_events"), /to_status\s+public\.mission_status not null/i);
assert.match(opsTableBody("telemetry_logs"), /location\s+extensions\.geography\(Point, 4326\) not null/i, "PostGIS type is schema-qualified");
assert.match(opsTableBody("telemetry_logs"), /id\s+bigint generated always as identity primary key/i);
assert.match(ops, /create index idx_telemetry_mission_time on public\.telemetry_logs \(mission_id, recorded_at\)/i);
const opsPolicies = [...ops.matchAll(/create policy (\w+) on public\.(\w+)([\s\S]*?);/gi)];
assert.strictEqual(opsPolicies.length, 5);
for (const [, name, , body] of opsPolicies) {
  assert.match(body!, /\bto authenticated\b/i, `${name} authenticated only`);
  assert.match(body!, /\(select auth\.uid\(\)\)/i, `${name} uses (select auth.uid())`);
  assert.doesNotMatch(body!, /(?<!\bselect )\bauth\.uid\(\)/i, `${name} has no bare auth.uid()`);
}
assert.ok(!opsPolicies.some(([, , table]) => table === "telemetry_logs"), "telemetry_logs has no client policy");
assert.match(ops, /revoke all on public\.driver_push_tokens, public\.dispatch_waves, public\.mission_events, public\.telemetry_logs\s+from anon, authenticated/i);
assert.doesNotMatch(ops.replace(/create policy[\s\S]*?;/gi, ""), /\bto anon\b/i, "no anon grants");
assert.doesNotMatch(ops, /grant (all|insert|update|delete)\s+on\s+(table\s+)?public\.\w+\s+to\s+(?!service_role)/i, "no table-wide client write grants");
assert.match(ops, /grant insert \(driver_id, token, platform\) on public\.driver_push_tokens to authenticated/i);
assert.doesNotMatch(ops, /grant [^;]*(insert|update|delete)[^;]*on public\.(dispatch_waves|mission_events|telemetry_logs)/i, "waves/audit/telemetry are read-only or server-only");
console.log("✓ operational schema\n");

console.log("Test: KYC review stays server-authoritative (G3)...");
const migDir = fileURLToPath(new URL("../migrations/", import.meta.url));
const allMig = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => readFileSync(migDir + f, "utf8").replace(/--.*$/gm, "")).join("\n");
assert.doesNotMatch(allMig, /grant execute on function public\.(approve_kyc|reject_kyc)[^;]*to\s+[^;]*\b(authenticated|anon|public)\b/i, "approve_kyc/reject_kyc never granted to clients");
assert.doesNotMatch(allMig, /grant [^;]*\bon (table )?auth\.users\b[^;]*\bto\s+[^;]*\b(authenticated|anon)\b/i, "no client grant on auth.users (app_metadata.role)");
assert.doesNotMatch(allMig, /grant update \([^)]*\brole\b[^)]*\) on public\.profiles/i, "profiles.role never client-writable");
const staffMig = readFileSync(migDir + "20260929000001_staff_kyc_review.sql", "utf8").replace(/--.*$/gm, "");
for (const fn of ["staff_list_kyc_applications", "staff_get_kyc_application", "staff_approve_kyc", "staff_reject_kyc"]) {
  const body = staffMig.match(new RegExp(`function public\\.${fn}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "i"))?.[1] ?? assert.fail(`missing ${fn}`);
  assert.match(body, /^\s*(declare[\s\S]*?)?begin\s+perform public\._require_staff\(\);/i, `${fn} checks staff first`);
}
assert.match(staffMig, /raw_app_meta_data ->> 'role' = 'staff'/i, "staff comes from server-set app_metadata only");
assert.doesNotMatch(staffMig, /raw_user_meta_data|auth\.jwt\(\)/i, "staff never read from client metadata or a stale JWT claim");
assert.match(staffMig, /revoke execute on function[\s\S]*?from public, anon, authenticated;/i, "default PUBLIC execute revoked");
assert.doesNotMatch(staffMig, /create policy \w+ on storage\.objects\s+for (insert|update|delete|all)/i, "staff get no storage write policy");
console.log("✓ KYC review authorization\n");

console.log("Test: KYC document integrity (G3.1)...");
const integrity = readFileSync(migDir + "20260929000002_kyc_document_integrity.sql", "utf8").replace(/--.*$/gm, "");
for (const fn of ["submit_kyc", "approve_kyc"]) {
  const body = integrity.match(new RegExp(`function public\\.${fn}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "i"))?.[1] ?? assert.fail(`missing ${fn}`);
  assert.match(body, /if not public\._kyc_required_documents_valid\([^)]*\) then perform public\._fail\('documents_invalid'/i, `${fn} enforces the document invariant`);
}
assert.match(integrity, /dd\.status in \('uploaded', 'accepted'\)/i, "a rejected document never counts");
assert.match(integrity, /exists \(select 1 from storage\.objects o where o\.bucket_id = 'driver-kyc-documents' and o\.name = dd\.storage_path\)/i, "the file must exist in Storage");
assert.match(integrity, /revoke execute on function public\._kyc_required_documents_valid\(uuid\) from public, anon, authenticated;/i);
const lastDef = (fn: string) => readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()
  .filter((f) => new RegExp(`create (or replace )?function public\\.${fn}\\(`, "i").test(readFileSync(migDir + f, "utf8"))).at(-1);
assert.strictEqual(lastDef("submit_kyc"), "20260929000002_kyc_document_integrity.sql", "no later migration replaces submit_kyc without the check");
assert.strictEqual(lastDef("approve_kyc"), "20260929000002_kyc_document_integrity.sql", "no later migration replaces approve_kyc without the check");
console.log("✓ KYC document integrity\n");

console.log("SUPABASE SCHEMA VALIDATION TESTS PASSED (100% GREEN)");
