import { create } from "zustand";
import { getServerAdapter, useDriverLifecycleStore } from "./driverLifecycle.store.ts";
import { useDriverStandbyStore } from "./driverStandby.store.ts";
import { useDriverOnboardingStore } from "./driverOnboarding.store.ts";
import { isProfileLocked } from "./driverAvailability.core.ts";
import {
  type DriverProfile,
  type DriverProfilePatch,
  type ServiceZone,
} from "../lib/driverProfile.core.ts";

/**
 * The driver's profile: name, phone, service area, hospital and vehicle. With a verified session it is the server's
 * (`get_driver_profile` / `update_driver_profile`, which refuses a change mid-mission). Without one, in a development build,
 * it is seeded from the mock login and kept locally. The lock is applied here as well as on the server, so the UI never
 * offers an edit the server will refuse (invariant 3: read from the lifecycle machine, not a flag).
 */

const IS_TEST_RUNNER = typeof __DEV__ === "undefined";

export type SaveResult = { ok: true } | { ok: false; code: string };

export interface DriverProfileState {
  profile: DriverProfile | null;
  status: "idle" | "loading" | "ready" | "error";
  errorCode: string | null;
  /** The server's or the network's own wording for errorCode, shown on the load-failure screen so the cause is visible. */
  errorDetail?: string;
  load: () => Promise<void>;
  /** `hospitalName` is only used by the local (development) path: the server resolves it from the hospitals table. */
  save: (patch: DriverProfilePatch, hospitalName?: string | null) => Promise<SaveResult>;
  /** Development mock login: the phone, tier and service area the chosen dev driver has. */
  seedDev: (dev: { phone: string; serviceZone: ServiceZone }) => void;
}

/** What the rest of the app reads from the profile, kept in step so the standby header and the offer screen agree with it. */
function syncStandby(profile: DriverProfile): void {
  const standby = useDriverStandbyStore.getState();
  // The service zone is read from the profile itself (standby card, profile screen): no second copy is kept.
  if (profile.ais125Type && profile.ais125Type !== standby.registeredAis125Type) standby.setAis125Type(profile.ais125Type);
}

function applyPatch(profile: DriverProfile, patch: DriverProfilePatch, hospitalName?: string | null): DriverProfile {
  const v = patch.vehicle ?? {};
  return {
    ...profile,
    fullName: patch.fullName ?? profile.fullName,
    serviceZone: patch.serviceZone ?? profile.serviceZone,
    hospitalId: patch.hospitalId === undefined ? profile.hospitalId : patch.hospitalId,
    hospitalName: patch.hospitalId === undefined ? profile.hospitalName : patch.hospitalId === null ? null : (hospitalName ?? profile.hospitalName),
    vehicle: {
      ...profile.vehicle,
      registrationNumber: v.registrationNumber ?? profile.vehicle.registrationNumber,
      makeModel: v.makeModel ?? profile.vehicle.makeModel,
      color: v.color ?? profile.vehicle.color,
      crewCount: v.crewCount ?? profile.vehicle.crewCount,
    },
  };
}

export const useDriverProfileStore = create<DriverProfileState>((set, get) => ({
  profile: null,
  status: "idle",
  errorCode: null,

  load: async () => {
    const server = getServerAdapter();
    if (!server) {
      // Test runner only: the seeded profile the store tests build on. A phone with no session shows no profile.
      if (!get().profile && IS_TEST_RUNNER) get().seedDev({ phone: "+919876543210", serviceZone: "UP" });
      set({ status: "ready", errorCode: null });
      return;
    }
    set({ status: "loading" });
    const result = await server.fetchProfile();
    if (!result.ok) return set({ status: "error", errorCode: result.error.code, errorDetail: result.error.detail });
    set({ profile: result.data, status: "ready", errorCode: null });
    syncStandby(result.data);
  },

  save: async (patch, hospitalName) => {
    if (isProfileLocked(useDriverLifecycleStore.getState().currentState)) return { ok: false, code: "profile_locked" };
    const current = get().profile;
    if (!current) return { ok: false, code: "not_loaded" };
    const server = getServerAdapter();
    if (server) {
      const result = await server.saveProfile(patch);
      if (!result.ok) return { ok: false, code: result.error.code };
      set({ profile: result.data });
      syncStandby(result.data);
      return { ok: true };
    }
    if (!IS_TEST_RUNNER) return { ok: false, code: "no_session" };
    const next = applyPatch(current, patch, hospitalName);
    set({ profile: next });
    syncStandby(next);
    return { ok: true };
  },

  seedDev: ({ phone, serviceZone }) => {
    const standby = useDriverStandbyStore.getState();
    const form = useDriverOnboardingStore.getState().formData;
    set({
      profile: {
        fullName: "Rajesh Sharma",
        phone,
        serviceZone,
        hospitalId: null,
        hospitalName: null,
        ais125Type: standby.registeredAis125Type,
        kycStatus: "approved",
        regulatedEditable: false,
        vehicle: { registrationNumber: form.vehicleRegistrationNumber, makeModel: form.makeModel, manufactureYear: Number(form.manufactureYear) || null, color: "White", crewCount: 3 },
      },
      status: "ready",
      errorCode: null,
    });
  },
}));
