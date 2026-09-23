import assert from "node:assert";
import { readFileSync } from "node:fs";
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

console.log("SUPABASE SCHEMA VALIDATION TESTS PASSED (100% GREEN)");
