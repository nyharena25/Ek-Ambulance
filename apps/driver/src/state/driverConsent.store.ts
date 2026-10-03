import { create } from "zustand";
import { fetchDriverConsents, recordDriverConsent } from "../lib/driverServer";
import {
  DRIVER_CONSENT_NOTICE_VERSION,
  DRIVER_CONSENT_PURPOSES,
  hasCurrentDriverConsent,
  type DriverConsentGate,
} from "../hooks/otpAuth.core";

/**
 * The signed-in driver's DPDP consent, read from the server (consent_records) once per account. Loaded by useServerSync when
 * the user id changes - never on a token refresh - and cleared on sign-out. Route gate input (authRedirectTarget).
 */
interface DriverConsentState {
  userId: string | null;
  gate: DriverConsentGate;
  load: (userId: string) => Promise<void>;
  /** Records every driver purpose, then re-reads: the gate opens only on the server's own records. */
  grant: (locale: "en" | "hi") => Promise<boolean>;
  reset: () => void;
}

export const useDriverConsentStore = create<DriverConsentState>((set, get) => {
  // Reads without first clearing the gate, so re-reading after a grant does not bounce the consent screen.
  const read = async (userId: string) => {
    const result = await fetchDriverConsents(userId);
    if (get().userId !== userId) return; // signed out or switched account meanwhile
    set({ gate: result.ok ? (hasCurrentDriverConsent(result.data) ? "granted" : "required") : "error" });
  };
  return {
    userId: null,
    gate: "unknown",
    load: async (userId) => {
      set({ userId, gate: "unknown" });
      await read(userId);
    },
    grant: async (locale) => {
      const userId = get().userId;
      if (!userId) return false;
      const results = await Promise.all(
        DRIVER_CONSENT_PURPOSES.map((p) => recordDriverConsent(p, DRIVER_CONSENT_NOTICE_VERSION, true, locale)),
      );
      // A failed write leaves the screen as it is (the driver retries); the gate never opens on the client's say-so.
      if (get().userId !== userId || !results.every((r) => r.ok)) return false;
      await read(userId);
      return get().gate === "granted";
    },
    reset: () => set({ userId: null, gate: "unknown" }),
  };
});
