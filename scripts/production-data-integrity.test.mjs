// Production code of both apps must not carry invented runtime data (fake people, plates, phone numbers, vitals, integration
// status, mission ids, ETAs, distances, fares, vehicle types or symptoms used as fallbacks). Test files, E2E scripts and the
// integration harness are excluded; the two fixtures used only by the in-app test runner (IS_TEST_RUNNER) are listed below.
// Run: node scripts/production-data-integrity.test.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN = ["apps/patient/src", "apps/patient/app", "apps/driver/src", "apps/driver/app"];
const isTestOnly = (p) => /\.test\.tsx?$|\.e2e\.tsx?$|\/integration\//.test(p);

const BANNED = [
  [/Amit Verma|अमित वर्मा|Rajesh Kumar/, "fake person"],
  [/DL ?01 ?AB ?1234|UP ?16 ?CD ?5678/, "fake vehicle plate"],
  [/4084 3910|1800-AMBULANCE/, "fake phone number"],
  [/HR 88|SpO2 94|MAP 93/, "fake vitals"],
  [/HL7|FHIR/, "fake hospital integration status"],
  [/Bay 02|बे 02/, "fake bed assignment"],
  [/MSN-2026-8819/, "fake mission id"],
  [/RANKED_TRAUMA_CENTRES|matchHospitalId|findHospital\(/, "hardcoded hospital catalog / name-or-position matching"],
  [/(\|\||\?\?) ?"TYPE_D_ALS"|[vV]ehicleType = "TYPE_D_ALS"|registeredAis125Type: "TYPE_D_ALS"/, "TYPE_D_ALS fallback"],
  [/initialAcuity = "CAT_1_IMMEDIATE"|: "CAT_1_IMMEDIATE";\s*$/, "urgency fallback"],
  [/(\|\||\?\?) ?"chest_pain"|initialComplaint = "chest_pain"/, "chest_pain fallback"],
  [/DEFAULT_DISPATCH_DISTANCE_KM/, "fare/distance from a default distance"],
  [/^\s*etaMinutes: \d+,|distanceKmApprox/, "fixed ETA / distance"],
];

// IS_TEST_RUNNER-only fixtures (never reached in a build on a phone): file -> patterns tolerated there.
const ALLOWED = {
  "apps/driver/src/state/driverStandby.store.ts": [/registeredAis125Type: IS_TEST_RUNNER \? "TYPE_D_ALS" : null/],
};

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
};
for (const d of SCAN) walk(join(ROOT, d));

const hits = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  if (isTestOnly(rel)) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    for (const [re, why] of BANNED) {
      if (!re.test(line)) continue;
      if ((ALLOWED[rel] ?? []).some((ok) => ok.test(line))) continue;
      hits.push(`${rel}:${i + 1}  [${why}]  ${line.trim().slice(0, 120)}`);
    }
  });
}
assert.ok(files.length > 100, `scanned only ${files.length} files: wrong root?`);
assert.deepEqual(hits, [], "invented data in production code:\n" + hits.join("\n"));
console.log(`PRODUCTION DATA INTEGRITY PASSED (${files.length} files scanned, ${BANNED.length} rules)`);
