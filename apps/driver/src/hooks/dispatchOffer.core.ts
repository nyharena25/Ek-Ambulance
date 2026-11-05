import type { AIS125VehicleType } from "@sahayak/domain";

/**
 * Pure helpers backing the dispatch-wave offer flow (IncomingMissionModal.tsx,
 * (shift)/offer.tsx), unit-testable without React Native or a live channel -
 * same "pure core, thin UI wrapper" split as otpAuth.core.ts.
 */

/** The "uncompromising 15-second acceptance window" (Phase 2 directive).
 *  Single source of truth: both the numeral countdown and the progress-bar
 *  animation in IncomingMissionModal.tsx read this constant. */
export const OFFER_WINDOW_SECONDS = 15;

export interface OfferCountdownTick {
  secondsLeft: number;
  expired: boolean;
}

/**
 * Advances the offer countdown by one tick. `expired` fires exactly once,
 * on the tick that reaches 0 - calling again once already at 0 stays at 0
 * without re-firing, so a caller polling past expiry can't double-fire
 * onTimeout.
 */
export function tickOfferCountdown(secondsLeft: number): OfferCountdownTick {
  if (secondsLeft <= 1) {
    return { secondsLeft: 0, expired: secondsLeft > 0 };
  }
  return { secondsLeft: secondsLeft - 1, expired: false };
}

export interface OfferCountdownDeps {
  /** Seconds left now: from the server expiry when there is one, else `fallback` (the locally ticked value). */
  secondsLeft: (fallback: number) => number;
  onTick: (secondsLeft: number) => void;
  onExpire: () => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

/**
 * Runs one offer's countdown; returns the stop function. `onExpire` fires exactly once, and immediately for an offer
 * that is already expired on arrival (late delivery, clock skew, unparseable expiry) - a 0 -> 0 tick never counted as an
 * expiry before, which left a dead offer on screen. Side effects stay out of React state updaters.
 */
export function runOfferCountdown(deps: OfferCountdownDeps): () => void {
  let remaining = deps.secondsLeft(OFFER_WINDOW_SECONDS);
  let handle: unknown = null;
  let done = false;
  const stop = () => {
    done = true;
    if (handle !== null) deps.clearInterval(handle);
    handle = null;
  };
  deps.onTick(remaining);
  if (remaining === 0) {
    stop();
    deps.onExpire();
    return stop;
  }
  handle = deps.setInterval(() => {
    if (done) return;
    remaining = deps.secondsLeft(tickOfferCountdown(remaining).secondsLeft);
    deps.onTick(remaining);
    if (remaining === 0) {
      stop();
      deps.onExpire();
    }
  }, 1000);
  return stop;
}

/**
 * Swipe-to-Accept completion threshold: the driver must drag at least 75%
 * across the slider track before release counts as acceptance - prevents
 * an accidental tap/short drag while driving from firing ACCEPT_DISPATCH.
 */
export function isSwipeAcceptanceComplete(
  dragDistance: number,
  maxDragDistance: number,
  threshold = 0.75
): boolean {
  if (maxDragDistance <= 0) return false;
  return dragDistance / maxDragDistance >= threshold;
}

/**
 * Verifies the offer's required AIS-125 category exactly matches the
 * driver's registered vehicle tier. Deliberately strict equality, not a
 * CareLevel comparison: careLevelFromVehicleType collapses TYPE_B_PTA and
 * TYPE_A_MFR into the same "PTA" CareLevel, but a motorbike first-responder
 * is not a substitute for a patient transport ambulance - the four AIS-125
 * categories are the real dispatch-eligibility granularity.
 * ponytail: strict-match only; add tier-hierarchy substitution (e.g. an
 * ALS unit covering a BLS request) if dispatch policy calls for it later.
 */
export function isVehicleTierEligible(
  requiredType: AIS125VehicleType,
  registeredType: AIS125VehicleType
): boolean {
  return requiredType === registeredType;
}
