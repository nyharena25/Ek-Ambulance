/**
 * Paired before/after benchmark of the Booking-board sort fix (report Sections 6.6 and 7.5). The legacy comparator, which
 * parsed both timestamps on every comparison, is reproduced inline and timed in the same process, alternating with the
 * current `sortOldestFirst`, so power state and thermal drift affect both equally.
 *
 * Run from the repo root:
 *   node --experimental-strip-types report_source/bench/board_sort.bench.ts > report_source/bench/results/board_sort.json
 */
import os from "node:os";
import { readFileSync } from "node:fs";
import { sortOldestFirst } from "../../packages/domain/src/dispatch/board.ts";

type Item = { missionId: string; createdAt: string };

/** The implementation before the fix (packages/domain/src/dispatch/board.ts at commit 9b789c0). */
function legacySortOldestFirst<T extends Item>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.missionId.localeCompare(b.missionId));
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const now = Date.UTC(2026, 9, 28, 12);

function timeOnce(fn: () => unknown, reps: number): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) fn();
  return Number(process.hrtime.bigint() - t0) / reps / 1000; // µs per call
}

const rows = [10, 100, 1_000, 10_000, 100_000].map((n) => {
  const items: Item[] = Array.from({ length: n }, (_, i) => ({
    missionId: `m-${(i * 7919) % n}`,
    createdAt: new Date(now - ((i * 104729) % 600_000)).toISOString(),
  }));
  // Same order from both, or the comparison is meaningless.
  const current0 = sortOldestFirst(items);
  const same = legacySortOldestFirst(items).every((x, i) => x === current0[i]);
  if (!same) throw new Error(`orders differ at n=${n}`);
  const reps = Math.max(1, Math.floor(20_000 / n));
  const samples = n >= 100_000 ? 9 : 31;
  for (let w = 0; w < 3; w++) {
    timeOnce(() => legacySortOldestFirst(items), reps);
    timeOnce(() => sortOldestFirst(items), reps);
  }
  const legacy: number[] = [];
  const current: number[] = [];
  for (let s = 0; s < samples; s++) {
    legacy.push(timeOnce(() => legacySortOldestFirst(items), reps));
    current.push(timeOnce(() => sortOldestFirst(items), reps));
  }
  const l = median(legacy);
  const c = median(current);
  return { n, sameOrder: same, legacyMedianUs: +l.toFixed(2), currentMedianUs: +c.toFixed(2), speedup: +(l / c).toFixed(1) };
});

const readOr = (p: string) => {
  try {
    return readFileSync(p, "utf8").trim();
  } catch {
    return null;
  }
};
console.log(
  JSON.stringify(
    {
      experiment: "E1b board sort fix, paired legacy vs current",
      runAt: new Date().toISOString(),
      env: { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length },
      power: { acOnline: readOr("/sys/class/power_supply/AC/online"), platformProfile: readOr("/sys/firmware/acpi/platform_profile") },
      rows,
    },
    null,
    2
  )
);
