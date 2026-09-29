import { create } from "zustand";
import { careLevelFromVehicleType, type AIS125VehicleType } from "@sahayak/domain";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings.ts";
import { useDriverLifecycleStore, getServerAdapter } from "./driverLifecycle.store.ts";
import { isProfileLocked } from "./driverAvailability.core.ts";

// Synthetic demo identity for LOCAL DEVELOPMENT ONLY. With a verified session the real user id is used and the server
// (set_driver_presence -> `not_verified`) is the verification gate. `IS_DEV` is true under the node test runner, where
// `__DEV__` does not exist, so the existing tests keep their seeded state.
const IS_DEV = typeof __DEV__ === "undefined" || __DEV__;
const DEMO_DRIVER_ID = "DRV-DEMO-0001";
const DEMO_AMBULANCE_ID = "AMB-DEMO-0001";
const DEMO_AIS125_CERT_PATH = "storage/certs/demo-driver-kyc.pdf";
// The machine's GO_ONLINE guard wants a non-empty certificate path; against a real backend the check that matters is the
// server's (KYC approved, is_verified), so this marker only satisfies the local guard.
const SERVER_VERIFIED_MARKER = "server-verified";
// Same idea for ambulanceId: nothing reads it and it is never forwarded to setPresence or the wire publisher
// (GO_ONLINE is excluded there), so a real session must not carry the demo literal into its local context either.
const SERVER_AMBULANCE_MARKER = "server-managed";

export type JurisdictionCode = "UP_NOIDA" | "DL_SOUTH";

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  heading: number;
  speedKmh: number;
  altitudeMeters: number;
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
  registeredAis125Type: AIS125VehicleType;
  redisPresence: RedisPresenceTelemetry;
  isOfflineModalOpen: boolean;
  /** True only once a real GPS fix has come in via setGps (useDriverLocation). Until then, `gps` is a city
   *  preset placeholder - with a real server session, going online is refused rather than sending it as if
   *  it were the driver's real position. Always true in __DEV__/no-session (the preset stands in on purpose). */
  hasRealFix: boolean;
  /** The server's actual refusal reason for the last go-online attempt (e.g. "not_verified"), or a local
   *  "no_gps_fix" when refused before ever reaching the server. Cleared on the next attempt. */
  presenceErrorCode: string | null;

  // Actions
  toggleOnlineState: () => Promise<void>;
  confirmGoOffline: () => void;
  openOfflineModal: () => void;
  closeOfflineModal: () => void;
  setGps: (gps: GpsCoordinates) => void;
  setJurisdiction: (jur: JurisdictionCode) => void;
  setAis125Type: (type: AIS125VehicleType) => void;
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
  const server = getServerAdapter();
  useDriverLifecycleStore.getState().send({
    type: "GO_ONLINE",
    payload: {
      driverId: server?.userId ?? DEMO_DRIVER_ID,
      ambulanceId: server ? SERVER_AMBULANCE_MARKER : DEMO_AMBULANCE_ID,
      careLevel: careLevelFromVehicleType(ais125Type),
      ais125CertPath: server ? SERVER_VERIFIED_MARKER : DEMO_AIS125_CERT_PATH,
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
  // Development only: a release build starts offline and the driver must go online (which the server has to accept), instead
  // of being "online" and dispatchable under a demo identity before authentication or KYC (D4).
  if (IS_DEV) sendGoOnline("TYPE_D_ALS", NOIDA_COORDS);

  return {
  isOnline: IS_DEV,
  isTogglingPresence: false,
  shiftStartedAt: "07:30 AM",
  language: "en",
  currentJurisdiction: "UP_NOIDA",
  gps: NOIDA_COORDS,
  registeredAis125Type: "TYPE_D_ALS",
  redisPresence: {
    geoKey: "ambulances:geo:tier_d",
    isIndexed: true,
    ttlSeconds: 60,
    lastPingMs: 42,
    syncIntervalSec: 3,
  },
  isOfflineModalOpen: false,
  hasRealFix: IS_DEV,
  presenceErrorCode: null,

  toggleOnlineState: async () => {
    const { isOnline } = get();
    if (isOnline) {
      // Prompt confirmation modal before de-indexing from Redis
      set({ isOfflineModalOpen: true });
    } else {
      set({ isTogglingPresence: true, presenceErrorCode: null });
      const { registeredAis125Type, gps, hasRealFix } = get();
      const server = getServerAdapter();
      if (server) {
        // A real session must never send the NOIDA_COORDS placeholder as if it were the driver's actual
        // position - refused client-side before it ever reaches set_driver_presence.
        if (!hasRealFix) {
          set({ isTogglingPresence: false, presenceErrorCode: "no_gps_fix" });
          return;
        }
        // The server decides: an unverified driver, or one whose request cannot be recorded, does NOT become dispatchable.
        const result = await server.setPresence(true, gps);
        if (!result.ok) {
          set({ isTogglingPresence: false, presenceErrorCode: result.error.code });
          return;
        }
      } else if (!IS_DEV) {
        // A release build with no session must refuse going online, not silently simulate success.
        set({ isTogglingPresence: false, presenceErrorCode: "no_session" });
        return;
      } else {
        // Local development: the former simulated GEOADD delay.
        await new Promise((res) => setTimeout(res, 600));
      }
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
    const server = getServerAdapter();
    if (server) void server.setPresence(false);
    useDriverLifecycleStore.getState().send({
      type: "GO_OFFLINE",
      payload: { driverId: server?.userId ?? DEMO_DRIVER_ID, wentOfflineAt: new Date().toISOString() },
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

  setGps: (gps) => set({ gps, hasRealFix: true }),
  openOfflineModal: () => set({ isOfflineModalOpen: true }),
  closeOfflineModal: () => set({ isOfflineModalOpen: false }),

  setJurisdiction: (jur) => {
    // The service area is part of the profile, which is frozen from the offer to the end of the mission.
    if (isProfileLocked(useDriverLifecycleStore.getState().currentState)) return;
    // A real GPS fix must never be overwritten by a city preset just because the driver tapped a
    // jurisdiction chip - useDriverLocation is the only thing that may move `gps` once it's real.
    const preset = getServerAdapter() ? {} : { gps: jur === "UP_NOIDA" ? NOIDA_COORDS : SOUTH_DELHI_COORDS };
    set({ currentJurisdiction: jur, ...preset });
  },

  setAis125Type: (type) => {
    if (isProfileLocked(useDriverLifecycleStore.getState().currentState)) return;
    set((state) => ({
      registeredAis125Type: type,
      redisPresence: {
        ...state.redisPresence,
        geoKey: `ambulances:geo:${type.toLowerCase()}`,
      },
    }));
  },

  toggleLanguage: () =>
    set((state) => ({ language: state.language === "en" ? "hi" : "en" })),

  setLanguage: (lang) => set({ language: lang }),

  // Dev-only: without a real session there's no live fix to recenter on, so this jumps back to the
  // jurisdiction's preset. With a real session, `gps` already holds the last real fix - recentering the
  // camera on it is the map component's job, not a reason to overwrite real data with a preset.
  recenterGps: () => {
    if (getServerAdapter()) return;
    const { currentJurisdiction } = get();
    set({
      gps: currentJurisdiction === "UP_NOIDA" ? NOIDA_COORDS : SOUTH_DELHI_COORDS,
    });
  },
  };
});
