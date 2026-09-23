import { create } from "zustand";
import { careLevelFromVehicleType, type AIS125VehicleType } from "@sahayak/domain";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings.ts";
import { useDriverLifecycleStore } from "./driverLifecycle.store.ts";

// Synthetic demo identity - no real driver/vehicle IDs exist yet (P04's
// presence endpoint, which would issue these from an authenticated session,
// is still a stub). Named placeholders, not silently blank, same pattern as
// other demo constants already in this codebase (e.g. patient's PAT-DEMO-0001).
const DEMO_DRIVER_ID = "DRV-DEMO-0001";
const DEMO_AMBULANCE_ID = "AMB-DEMO-0001";
const DEMO_AIS125_CERT_PATH = "storage/certs/demo-driver-kyc.pdf";

export type JurisdictionCode = "UP_NOIDA" | "DL_SOUTH";

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  heading: number;
  speedKmh: number;
  altitudeMeters: number;
}

export interface BatteryStatus {
  percentage: number;
  isCharging: boolean;
  temperatureC: number;
}

export interface GpsQualityStatus {
  status: "EXCELLENT" | "GOOD" | "POOR";
  satellitesLocked: number;
  provider: string;
}

export interface DailyShiftMetrics {
  completedMissions: number;
  onlineMinutes: number;
  distanceKm: number;
  revenueInr: number;
}

export interface RedisPresenceTelemetry {
  geoKey: string;
  isIndexed: boolean;
  ttlSeconds: number;
  lastPingMs: number;
  syncIntervalSec: number;
}

export interface DriverStandbyStoreState {
  isOnline: boolean;
  isTogglingPresence: boolean;
  shiftStartedAt: string | null;
  language: SupportedLanguage;
  currentJurisdiction: JurisdictionCode;
  gps: GpsCoordinates;
  battery: BatteryStatus;
  gpsQuality: GpsQualityStatus;
  dailyMetrics: DailyShiftMetrics;
  registeredAis125Type: AIS125VehicleType;
  redisPresence: RedisPresenceTelemetry;
  isOfflineModalOpen: boolean;

  // Actions
  toggleOnlineState: () => Promise<void>;
  confirmGoOffline: () => void;
  openOfflineModal: () => void;
  closeOfflineModal: () => void;
  setGps: (gps: GpsCoordinates) => void;
  setJurisdiction: (jur: JurisdictionCode) => void;
  setAis125Type: (type: AIS125VehicleType) => void;
  toggleCharging: () => void;
  toggleLowBatterySimulation: () => void;
  toggleLanguage: () => void;
  setLanguage: (lang: SupportedLanguage) => void;
  recenterGps: () => void;
}

// Coordinate presets:
// Gautam Buddha Nagar (Noida Sector 62 / Fortis / Jaypee corridor)
const NOIDA_COORDS: GpsCoordinates = {
  latitude: 28.5355,
  longitude: 77.391,
  accuracyMeters: 3.2,
  heading: 342,
  speedKmh: 0,
  altitudeMeters: 215,
};

// South Delhi (AIIMS Trauma Centre / Saket / Hauz Khas corridor)
const SOUTH_DELHI_COORDS: GpsCoordinates = {
  latitude: 28.5672,
  longitude: 77.21,
  accuracyMeters: 2.8,
  heading: 18,
  speedKmh: 0,
  altitudeMeters: 228,
};

function sendGoOnline(ais125Type: AIS125VehicleType, location: GpsCoordinates) {
  useDriverLifecycleStore.getState().send({
    type: "GO_ONLINE",
    payload: {
      driverId: DEMO_DRIVER_ID,
      ambulanceId: DEMO_AMBULANCE_ID,
      careLevel: careLevelFromVehicleType(ais125Type),
      ais125CertPath: DEMO_AIS125_CERT_PATH,
      location,
      wentOnlineAt: new Date().toISOString(),
    },
  });
}

export const useDriverStandbyStore = create<DriverStandbyStoreState>((set, get) => {
  // Seed the driver lifecycle machine (packages/domain) into "standby" to
  // match this store's own demo default (isOnline: true) - without this,
  // SERVER_OFFER_RECEIVED would silently no-op against a machine stuck in
  // "offline" (illegal transitions are rejected by design, not a bug).
  sendGoOnline("TYPE_D_ALS", NOIDA_COORDS);

  return {
  isOnline: true,
  isTogglingPresence: false,
  shiftStartedAt: "07:30 AM",
  language: "en",
  currentJurisdiction: "UP_NOIDA",
  gps: NOIDA_COORDS,
  battery: {
    percentage: 88,
    isCharging: true,
    temperatureC: 28,
  },
  gpsQuality: {
    status: "EXCELLENT",
    satellitesLocked: 14,
    provider: "NavIC / IRNSS + GPS GLONASS",
  },
  dailyMetrics: {
    completedMissions: 4,
    onlineMinutes: 342, // 5 hours 42 mins
    distanceKm: 68.4,
    revenueInr: 3450,
  },
  registeredAis125Type: "TYPE_D_ALS",
  redisPresence: {
    geoKey: "ambulances:geo:tier_d",
    isIndexed: true,
    ttlSeconds: 60,
    lastPingMs: 42,
    syncIntervalSec: 3,
  },
  isOfflineModalOpen: false,

  toggleOnlineState: async () => {
    const { isOnline } = get();
    if (isOnline) {
      // Prompt confirmation modal before de-indexing from Redis
      set({ isOfflineModalOpen: true });
    } else {
      // Going online: trigger simulated Redis GEOADD
      set({ isTogglingPresence: true });
      await new Promise((res) => setTimeout(res, 600));

      const { registeredAis125Type, gps } = get();
      sendGoOnline(registeredAis125Type, gps);

      set((state) => ({
        isOnline: true,
        isTogglingPresence: false,
        shiftStartedAt: state.shiftStartedAt || "Just now",
        redisPresence: {
          ...state.redisPresence,
          isIndexed: true,
          lastPingMs: Math.floor(35 + Math.random() * 20),
        },
      }));
    }
  },

  confirmGoOffline: () => {
    useDriverLifecycleStore.getState().send({
      type: "GO_OFFLINE",
      payload: { driverId: DEMO_DRIVER_ID, wentOfflineAt: new Date().toISOString() },
    });
    set({
      isOnline: false,
      isOfflineModalOpen: false,
      redisPresence: {
        ...get().redisPresence,
        isIndexed: false,
      },
    });
  },

  setGps: (gps) => set({ gps }),
  openOfflineModal: () => set({ isOfflineModalOpen: true }),
  closeOfflineModal: () => set({ isOfflineModalOpen: false }),

  setJurisdiction: (jur) => {
    set({
      currentJurisdiction: jur,
      gps: jur === "UP_NOIDA" ? NOIDA_COORDS : SOUTH_DELHI_COORDS,
    });
  },

  setAis125Type: (type) =>
    set((state) => ({
      registeredAis125Type: type,
      redisPresence: {
        ...state.redisPresence,
        geoKey: `ambulances:geo:${type.toLowerCase()}`,
      },
    })),

  toggleCharging: () =>
    set((state) => ({
      battery: {
        ...state.battery,
        isCharging: !state.battery.isCharging,
      },
    })),

  toggleLowBatterySimulation: () =>
    set((state) => ({
      battery: {
        ...state.battery,
        percentage: state.battery.percentage > 25 ? 14 : 88,
        isCharging: state.battery.percentage > 25 ? false : true,
      },
    })),

  toggleLanguage: () =>
    set((state) => ({ language: state.language === "en" ? "hi" : "en" })),

  setLanguage: (lang) => set({ language: lang }),

  recenterGps: () => {
    const { currentJurisdiction } = get();
    set({
      gps: currentJurisdiction === "UP_NOIDA" ? NOIDA_COORDS : SOUTH_DELHI_COORDS,
    });
  },
  };
});
