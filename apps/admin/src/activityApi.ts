import type { SupabaseClient } from "@supabase/supabase-js";
import { errorCode, type Result } from "./kycApi.ts";

/**
 * Staff driver activity service (migration 20261002000000). Every figure is computed in Postgres from rows the mission
 * lifecycle already stores; nothing here derives a fare or a distance. The only client-side arithmetic is the difference
 * between two server timestamps the RPC returns, and a missing timestamp stays missing ("Not recorded").
 */

export const IST = "Asia/Kolkata";
export const OUTCOMES = ["completed", "cancelled", "released", "in_progress"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const VEHICLE_TYPES = ["TYPE_A_MFR", "TYPE_B_PTA", "TYPE_C_BLS", "TYPE_D_ALS"] as const;
export const PAGE_SIZE = 50;

export interface ActivityTotals {
  date: string | null;
  accepted: number;
  completed: number;
  cancelled: number;
  cancelledByDriver: number;
  released: number;
  inProgress: number;
  finalFareInr: number;
  estimatedFareInr: number;
  avgFinalFareInr: number | null;
  distanceKm: number;
  measuredDistanceKm: number;
  estimateDistanceKm: number;
  estimateDistanceMissions: number;
  avgDistanceKm: number | null;
  avgCompletedDurationS: number | null;
  recordedTimeS: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
}

export interface DriverActivity {
  driverId: string;
  timeZone: string;
  accountCreatedAt: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  onMission: boolean;
  lifetime: ActivityTotals;
  range: ActivityTotals;
  today: ActivityTotals;
  days: ActivityTotals[];
}

export interface MissionEvent {
  seq: number;
  eventType: string;
  toStatus: string;
  actorRole: string;
  byThisDriver?: boolean;
  at: string;
  reportedAt?: string;
  reason?: string;
  cancelledBy?: string;
  distanceSource?: string;
}

export interface DriverMission {
  missionId: string;
  displayRef: string;
  vehicleType: string;
  urgency: string;
  missionStatus: string;
  outcome: Outcome;
  cancelledBy: string | null;
  endReason: string | null;
  pickupAddress: string | null;
  pickupLat: number;
  pickupLng: number;
  destination: string | null;
  requestedAt: string;
  offeredAt: string | null;
  acceptedAt: string;
  onSceneAt: string | null;
  transportAt: string | null;
  hospitalAt: string | null;
  endedAt: string | null;
  finalFareInr: number | null;
  estimatedFareInr: number | null;
  billedDistanceKm: number | null;
  quotedDistanceKm: number | null;
  distanceSource: "measured" | "estimate" | null;
  events: MissionEvent[];
}

export interface MissionFilter {
  from: string;
  to: string;
  outcome?: Outcome | null;
  vehicleType?: string | null;
  offset?: number;
}

const wrap = <T>(data: unknown, error: { code?: string; message?: string } | null): Result<T> =>
  error ? { ok: false, error: errorCode(error) } : { ok: true, data: data as T };

/** from / to are inclusive Asia/Kolkata dates (YYYY-MM-DD). */
export async function getDriverActivity(db: SupabaseClient, driverId: string, from: string, to: string): Promise<Result<DriverActivity>> {
  const { data, error } = await db.rpc("staff_driver_activity", { p_driver_id: driverId, p_from: from, p_to: to });
  return wrap(data, error);
}

export async function listDriverMissions(db: SupabaseClient, driverId: string, f: MissionFilter): Promise<Result<{ total: number; rows: DriverMission[] }>> {
  const { data, error } = await db.rpc("staff_driver_missions", {
    p_driver_id: driverId, p_from: f.from, p_to: f.to, p_outcome: f.outcome ?? null, p_vehicle_type: f.vehicleType ?? null,
    p_limit: PAGE_SIZE, p_offset: f.offset ?? 0,
  });
  return wrap(data, error);
}

// ---------------------------------------------------------------------------
// Dates (IST calendar days, matching the server's bucketing)
// ---------------------------------------------------------------------------
export const istDate = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
export const addDays = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export type Preset = "today" | "yesterday" | "last7" | "last30";
export function presetRange(p: Preset, now = new Date()): { from: string; to: string } {
  const today = istDate(now);
  if (p === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (p === "last7") return { from: addDays(today, -6), to: today };
  if (p === "last30") return { from: addDays(today, -29), to: today };
  return { from: today, to: today };
}

// ---------------------------------------------------------------------------
// Durations: server timestamp differences only
// ---------------------------------------------------------------------------
export function durationS(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const s = (Date.parse(to) - Date.parse(from)) / 1000;
  return Number.isFinite(s) && s >= 0 ? Math.round(s) : null;
}

/** "Completed" endpoints use endedAt only when the hold actually ended in completion. */
export function missionDurations(m: DriverMission): { label: string; seconds: number | null }[] {
  const completedAt = m.outcome === "completed" ? m.endedAt : null;
  const segments: [string, string | null, string | null][] = [
    ["Offer received → accepted", m.offeredAt, m.acceptedAt],
    ["Accepted → on scene", m.acceptedAt, m.onSceneAt],
    ["On scene → transport started", m.onSceneAt, m.transportAt],
    ["Transport started → hospital arrival", m.transportAt, m.hospitalAt],
    ["Transport started → completed", m.transportAt, completedAt],
    ["Hospital arrival → completed", m.hospitalAt, completedAt],
    ["Total (accepted → end of assignment)", m.acceptedAt, m.endedAt],
  ];
  return segments.map(([label, a, b]) => ({ label, seconds: durationS(a, b) }));
}

export const NOT_RECORDED = "Not recorded";
export function fmtDuration(s: number | null | undefined): string {
  if (s == null) return NOT_RECORDED;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : m ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
}

export const fmtInr = (n: number | null | undefined): string => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
export const fmtKm = (n: number | null | undefined): string => (n == null ? "—" : `${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })} km`);
export const fmtIst = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "medium" }) : NOT_RECORDED;

export const OUTCOME_LABEL: Record<Outcome, string> = {
  completed: "Completed",
  cancelled: "Cancelled while assigned",
  released: "Released before pickup (re-dispatched)",
  in_progress: "In progress",
};
