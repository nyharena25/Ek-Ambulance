/**
 * The driver's Booking board: which open emergencies a driver may see and how their timer reads.
 * Pure: no I/O, no framework imports. The SQL `_board_band()` implements the same visibility rule (the server decides
 * what a driver sees; a client never receives an emergency outside its band). Timing and radii come from DISPATCH_CONFIG.
 */
import { DISPATCH_CONFIG, type UrgencyTierName } from "./index.ts";
import type { AIS125VehicleType } from "../types/index.ts";

export const BOARD_PAGE_SIZE = 5;

/** green: close and new. red: further out, and nobody near answered within the designed time. fallback: home-screen card only. */
export type BoardBand = "green" | "red" | "fallback";
export type BoardTone = "green" | "yellow" | "orange" | "red";

const [GREEN_KM, RED_KM, FALLBACK_KM] = DISPATCH_CONFIG.boardRadiiKm;
/** The designed time of one emergency is one wave window; it is also what the patient's matching countdown shows. */
const DESIGNED_SECONDS = DISPATCH_CONFIG.waveWindowSeconds;
const ORANGE_AT_SECONDS = 10;

/**
 * Green: within 4 km at any age (an overdue one shows here with a negative timer).
 * Red: 4-7 km once one designed time has passed with no taker.
 * Fallback: 7-10 km once two have passed and no ambulance of that type is free within 7 km.
 */
export function boardBand(distanceKm: number, ageSeconds: number, freeAmbulanceWithinRedKm: boolean): BoardBand | null {
  if (distanceKm <= GREEN_KM) return "green";
  if (distanceKm <= RED_KM) return ageSeconds >= DESIGNED_SECONDS ? "red" : null;
  if (distanceKm <= FALLBACK_KM) return ageSeconds >= 2 * DESIGNED_SECONDS && !freeAmbulanceWithinRedKm ? "fallback" : null;
  return null;
}

/** Signed seconds until `dueAt`, negative once overdue (`offerSecondsLeft` clamps at 0). ceil: 44.2 s reads 45, -52.3 s reads -52. */
export function boardSecondsLeft(dueAtIso: string, localNowMs: number, clockOffsetMs = 0): number {
  const due = Date.parse(dueAtIso);
  return Number.isNaN(due) ? 0 : Math.ceil((due - (localNowMs + clockOffsetMs)) / 1000);
}

/** green > half the designed time left, yellow at or below half, orange at 10 s or less, red once negative. */
export function boardTimerTone(secondsLeft: number, designedSeconds = DESIGNED_SECONDS): BoardTone {
  if (secondsLeft < 0) return "red";
  if (secondsLeft <= ORANGE_AT_SECONDS) return "orange";
  if (secondsLeft <= designedSeconds / 2) return "yellow";
  return "green";
}

/**
 * The offer wave nominally open `elapsedSeconds` after a request was made: one window each, and the last one stays.
 * The patient's matching screen derives its wave from this instead of keeping a second clock of its own.
 */
export function searchWaveAt(elapsedSeconds: number): 1 | 2 | 3 {
  const waves = DISPATCH_CONFIG.radiiKm.length;
  return Math.min(waves, Math.floor(Math.max(0, elapsedSeconds) / DESIGNED_SECONDS) + 1) as 1 | 2 | 3;
}

/** True once every offer wave has run its window: the request is then only waiting on the drivers' Booking board. */
export const offerWavesOver = (elapsedSeconds: number): boolean => elapsedSeconds >= DISPATCH_CONFIG.radiiKm.length * DESIGNED_SECONDS;

/** `00:45`, `-00:52`. */
export function formatBoardTimer(secondsLeft: number): string {
  const abs = Math.abs(secondsLeft);
  const mm = String(Math.floor(abs / 60)).padStart(2, "0");
  const ss = String(abs % 60).padStart(2, "0");
  return `${secondsLeft < 0 ? "-" : ""}${mm}:${ss}`;
}

export interface BoardEmergency {
  missionId: string;
  createdAt: string;
  /** createdAt + one designed time: the shared deadline the patient's matching countdown also counts to. */
  dueAt: string;
  distanceKm: number;
  band: BoardBand;
  urgency?: UrgencyTierName;
  requiredVehicleType?: AIS125VehicleType;
  pickup: { latitude: number; longitude: number; address?: string; landmark?: string };
  patientSummary?: { primaryComplaint?: string; derivedFlags?: string[]; ageBand?: string; sex?: string };
}

/**
 * Oldest first (the one waiting longest is on top); ties break on id so the order is stable between refreshes.
 * Each createdAt is parsed once, not twice per comparison: parsing inside the comparator cost ~300 ns x n log n.
 */
export function sortOldestFirst<T extends { createdAt: string; missionId: string }>(items: readonly T[]): T[] {
  return items
    .map((item) => ({ item, at: Date.parse(item.createdAt) }))
    .sort((a, b) => a.at - b.at || a.item.missionId.localeCompare(b.item.missionId))
    .map((e) => e.item);
}

export interface BoardPage<T> {
  items: T[];
  /** Clamped into range, so a list that shrank under the driver never shows an empty page. */
  page: number;
  pageCount: number;
  total: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize = BOARD_PAGE_SIZE): BoardPage<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(0, Math.trunc(page) || 0), pageCount - 1);
  return { items: items.slice(clamped * pageSize, (clamped + 1) * pageSize), page: clamped, pageCount, total: items.length };
}

// ---------------------------------------------------------------------------
// Wire: the `list_nearby_emergencies` response. Tolerant like parseDispatchOffer: what is malformed is dropped, not invented.
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const VEHICLES: ReadonlySet<string> = new Set(["TYPE_A_MFR", "TYPE_B_PTA", "TYPE_C_BLS", "TYPE_D_ALS"]);
const URGENCIES: ReadonlySet<string> = new Set(["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"]);
const BANDS: ReadonlySet<string> = new Set(["green", "red", "fallback"]);

export function parseBoardEmergency(data: unknown): BoardEmergency | null {
  if (!isObject(data)) return null;
  const missionId = str(data.missionId);
  const createdAt = str(data.createdAt);
  const dueAt = str(data.dueAt);
  const distanceKm = num(data.distanceKm);
  const pickup = isObject(data.pickup) ? data.pickup : undefined;
  const lat = pickup ? num(pickup.latitude) : undefined;
  const lng = pickup ? num(pickup.longitude) : undefined;
  if (!missionId || !createdAt || !dueAt || Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(dueAt))) return null;
  if (distanceKm === undefined || lat === undefined || lng === undefined || !BANDS.has(String(data.band))) return null;
  const summary = isObject(data.patientSummary) ? data.patientSummary : undefined;
  return {
    missionId,
    createdAt,
    dueAt,
    distanceKm,
    band: data.band as BoardBand,
    urgency: URGENCIES.has(String(data.urgency)) ? (data.urgency as UrgencyTierName) : undefined,
    requiredVehicleType: VEHICLES.has(String(data.requiredVehicleType)) ? (data.requiredVehicleType as AIS125VehicleType) : undefined,
    pickup: { latitude: lat, longitude: lng, address: str(pickup?.address), landmark: str(pickup?.landmark) },
    patientSummary: summary
      ? {
          primaryComplaint: str(summary.primaryComplaint),
          derivedFlags: Array.isArray(summary.derivedFlags) ? summary.derivedFlags.filter((f): f is string => typeof f === "string") : undefined,
          ageBand: str(summary.ageBand),
          sex: str(summary.sex),
        }
      : undefined,
  };
}

export interface BoardSnapshot {
  /** Server time, so timers do not depend on the phone's clock (same rule as the offer countdown). */
  serverNow?: string;
  items: BoardEmergency[];
}

export function parseBoardResponse(data: unknown): BoardSnapshot | null {
  if (!isObject(data) || !Array.isArray(data.items)) return null;
  return {
    serverNow: str(data.serverNow),
    items: data.items.map(parseBoardEmergency).filter((e): e is BoardEmergency => e !== null),
  };
}
