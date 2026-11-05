/**
 * Experiment E7: Monte Carlo simulation of wave-based dispatch. This is a MODEL, not a measurement: driver positions,
 * acceptance probabilities and response times are synthetic and stated below. It uses the project's real dispatch
 * constants (DISPATCH_CONFIG) and compares two scheduler designs that both existed in the repository:
 *
 *   legacy    (20260924..20261001): offer TTL 15 s, wave window 45 s, dispatch_tick every 60 s, declines not recorded
 *   hardened  (20261003000000):     a wave expires with its offers (15 s), dispatch_tick every 5 s, and the last decline
 *                                   of a wave opens the next wave at once
 *
 * Model assumptions (each is a simplification of the SQL in dispatch_next_wave / accept_offer / decline_offer):
 *   - eligible drivers of the requested AIS-125 type form a homogeneous Poisson process of density rho per km^2 around
 *     the pickup; nobody is busy, reserved or locked by another transaction;
 *   - each offered driver independently accepts with probability pAccept, else declines with probability pDecline,
 *     else ignores the offer; an answer arrives uniformly within [1, 15) s of the offer;
 *   - the first acceptance wins; realtime delivery is taken as 0 s (E2 measured ~1-2 ms);
 *   - the time to reach the patient uses the repository's own offline route model (routingService.fallbackRoute:
 *     straight line x 1.3 at 30 km/h), so it is an illustrative ETA, not a traffic model.
 *
 * Validation: the simulated share of requests whose wave-1 disc holds at least one driver is compared with the closed
 * form 1 - exp(-rho * pi * r^2).
 *
 * Run from the repo root:
 *   node --experimental-strip-types report_source/bench/dispatch.sim.ts > report_source/bench/results/dispatch_sim.json
 */
import { DISPATCH_CONFIG } from "../../packages/domain/src/dispatch/index.ts";

const RADII = DISPATCH_CONFIG.radiiKm;
const TTL = DISPATCH_CONFIG.offerTtlSeconds;
const WINDOW = DISPATCH_CONFIG.waveWindowSeconds;
const TRIALS = 20_000;
const SEED = 20261028;

/** mulberry32: small, seedable, good enough for Monte Carlo of this size. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, u: () => number): number {
  // Knuth for small lambda, normal approximation above 60 (lambda here is at most ~95).
  if (lambda > 60) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(u)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= u();
  } while (p > L);
  return k - 1;
}
function gauss(u: () => number): number {
  return Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}

type Design = "legacy" | "hardened";
interface Outcome {
  assigned: boolean;
  tAssign: number;
  contacted: number;
  wavesOpened: number;
  driverKm: number;
  wave1NonEmpty: boolean;
}

function trial(design: Design, rho: number, pAccept: number, pDecline: number, u: () => number): Outcome {
  const outer = RADII[RADII.length - 1];
  const n = poisson(rho * Math.PI * outer * outer, u);
  const dists = Array.from({ length: n }, () => outer * Math.sqrt(u())).sort((x, y) => x - y);

  let t = 0; // wave 1 opens inside the booking transaction
  let contacted = 0;
  let wavesOpened = 0;
  let inner = 0;
  const wave1NonEmpty = dists.some((d) => d <= RADII[0]);
  for (let w = 0; w < RADII.length; w++) {
    const cands = dists.filter((d) => d > inner && d <= RADII[w]);
    inner = RADII[w];
    if (cands.length === 0) continue; // empty wave: dispatch_next_wave loops to the next radius at once
    wavesOpened++;
    contacted += cands.length;
    let best: { at: number; km: number } | null = null;
    let allDeclined = true;
    let lastDecline = 0;
    for (const km of cands) {
      const r = u();
      const at = 1 + u() * (TTL - 1);
      if (r < pAccept) {
        allDeclined = false;
        if (!best || at < best.at) best = { at, km };
      } else if (r < pAccept + pDecline) {
        lastDecline = Math.max(lastDecline, at);
      } else {
        allDeclined = false;
      }
    }
    if (best) {
      return { assigned: true, tAssign: t + best.at, contacted, wavesOpened, driverKm: best.km, wave1NonEmpty };
    }
    if (w === RADII.length - 1) break;
    if (design === "hardened") {
      // Last decline opens the next wave immediately; otherwise the wave expires at TTL and the next 5 s tick escalates.
      t += allDeclined ? lastDecline : TTL + u() * 5;
    } else {
      // Offers are dead after 15 s, the wave stays open until 45 s, and only the next minute tick escalates.
      t += WINDOW + u() * 60;
    }
  }
  return { assigned: false, tAssign: NaN, contacted, wavesOpened, driverKm: NaN, wave1NonEmpty };
}

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
};

const grid: unknown[] = [];
for (const rho of [0.01, 0.03, 0.1, 0.3]) {
  for (const pAccept of [0.2, 0.5, 0.8]) {
    for (const design of ["legacy", "hardened"] as Design[]) {
      const u = rng(SEED); // same seed for both designs (the streams diverge once their branches draw differently)
      const outs = Array.from({ length: TRIALS }, () => trial(design, rho, pAccept, 0.5 * (1 - pAccept), u));
      const ok = outs.filter((o) => o.assigned);
      const tA = ok.map((o) => o.tAssign);
      const eta = ok.map((o) => o.tAssign + ((o.driverKm * 1.3) / 30) * 3600);
      grid.push({
        design,
        rhoPerKm2: rho,
        expectedDriversWithin10km: +(rho * Math.PI * 100).toFixed(1),
        pAccept,
        pDecline: +(0.5 * (1 - pAccept)).toFixed(2),
        assignedInOfferWavesPct: +((100 * ok.length) / TRIALS).toFixed(2),
        timeToAssignS: { p50: pct(tA, 0.5), p90: pct(tA, 0.9), p99: pct(tA, 0.99) },
        modelArrivalS: { p50: pct(eta, 0.5), p90: pct(eta, 0.9) },
        meanDriversContacted: +(outs.reduce((a, o) => a + o.contacted, 0) / TRIALS).toFixed(2),
        wave1NonEmptyPct: { simulated: +((100 * outs.filter((o) => o.wave1NonEmpty).length) / TRIALS).toFixed(2), analytic: +(100 * (1 - Math.exp(-rho * Math.PI * RADII[0] ** 2))).toFixed(2) },
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      experiment: "E7 dispatch Monte Carlo (model, synthetic inputs)",
      runAt: new Date().toISOString(),
      seed: SEED,
      trialsPerCell: TRIALS,
      config: { radiiKm: RADII, offerTtlSeconds: TTL, waveWindowSeconds: WINDOW, legacyTickS: 60, hardenedTickS: 5 },
      grid,
    },
    null,
    2
  )
);
