import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DISPATCH_CONFIG,
  MISSION_TRANSITIONS,
  MISSION_LIFECYCLE_EVENTS,
  computeItemizedStatutoryFare,
  type AIS125VehicleType,
} from "../../packages/domain/src/index.ts";

// Static checks over the data & sync migrations (DATA_AND_SYNC_SPECIFICATION.md section 5-7). No database needed;
// behavioural RLS/RPC checks live in supabase/tests/mission_api.behaviour.sql and need a local Postgres.
const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../migrations/${name}`, import.meta.url)), "utf8").replace(/--.*$/gm, "");
const schema = read("20260924000002_data_sync_schema.sql");
const api = read("20260924000003_mission_api.sql");
const storage = read("20260924000004_storage_buckets.sql");
const board = read("20260924000005_driver_board_profile.sql");
const all = [schema, api, storage].join("\n");

console.log("Test 1: new tables (RLS on, service_role grant, revoked from clients)...");
const NEW_TABLES = ["jurisdictions", "consent_records", "erasure_requests", "driver_vehicles", "driver_documents"] as const;
for (const t of NEW_TABLES) {
  assert.match(schema, new RegExp(`create table public\\.${t} \\(`, "i"), `${t} created`);
  assert.match(schema, new RegExp(`alter table public\\.${t}\\s+enable row level security`, "i"), `${t}: RLS enabled`);
  assert.match(schema, new RegExp(`grant all on table public\\.${t} to service_role;`, "i"), `${t}: service_role grant`);
  assert.match(schema, new RegExp(`revoke all on [^;]*public\\.${t}\\b[^;]*from anon, authenticated`, "i"), `${t}: revoked from clients`);
}
assert.ok(!/create policy \w+ on public\.jurisdictions/i.test(schema), "jurisdictions has no client policy");
assert.doesNotMatch(schema, /insert into public\.jurisdictions/i, "jurisdictions is NOT seeded (bounding boxes would recreate G-06)");
assert.match(schema, /add column jurisdiction\s+public\.jurisdiction_zone,/i);
// Boundaries ship in their own generated migration, from a pinned real dataset (never bounding boxes).
const boundariesRaw = readFileSync(fileURLToPath(new URL("../migrations/20260929000000_jurisdiction_boundaries.sql", import.meta.url)), "utf8");
assert.match(boundariesRaw, /sha256 47aa0acb6f69868daee49143276f3ce323f18905ba7d38d0a86816b405028736/, "boundaries: pinned source sha256");
assert.match(boundariesRaw, /geoBoundaries\/raw\/9469f09\/releaseData\/gbOpen\/IND\/ADM1\//, "boundaries: pinned source release");
assert.deepStrictEqual([...boundariesRaw.matchAll(/^  \('(\w+)', '([^']+)',$/gm)].map((m) => `${m[1]}:${m[2]}`), ["DL:NCT of Delhi", "UP:Uttar Pradesh"]);
const geometries = [...boundariesRaw.matchAll(/\$geo\$(.*?)\$geo\$/g)].map((m) => JSON.parse(m[1]!) as { coordinates: unknown });
assert.strictEqual(geometries.length, 2, "boundaries: one geometry per zone");
for (const g of geometries) assert.ok(JSON.stringify(g.coordinates).split("],[").length > 1000, "boundaries: real polygons, not boxes");
assert.match(boundariesRaw, /on conflict \(zone\) do update/i, "boundaries: idempotent upsert");
console.log("✓ new tables\n");

console.log("Test 2: every policy is authenticated-only and uses (select auth.uid())...");
for (const [file, sql] of [["schema", schema], ["storage", storage]] as const) {
  const policies = [...sql.matchAll(/create policy (\w+) on ([\w.]+)([\s\S]*?);/gi)];
  assert.ok(policies.length > 0, `${file}: policies found`);
  for (const [, name, , body] of policies) {
    assert.match(body!, /\bto authenticated\b/i, `${name}: authenticated only`);
    assert.doesNotMatch(body!, /\bfor all\b/i, `${name}: no FOR ALL`);
    assert.doesNotMatch(body!, /user_metadata/i, `${name}: no user_metadata`);
    const bare = [...body!.matchAll(/auth\.uid\(\)/g)].filter((m) => !/\(\s*select\s+$/i.test(body!.slice(0, m.index)));
    assert.strictEqual(bare.length, 0, `${name}: bare auth.uid()`);
    if (/for update/i.test(body!)) assert.match(body!, /with check/i, `${name}: UPDATE needs WITH CHECK`);
  }
}
assert.match(schema, /create policy missions_select_driver on public\.missions\s+for select to authenticated\s+using \(driver_id = \(select auth\.uid\(\)\)\)/i, "R-06: pool branch removed");
assert.doesNotMatch(schema.match(/create policy missions_select_driver[\s\S]*?;/i)![0], /matched/i);
assert.doesNotMatch(all.replace(/create policy[\s\S]*?;/gi, ""), /\bto anon\b|grant [^;]* to anon/i, "no anon grants");
console.log("✓ policy shape\n");

console.log("Test 3: privilege hardening (R-05, R-06, DPDP)...");
assert.match(schema, /revoke update \(dpdp_consent_at\) on public\.profiles from authenticated/i, "consent timestamp not client-writable");
assert.match(schema, /revoke update \(is_online, current_location\) on public\.drivers from authenticated/i, "presence is server-side");
assert.match(schema, /drop policy dispatch_waves_select_eligible on public\.dispatch_waves/i);
assert.match(schema, /revoke select on public\.dispatch_waves from authenticated/i, "peer driver ids stay hidden");
assert.match(schema, /drivers_verified_matches_kyc check \(is_verified = \(kyc_status = 'approved'\)\)/i);
assert.ok(
  schema.search(/update public\.drivers set kyc_status = 'approved' where is_verified/i) <
    schema.search(/add constraint drivers_verified_matches_kyc/i),
  "backfill precedes the constraint"
);
assert.doesNotMatch(schema, /grant (all|update|insert|delete)\s+on\s+(table\s+)?public\.(profiles|drivers|hospitals|missions)\s+to\s+(?!service_role)/i, "no table-wide write grants (column-level grants only)");
assert.doesNotMatch(schema, /grant [^;]*\(status[^;]*\)[^;]*on public\.driver_documents/i, "status is not client-writable");
console.log("✓ grants\n");

console.log("Test 4: anti-gouging check is not bypassable by a missing key...");
const guard = schema.match(/add constraint missions_fare_guard check \(([\s\S]*?)\n  \);/i)?.[1] ?? assert.fail("fare guard missing");
assert.match(guard, /coalesce\(/i, "a NULL comparison must fail the check, not pass it");
assert.match(guard, /surgeMultiplier'\)::numeric = 1\.0/);
assert.match(guard, /surgeGougingAmountInr'\)::int = 0/);
console.log("✓ fare guard\n");

console.log("Test 5: mission_events is append-only and idempotent...");
assert.match(schema, /create trigger mission_events_append_only\s+before update or delete on public\.mission_events/i);
assert.match(schema, /create unique index idx_mission_events_mission_seq on public\.mission_events \(mission_id, seq\)/i);
assert.match(schema, /create unique index idx_mission_events_client_event[\s\S]*?where client_event_id is not null/i);
assert.match(schema, /create unique index idx_telemetry_dedupe on public\.telemetry_logs \(mission_id, driver_id, recorded_at\)/i);
assert.match(schema, /add constraint missions_patient_idempotency_key unique \(patient_id, idempotency_key\)/i);
console.log("✓ append-only + idempotency keys\n");

console.log("Test 6: migrations are safe on a populated table (backfill before NOT NULL)...");
for (const [col, backfill] of [
  ["seq", /update public\.mission_events e\s+set seq = /i],
  ["event_type", /update public\.mission_events\s+set event_type = /i],
  ["actor_role", /update public\.mission_events set actor_role = 'system'/i],
  ["display_ref", /update public\.missions set display_ref = /i],
] as const) {
  const setNotNull = schema.search(new RegExp(`alter column ${col} set not null`, "i"));
  assert.ok(setNotNull > 0, `${col}: set not null`);
  const at = schema.search(backfill);
  assert.ok(at >= 0 && at < setNotNull, `${col}: backfilled before SET NOT NULL`);
}
assert.match(schema, /alter column idempotency_key drop default/i);
assert.doesNotMatch(schema, /not valid/i, "a NOT VALID check would block legacy-row updates");
console.log("✓ populated-table safety\n");

console.log("Test 7: every SECURITY DEFINER function pins search_path; client surface is an explicit allow-list...");
const defs = api.split(/create function /i).slice(1);
assert.ok(defs.length >= 25, `functions found (${defs.length})`);
for (const def of defs) {
  const name = def.match(/^public\.(\w+)/)![1];
  const bodyStart = def.search(/\bas \$\$/i);
  assert.ok(bodyStart > 0, `${name}: body found`);
  const header = def.slice(0, bodyStart);
  if (/security definer/i.test(header)) assert.match(header, /set search_path = ''/i, `${name}: SECURITY DEFINER without a pinned search_path`);
}
assert.match(api, /revoke all on all functions in schema public from public, anon, authenticated;/i);
const granted = [...api.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to authenticated;/gi)].map((m) => m[1]).sort();
assert.deepStrictEqual(
  granted,
  [
    "accept_offer", "cancel_mission", "confirm_receipt", "create_mission", "decline_offer", "dispatch_config",
    "ingest_telemetry", "record_consent", "request_erasure", "set_driver_presence", "submit_kyc",
    "transition_mission", "upsert_driver_application",
  ].sort(),
  "authenticated may execute exactly the client RPC surface"
);
assert.doesNotMatch(api, /grant execute[^;]*to anon/i);
for (const internal of ["publish_realtime", "_record_event", "dispatch_next_wave", "dispatch_tick", "process_erasure_requests", "purge_expired_personal_data", "compute_statutory_fare"]) {
  assert.ok(!granted.includes(internal), `${internal} is not client-callable`);
}
console.log("✓ function privileges\n");

console.log("Test 8: SQL error codes map to HTTP statuses PostgREST understands...");
const codes = new Set([...api.matchAll(/'(PT\d{3})'/g)].map((m) => m[1]));
assert.deepStrictEqual([...codes].sort(), ["PT401", "PT403", "PT404", "PT409", "PT422", "PT503"]);
console.log("✓ error codes\n");

console.log("Test 9: SQL tariff equals the TypeScript pricing engine (G-07, G-28)...");
const tariff = new Map<string, { base: number; perKm: number; care: string }>();
for (const m of api.matchAll(/(?:when '(TYPE_\w+)' then|else)\s+v_base := (\d+);\s+v_per_km := (\d+);\s+v_care := '(\w+)';/g)) {
  tariff.set(m[1] ?? "TYPE_A_MFR", { base: Number(m[2]), perKm: Number(m[3]), care: m[4]! });
}
assert.strictEqual(tariff.size, 4, "four vehicle tiers in the SQL tariff");
for (const v of ["TYPE_D_ALS", "TYPE_C_BLS", "TYPE_B_PTA", "TYPE_A_MFR"] as AIS125VehicleType[]) {
  const ts = computeItemizedStatutoryFare({ vehicleType: v, jurisdiction: "DL", distanceKm: 8.4 });
  const sql = tariff.get(v)!;
  assert.strictEqual(sql.base, ts.baseFareInr, `${v} base fare`);
  assert.strictEqual(sql.perKm, ts.perKmRateInr, `${v} per km`);
  assert.strictEqual(sql.care, ts.careLevel, `${v} care level`);
}
const dl = computeItemizedStatutoryFare({ vehicleType: "TYPE_D_ALS", jurisdiction: "DL", distanceKm: 8.4 });
const up = computeItemizedStatutoryFare({ vehicleType: "TYPE_D_ALS", jurisdiction: "UP", distanceKm: 8.4 });
assert.match(api, /'initialIncludedKm', 5\.0/);
assert.match(api, /greatest\(0, round\(p_distance_km - 5\.0, 1\)\)/);
for (const text of [dl.statutoryOrderRef, up.statutoryOrderRef, dl.mandateDeclaration, dl.hindiMandateDeclaration, dl.tariffVersion]) {
  assert.ok(api.includes(text), `SQL carries the exact statutory text: ${text}`);
}
console.log("✓ tariff parity\n");

console.log("Test 10: SQL dispatch config and transition table equal the domain constants (D-5, 7.1)...");
assert.ok(
  api.includes(
    `jsonb_build_object('offerTtlSeconds', ${DISPATCH_CONFIG.offerTtlSeconds}, 'waveWindowSeconds', ${DISPATCH_CONFIG.waveWindowSeconds}, 'radiiKm', jsonb_build_array(${DISPATCH_CONFIG.radiiKm.join(", ")}))`
  ),
  "dispatch_config() matches DISPATCH_CONFIG"
);
assert.strictEqual(DISPATCH_CONFIG.radiiKm.length, 3, "three waves fit dispatch_waves.wave_number 1..3");
for (const t of MISSION_TRANSITIONS) {
  assert.ok((MISSION_LIFECYCLE_EVENTS as readonly string[]).includes(t.event), `${t.event} is a wire event`);
  assert.match(api, new RegExp(`_record_event\\(\\s*[\\w.]+,\\s*'${t.to}',\\s*'${t.event}'`), `SQL records ${t.event} -> ${t.to}`);
}
for (const e of MISSION_LIFECYCLE_EVENTS) assert.ok(api.includes(`'${e}'`), `SQL emits ${e}`);
assert.match(api, /if new\.event_type = 'MISSION_REQUESTED' then return new; end if;/, "creation is in the trail but not on the wire");
console.log("✓ config + transitions\n");

console.log("Test 11: wire envelope keeps clinical/audit detail off the channel (6.4.3)...");
assert.match(api, /new\.metadata - array\['vitals', 'handoff', 'emergencyType', 'bypass', 'audit'\]/);
for (const key of ["'v', 1", "'type', 'lifecycle'", "'eventId'", "'seq'", "'missionId'", "'state'", "'timestamp'", "'data'"]) {
  assert.ok(api.includes(key), `envelope carries ${key}`);
}
assert.match(api, /'centrifugo_api_url'/);
assert.match(api, /if v_url is null or v_key is null then return; end if;/, "no configured publisher => safe no-op");
assert.match(api, /exception when others then\s+raise warning 'publish_realtime skipped/i, "publish failure never rolls back the mission change");
console.log("✓ envelope\n");

console.log("Test 12: storage buckets (5.4)...");
const buckets = [...storage.matchAll(/\('([\w-]+)',\s*'[\w-]+',\s*(false|true),\s*(\d+),\s*array\[([^\]]*)\]\)/g)];
const byId = new Map(buckets.map((m) => [m[1]!, { pub: m[2], size: Number(m[3]), mime: m[4]!.match(/'([^']+)'/g)!.map((x) => x.slice(1, -1)) }]));
assert.deepStrictEqual([...byId.keys()].sort(), ["driver-kyc-documents", "emr-handoffs", "receipts"], "D-7: no medical-prescriptions bucket");
for (const [id, b] of byId) assert.strictEqual(b.pub, "false", `${id} is private`);
assert.strictEqual(byId.get("driver-kyc-documents")!.size, 5 * 1024 * 1024);
assert.deepStrictEqual(byId.get("driver-kyc-documents")!.mime, ["application/pdf", "image/jpeg", "image/png"]);
assert.strictEqual(byId.get("receipts")!.size, 1024 * 1024);
assert.deepStrictEqual(byId.get("receipts")!.mime, ["application/pdf"]);
assert.strictEqual(byId.get("emr-handoffs")!.size, 2 * 1024 * 1024);
const storagePolicies = [...storage.matchAll(/create policy (\w+) on storage\.objects\s+for (\w+)/gi)].map((m) => `${m[1]}:${m[2]}`);
assert.deepStrictEqual(
  storagePolicies.sort(),
  ["emr_handoffs_select_own:select", "kyc_docs_delete_own:delete", "kyc_docs_insert_own:insert", "kyc_docs_select_own:select", "kyc_docs_update_own:update", "receipts_select_own:select"],
  "receipts/EMR buckets have no client write policy"
);
for (const p of ["kyc_docs_insert_own", "kyc_docs_update_own", "kyc_docs_delete_own"]) {
  const body = storage.match(new RegExp(`create policy ${p}[\\s\\S]*?;`, "i"))![0];
  assert.match(body, /kyc_status in \('draft', 'rejected'\)/, `${p}: writes only while the application is editable`);
  assert.match(body, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/, `${p}: own folder only`);
}
console.log("✓ storage\n");

console.log("Test 13: profile provisioning never trusts client-controlled metadata (R-04)...");
const trigger = api.match(/create function public\.handle_new_user\(\)[\s\S]*?\$\$;/i)![0];
assert.match(trigger, /raw_app_meta_data/);
assert.doesNotMatch(trigger, /raw_user_meta_data/, "role must not come from user-editable metadata");
assert.match(api, /create trigger on_auth_user_created\s+after insert or update of raw_app_meta_data on auth\.users/i, "role set after signup must reach profiles");
console.log("✓ provisioning\n");

console.log("Test 14: driver board migration - config parity, pinned search_path, exact client surface...");
assert.ok(
  board.includes(
    `jsonb_build_object('offerTtlSeconds', ${DISPATCH_CONFIG.offerTtlSeconds}, 'waveWindowSeconds', ${DISPATCH_CONFIG.waveWindowSeconds}, 'radiiKm', jsonb_build_array(${DISPATCH_CONFIG.radiiKm.join(", ")}), 'boardRadiiKm', jsonb_build_array(${DISPATCH_CONFIG.boardRadiiKm.join(", ")}))`
  ),
  "dispatch_config() in migration 5 matches DISPATCH_CONFIG including boardRadiiKm"
);
assert.strictEqual(DISPATCH_CONFIG.boardRadiiKm.length, 3, "board bands: green, red, fallback");
// The radii and the window are read from dispatch_config(); a literal 4 / 7 / 10 here would drift from the domain constant.
const band = board.match(/create function public\._board_band[\s\S]*?\n\$\$;/i)![0];
assert.match(band, /cfg -> 'boardRadiiKm' ->> 0/);
assert.match(band, /cfg ->> 'waveWindowSeconds'/);
assert.doesNotMatch(band, /<=\s*(4|7|10)\b/, "no hard-coded radius in _board_band");
const boardDefs = board.split(/create (?:or replace )?function /i).slice(1);
assert.ok(boardDefs.length >= 9, `board functions found (${boardDefs.length})`);
for (const def of boardDefs) {
  const name = def.match(/^public\.(\w+)/)![1];
  const header = def.slice(0, def.search(/\bas \$\$/i));
  if (/security definer/i.test(header)) assert.match(header, /set search_path = ''/i, `${name}: SECURITY DEFINER without a pinned search_path`);
}
const boardGranted = [...board.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to authenticated;/gi)].map((m) => m[1]).sort();
assert.deepStrictEqual(
  boardGranted,
  ["accept_offer", "claim_emergency", "dispatch_config", "get_driver_profile", "list_nearby_emergencies", "update_driver_profile"],
  "migration 5 grants exactly the new client RPCs (plus the two it redefines)"
);
for (const internal of ["_board_band", "_driver_on_mission", "_driver_public_info", "_lock_driver_name_on_mission", "sync_profile_phone"]) {
  assert.ok(!boardGranted.includes(internal), `${internal} is not client-callable`);
  assert.match(board, new RegExp(`public\\.${internal}\\([^)]*\\)[\\s\\S]*?from public, anon, authenticated;`), `${internal} revoked from clients`);
}
assert.doesNotMatch(board, /grant execute[^;]*to anon/i);
assert.doesNotMatch(board, /create policy/i, "the board widens no RLS policy: it is a per-caller RPC, never a broadcast (6.4.4, R-06)");
assert.doesNotMatch(board, /publish_realtime\(\s*'dispatch/i, "no shared dispatch channel");
// The lock (profile cannot change during an emergency) sits in the RPC and behind the table grant and the auth phone change.
assert.match(board, /_driver_on_mission\(v_uid\) then perform public\._fail\('profile_locked', 'PT409'\)/, "update_driver_profile refuses mid-mission");
assert.match(board, /create trigger profiles_lock_driver_name\s+before update of full_name on public\.profiles/i);
assert.match(board, /create trigger on_auth_user_phone_changed\s+after update of phone on auth\.users/i);
// A claim from the board re-checks eligibility server-side, under a row lock.
const claim = board.match(/create function public\.claim_emergency[\s\S]*?\n\$\$;/i)![0];
for (const guard of ["for update", "already_on_mission", "_board_band(d, m) is null", "d.ais125_type <> m.vehicle_type", "'DRIVER_ACCEPTED'"]) {
  assert.ok(claim.includes(guard), `claim_emergency checks: ${guard}`);
}
console.log("✓ driver board migration\n");

console.log("Test 15: extended search window - config parity, one system-cancel path, internal-only helper...");
const search = read("20260924000006_extended_search_window.sql");
assert.ok(
  search.includes(
    `jsonb_build_object('offerTtlSeconds', ${DISPATCH_CONFIG.offerTtlSeconds}, 'waveWindowSeconds', ${DISPATCH_CONFIG.waveWindowSeconds}, 'radiiKm', jsonb_build_array(${DISPATCH_CONFIG.radiiKm.join(", ")}), 'boardRadiiKm', jsonb_build_array(${DISPATCH_CONFIG.boardRadiiKm.join(", ")}), 'searchTtlSeconds', ${DISPATCH_CONFIG.searchTtlSeconds})`
  ),
  "dispatch_config() in migration 6 matches DISPATCH_CONFIG including searchTtlSeconds"
);
assert.ok(DISPATCH_CONFIG.searchTtlSeconds > DISPATCH_CONFIG.radiiKm.length * DISPATCH_CONFIG.waveWindowSeconds, "the search window outlasts the offer waves, or it would change nothing");
const next = search.match(/create or replace function public\.dispatch_next_wave[\s\S]*?\n\$\$;/i)![0];
assert.match(next, /cfg ->> 'searchTtlSeconds'/, "the window is read from config, not hard-coded");
assert.match(next, /cardinality\(x\.eligible_driver_ids\) > 0/, "held open only if drivers were actually asked");
assert.match(next, /_cancel_unanswered/, "otherwise it ends through the shared system-cancel");
assert.doesNotMatch(next, /'cancelledBy', 'system'/, "no second copy of the cancel");
const tick = search.match(/create or replace function public\.dispatch_tick[\s\S]*?\n\$\$;/i)![0];
assert.match(tick, /created_at \+ make_interval\(secs => ttl\) <= now\(\)/, "dispatch_tick ends requests past the window");
assert.match(search, /revoke all on function public\._cancel_unanswered\(uuid\) from public, anon, authenticated;/, "the helper is internal");
assert.doesNotMatch(search, /grant execute[^;]*(_cancel_unanswered|dispatch_tick|dispatch_next_wave)[^;]*to (anon|authenticated)/i, "no dispatch internals are client-callable");
for (const def of search.split(/create (?:or replace )?function /i).slice(1)) {
  const header = def.slice(0, def.search(/\bas \$\$/i));
  if (/security definer/i.test(header)) assert.match(header, /set search_path = ''/i, `${def.match(/^public\.(\w+)/)![1]}: SECURITY DEFINER without a pinned search_path`);
}
console.log("✓ extended search window\n");

console.log("DATA & SYNC SCHEMA VALIDATION TESTS PASSED (100% GREEN)");
