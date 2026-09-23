import { fallbackRoute, type AIS125VehicleType, type GeoPoint, type UrgencyTier } from "@sahayak/domain";

/**
 * Dev-mode mock dispatch wave generator (Phase 2 Objective 4). Simulates
 * what a real Centrifugo `dispatch.offer` push (P05, still a channel stub)
 * would deliver, with realistic Delhi/NCR + UP pickup points so the offer
 * flow can be exercised end-to-end without a live dispatch service.
 */

export interface MockPickupPoint {
  district: string;
  jurisdiction: "DL" | "UP";
  latitude: number;
  longitude: number;
  address: string;
  landmark: string;
}

export interface MockDispatchOffer {
  offerId: string;
  missionId: string;
  acuity: UrgencyTier;
  requiredVehicleType: AIS125VehicleType;
  pickup: MockPickupPoint;
  distanceKm: number;
  etaMinutes: number;
}

const MOCK_PICKUP_POINTS: MockPickupPoint[] = [
  {
    district: "Noida",
    jurisdiction: "UP",
    latitude: 28.5355,
    longitude: 77.391,
    address: "Gate No. 3, Advant Navis Business Park, Sector 142, Noida",
    landmark: "Near Metro Pillar 142 • Main Entry Porch (Emergency Ramp Access)",
  },
  {
    district: "Greater Noida",
    jurisdiction: "UP",
    latitude: 28.4744,
    longitude: 77.504,
    address: "Pari Chowk, Greater Noida",
    landmark: "Near Pari Chowk Metro Station, Alpha 1 Commercial Belt",
  },
  {
    district: "Ghaziabad",
    jurisdiction: "UP",
    latitude: 28.6692,
    longitude: 77.4538,
    address: "Vaishali Sector 4, Ghaziabad",
    landmark: "Near Vaishali Metro Station, Main Market Road",
  },
  {
    district: "South Delhi",
    jurisdiction: "DL",
    latitude: 28.5672,
    longitude: 77.21,
    address: "Hauz Khas Village, South Delhi",
    landmark: "Near Deer Park Main Gate, Aurobindo Marg",
  },
  {
    district: "Central Delhi",
    jurisdiction: "DL",
    latitude: 28.6328,
    longitude: 77.2197,
    address: "Connaught Place Block A, New Delhi",
    landmark: "Near Rajiv Chowk Metro Gate 2",
  },
];

const DEFAULT_DRIVER_POSITION: GeoPoint = { latitude: 28.5355, longitude: 77.391 };

const ACUITY_TIERS: UrgencyTier[] = ["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"];
const VEHICLE_TYPES: AIS125VehicleType[] = ["TYPE_D_ALS", "TYPE_C_BLS", "TYPE_B_PTA", "TYPE_A_MFR"];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

export function generateMockDispatchOffer(driverPosition: GeoPoint = DEFAULT_DRIVER_POSITION): MockDispatchOffer {
  const idSuffix = Date.now().toString().slice(-6);
  const pickup = pickRandom(MOCK_PICKUP_POINTS);
  // Instant offline estimate; the offer screen upgrades it with a real OSRM route.
  const estimate = fallbackRoute(driverPosition, pickup);
  return {
    offerId: `OFFER-${idSuffix}`,
    missionId: `MSN-${idSuffix}`,
    acuity: pickRandom(ACUITY_TIERS),
    requiredVehicleType: pickRandom(VEHICLE_TYPES),
    pickup,
    distanceKm: estimate.distanceKm,
    etaMinutes: estimate.durationMin,
  };
}
