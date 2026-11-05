import { create } from "zustand";
import { careLevelFromVehicleType, type AIS125VehicleType } from "@sahayak/domain";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings.ts";
import { useDriverLifecycleStore, getServerAdapter } from "./driverLifecycle.store.ts";
import { isProfileLocked } from "./driverAvailability.core.ts";
import { IS_TEST_RUNNER } from "../config/env.ts";
import type { LocationIssue } from "../services/backgroundLocation.core.ts";

// Synthetic demo identity for the NODE TEST RUNNER ONLY (never a phone, dev build included). With a verified session the real user id is used and the server
// (set_driver_presence -> `not_verified`) is the verification gate. The existing tests keep their seeded state (IS_TEST_RUNNER).
const DEMO_DRIVER_ID = "DRV-DEMO-0001";
const DEMO_AMBULANCE_ID = "AMB-DEMO-0001";
const DEMO_AIS125_CERT_PATH = "storage/certs/demo-driver-kyc.pdf";
// The machine's GO_ONLINE guard wants a non-empty certificate path; against a real backend the check that matters is the
// server's (KYC approved, is_verified), so this marker only satisfies the local guard.
const SERVER_VERIFIED_MARKER = "server-verified";
// Same idea for ambulanceId: nothing reads it and it is never forwarded to setPresence or the wire publisher
// (GO_ONLINE is excluded there), so a real session must not carry the demo literal into its local context either.
const SERVER_AMBULANCE_MARKER = "server-managed";

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  heading: number;
  speedKmh: number;
  altitudeMeters: number;
  /** When the device measured this fix (ISO 8601). The server judges GPS freshness from it, not from when it was sent. */
  fixedAt?: string;
}

export interface DriverStandbyStoreState {
  isOnline: boolean;
  isTogglingPresence: boolean;
  language: SupportedLanguage;
  /** The map's starting point before the first real fix (hasRealFix false): never sent, never drawn as the driver. */
  gps: GpsCoordinates;
  /** The server profile's registered tier; null until it has loaded (never assumed). */
  registeredAis125Type: AIS125VehicleType | null;
  isOfflineModalOpen: boolean;
  /** True only once a real GPS fix has come in via setGps (useDriverLocation). Until then, `gps` is a city
   *  preset placeholder - with a real server session, going online is refused and the presence heartbeat sends
   *  nothing, rather than sending it as if it were the driver's real position. Dev builds included: a __DEV__
   *  build can hold a real session against a real project. Without a session the preset only drives the UI. */
  hasRealFix: boolean;
  /** The server's actual refusal reason for the last go-online attempt (e.g. "not_verified"), or a local
   *  "no_gps_fix" / LocationIssue when refused before ever reaching the server. Cleared on the next attempt. */
  presenceErrorCode: string | null;
  /** Set by useDriverLocation when permission or location services block the watcher; cleared by the next real fix. */
  locationIssue: LocationIssue | null;
  /** Bumped by a go-online attempt refused for lack of a fix: useDriverLocation restarts the watcher on it. */
  locationRetryNonce: number;

  // Actions
  toggleOnlineState: () => Promise<void>;
  confirmGoOffline: () => void;
  openOfflineModal: () => void;
  closeOfflineModal: () => void;
  /** The driver closed the refusal notice: UI only, the presence state is unchanged. */
  clearPresenceError: () => void;
  setGps: (gps: GpsCoordinates) => void;
  setLocationIssue: (issue: LocationIssue | null) => void;
  setAis125Type: (type: AIS125VehicleType) => void;
  toggleLanguage: () => void;
  setLanguage: (lang: SupportedLanguage) => void;
  recenterGps: () => void;
}

// The map's starting point until the first real fix (Noida): a camera position, not a driver position.
const NOIDA_COORDS: GpsCoordinates = {
  latitude: 28.5355,
  longitude: 77.391,
  accuracyMeters: 3.2,
  heading: 342,
  speedKmh: 0,
  altitudeMeters: 215,
};


/** What a presence heartbeat may send: the last real fix, or null before there is one (never a city preset). */
export function heartbeatLocation(s: Pick<DriverStandbyStoreState, "gps" | "hasRealFix">): GpsCoordinates | null {
  return s.hasRealFix ? s.gps : null;
}

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
  // Test runner only: every build on a phone starts offline and the driver must go online (which the server has to accept), instead
  // of being "online" and dispatchable under a demo identity before authentication or KYC (D4).
  if (IS_TEST_RUNNER) sendGoOnline("TYPE_D_ALS", NOIDA_COORDS);

  return {
  isOnline: IS_TEST_RUNNER,
  isTogglingPresence: false,
  language: "en",
  gps: NOIDA_COORDS,
  registeredAis125Type: IS_TEST_RUNNER ? "TYPE_D_ALS" : null,

  isOfflineModalOpen: false,
  hasRealFix: false,
  presenceErrorCode: null,
  locationIssue: null,
  locationRetryNonce: 0,

  toggleOnlineState: async () => {
    const { isOnline } = get();
    if (isOnline) {
      // Prompt confirmation modal before de-indexing from Redis
      set({ isOfflineModalOpen: true });
    } else {
      set({ isTogglingPresence: true, presenceErrorCode: null });
      const { registeredAis125Type, gps, hasRealFix } = get();
      const server = getServerAdapter();
      if (!registeredAis125Type) {
        set({ isTogglingPresence: false, presenceErrorCode: "profile_loading" });
        return;
      }
      if (server) {
        // A real session must never send the NOIDA_COORDS placeholder as if it were the driver's actual
        // position - refused client-side before it ever reaches set_driver_presence.
        // The tap doubles as a retry: the watcher may have given up (permission refused, location off, dialog declined).
        if (!hasRealFix) {
          const { locationIssue, locationRetryNonce } = get();
          set({
            isTogglingPresence: false,
            presenceErrorCode: locationIssue ?? "no_gps_fix",
            locationRetryNonce: locationRetryNonce + 1,
          });
          return;
        }
        // The server decides: an unverified driver, or one whose request cannot be recorded, does NOT become dispatchable.
        const result = await server.setPresence(true, gps, gps.fixedAt);
        if (!result.ok) {
          set({ isTogglingPresence: false, presenceErrorCode: result.error.code });
          return;
        }
      } else if (!IS_TEST_RUNNER) {
        // A release build with no session must refuse going online, not silently simulate success.
        set({ isTogglingPresence: false, presenceErrorCode: "no_session" });
        return;
      } else {
        // Test runner only: no server to ask.
        await new Promise((res) => setTimeout(res, 600));
      }
      sendGoOnline(registeredAis125Type, gps);

      set({ isOnline: true, isTogglingPresence: false });
    }
  },

  confirmGoOffline: () => {
    const server = getServerAdapter();
    if (server) void server.setPresence(false);
    useDriverLifecycleStore.getState().send({
      type: "GO_OFFLINE",
      payload: { driverId: server?.userId ?? DEMO_DRIVER_ID, wentOfflineAt: new Date().toISOString() },
    });
    set({ isOnline: false, isOfflineModalOpen: false });
  },

  setGps: (gps) => set({ gps, hasRealFix: true, locationIssue: null }),
  setLocationIssue: (issue) => set({ locationIssue: issue }),
  openOfflineModal: () => set({ isOfflineModalOpen: true }),
  closeOfflineModal: () => set({ isOfflineModalOpen: false }),
  clearPresenceError: () => set({ presenceErrorCode: null }),

  setAis125Type: (type) => {
    if (isProfileLocked(useDriverLifecycleStore.getState().currentState)) return;
    set({ registeredAis125Type: type });
  },

  toggleLanguage: () =>
    set((state) => ({ language: state.language === "en" ? "hi" : "en" })),

  setLanguage: (lang) => set({ language: lang }),

  // Without a session (test runner only) there is no live fix: back to the map's starting point. With a real session `gps`
  // already holds the last real fix - recentering the camera on it is the map component's job, never a preset overwrite.
  recenterGps: () => {
    if (getServerAdapter()) return;
    set({ gps: NOIDA_COORDS });
  },
  };
});
