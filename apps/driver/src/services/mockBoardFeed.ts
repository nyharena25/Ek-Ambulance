import { DISPATCH_CONFIG, boardBand, type AIS125VehicleType, type BoardEmergency, type BoardSnapshot, type GeoPoint, type UrgencyTierName } from "@sahayak/domain";
import { distanceKm } from "../hooks/hospitalSelection.core.ts";

/**
 * Development stand-in for `list_nearby_emergencies` (used only when there is no verified server session, and never in a
 * release build). It applies the same visibility rule the server does (`boardBand`), so a mock emergency moves from hidden to
 * red to overdue as it ages, and a driver who moves sees the bands change.
 */

export interface MockEmergency {
  missionId: string;
  createdAtMs: number;
  pickup: GeoPoint;
  address: string;
  complaint: string;
  urgency: UrgencyTierName;
}

// [km from origin, bearing deg, age s at seed, urgency, complaint, address]
const SEED: ReadonlyArray<[number, number, number, UrgencyTierName, string, string]> = [
  [1.4, 30, 200, "CAT_1_IMMEDIATE", "Chest pain, sweating", "Sector 62 Main Road, Noida"],
  [2.6, 120, 30, "CAT_2_URGENT", "Road accident, leg injury", "Botanical Garden Metro, Sector 38A"],
  [3.7, 250, 8, "CAT_1_IMMEDIATE", "Difficulty breathing", "Sector 18 Market, Noida"],
  [4.8, 75, 120, "CAT_2_URGENT", "Fall from height", "Sector 76 Gate 2, Noida"],
  [5.9, 310, 65, "CAT_1_IMMEDIATE", "Unconscious, not responding", "Film City Road, Sector 16A"],
  [6.6, 190, 20, "CAT_3_DELAYED", "High fever, elderly patient", "Sector 44 Community Centre"],
  [8.3, 20, 100, "CAT_2_URGENT", "Severe bleeding", "Expressway Service Road, Sector 93"],
  [8.9, 220, 40, "CAT_1_IMMEDIATE", "Suspected stroke", "Pari Chowk, Greater Noida"],
];

const KM_PER_DEG_LAT = 111.2;

export function seedMockEmergencies(origin: GeoPoint, nowMs: number): MockEmergency[] {
  return SEED.map(([km, bearing, ageS, urgency, complaint, address], i) => {
    const rad = (bearing * Math.PI) / 180;
    return {
      missionId: `mock-emergency-${i + 1}`,
      createdAtMs: nowMs - ageS * 1000,
      pickup: {
        latitude: origin.latitude + (km * Math.cos(rad)) / KM_PER_DEG_LAT,
        longitude: origin.longitude + (km * Math.sin(rad)) / (KM_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180)),
      },
      address,
      complaint,
      urgency,
    };
  });
}

/** What the server would answer this driver right now. `taken` are emergencies already claimed in this dev session. */
export function mockBoardSnapshot(
  gps: GeoPoint,
  emergencies: readonly MockEmergency[],
  taken: ReadonlySet<string>,
  vehicleType: AIS125VehicleType,
  nowMs: number
): BoardSnapshot {
  const items: BoardEmergency[] = [];
  for (const e of emergencies) {
    if (taken.has(e.missionId)) continue;
    const km = distanceKm(gps, e.pickup);
    const band = boardBand(km, (nowMs - e.createdAtMs) / 1000, false);
    if (!band) continue;
    items.push({
      missionId: e.missionId,
      createdAt: new Date(e.createdAtMs).toISOString(),
      dueAt: new Date(e.createdAtMs + DISPATCH_CONFIG.waveWindowSeconds * 1000).toISOString(),
      distanceKm: Math.round(km * 10) / 10,
      band,
      urgency: e.urgency,
      requiredVehicleType: vehicleType,
      pickup: { ...e.pickup, address: e.address },
      patientSummary: { primaryComplaint: e.complaint },
    });
  }
  return { serverNow: new Date(nowMs).toISOString(), items };
}
