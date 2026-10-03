import { create } from "zustand";
import {
  initialRealtime,
  realtimeHealth,
  reduceRealtime,
  type RealtimeEvent,
  type RealtimeSnapshot,
  type TransportHealth,
} from "@sahayak/domain";
import type { CentrifugoConnectionStatus } from "../types/driverConnection.types";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings";

/**
 * The driver app's one realtime connection state. Written only by the shared Centrifugo session's SDK callbacks
 * (applyTransport) and a confirmed presence heartbeat (recordHeartbeat); everything else is derived:
 *   health            from @sahayak/domain realtimeHealth (grace period, failure threshold)
 *   isFallbackActive  an active mission AND health "disconnected" - never a failed ping, a quiet channel, or a timer alone
 * Business availability (online/offline) lives in driverStandby.store and is never inferred from this.
 */
export interface DriverConnectionStoreState {
  realtime: RealtimeSnapshot;
  health: TransportHealth;
  /** For the existing UI: connected / connecting / disconnected, or fallback while the store-and-forward path is active. */
  status: CentrifugoConnectionStatus;
  isFallbackActive: boolean;
  queuedPingsCount: number;
  lastSyncedCount: number;
  showRestoredBanner: boolean;
  lastConnectedAt: string | null;
  language: SupportedLanguage;
  error: string | null;

  applyTransport: (event: RealtimeEvent, now?: number) => void;
  recordHeartbeat: (now?: number) => void;
  /** Re-derives health (it depends on elapsed time). Returns the fallback transition, if any, so the caller can flush. */
  evaluate: (now: number, missionActive: boolean) => "entered" | "exited" | null;
  setQueuedPingsCount: (count: number) => void;
  markRestored: (syncedCount: number) => void;
  dismissRestoredBanner: () => void;
  setLanguage: (language: SupportedLanguage) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const statusFor = (health: TransportHealth, fallback: boolean): CentrifugoConnectionStatus =>
  fallback ? "fallback" : health === "healthy" ? "connected" : health === "disconnected" ? "disconnected" : "connecting";

const initial = () => ({
  realtime: initialRealtime(),
  health: "disconnected" as TransportHealth,
  status: "disconnected" as CentrifugoConnectionStatus,
  isFallbackActive: false,
  queuedPingsCount: 0,
  lastSyncedCount: 0,
  showRestoredBanner: false,
  lastConnectedAt: null,
  language: "en" as SupportedLanguage,
  error: null,
});

let missionActiveFlag = false;

export const useDriverConnectionStore = create<DriverConnectionStoreState>((set, get) => ({
  ...initial(),

  applyTransport: (event, now = Date.now()) =>
    set((state) => {
      const realtime = reduceRealtime(state.realtime, event, now);
      const health = realtimeHealth(realtime, now);
      const isFallbackActive = missionActiveFlag && health === "disconnected";
      return {
        realtime,
        health,
        isFallbackActive,
        status: statusFor(health, isFallbackActive),
        lastConnectedAt: realtime.lastConnectedAt ? new Date(realtime.lastConnectedAt).toISOString() : state.lastConnectedAt,
        error: event.type === "error" ? event.message : state.error,
      };
    }),

  recordHeartbeat: (now = Date.now()) => set((state) => ({ realtime: reduceRealtime(state.realtime, { type: "heartbeat" }, now) })),

  evaluate: (now, missionActive) => {
    missionActiveFlag = missionActive;
    const state = get();
    const health = realtimeHealth(state.realtime, now);
    const isFallbackActive = missionActive && health === "disconnected";
    const transition = isFallbackActive === state.isFallbackActive ? null : isFallbackActive ? "entered" : "exited";
    if (health !== state.health || transition) set({ health, isFallbackActive, status: statusFor(health, isFallbackActive) });
    return transition;
  },

  setQueuedPingsCount: (queuedPingsCount) => set({ queuedPingsCount }),

  markRestored: (syncedCount) => set({ lastSyncedCount: syncedCount, showRestoredBanner: true }),

  dismissRestoredBanner: () => set({ showRestoredBanner: false, lastSyncedCount: 0 }),

  setLanguage: (language) => set({ language }),

  setError: (error) => set({ error }),

  reset: () => {
    missionActiveFlag = false;
    set(initial());
  },
}));
