import { create } from "zustand";
import {
  REALTIME_THRESHOLDS,
  initialRealtime,
  realtimeHealth,
  reduceRealtime,
  type RealtimeEvent,
  type RealtimeSnapshot,
  type RealtimeThresholds,
  type TransportHealth,
} from "@sahayak/domain";
import { AUTH_REQUIRED_REASON } from "../services/driverRealtime.ts";
import type { CentrifugoConnectionStatus } from "../types/driverConnection.types";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings";

/**
 * The driver app's one realtime connection state. Written only by the shared Centrifugo session's SDK callbacks
 * (applyTransport) and a confirmed presence heartbeat (recordHeartbeat); everything else is derived:
 *   health            from @sahayak/domain realtimeHealth with DRIVER_REALTIME_THRESHOLDS
 *   status            connecting / connected / reconnecting / disconnected / authRequired (statusFor)
 *   isFallbackActive  an active mission AND health "disconnected" - never a failed ping, a quiet channel, or a timer alone
 * Business availability (online/offline) lives in driverStandby.store and is never inferred from this.
 */
export interface DriverConnectionStoreState {
  realtime: RealtimeSnapshot;
  health: TransportHealth;
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

/**
 * The driver's thresholds, explicit. Grace 10 s: a shorter drop is a blip, nothing is shown. Fallback (store-and-forward +
 * SMS) only after 30 s of continuous down time. The shared attempt shortcut is off for the driver: the SDK retries from
 * 500 ms with exponential backoff, so 3 failed attempts were always reached inside the grace period and every 10 s cell
 * handoff in a moving ambulance flipped the app into fallback.
 */
export const DRIVER_REALTIME_THRESHOLDS: RealtimeThresholds = { ...REALTIME_THRESHOLDS, failAfterAttempts: Number.POSITIVE_INFINITY };

const healthAt = (realtime: RealtimeSnapshot, now: number) => realtimeHealth(realtime, now, DRIVER_REALTIME_THRESHOLDS);

function statusFor(realtime: RealtimeSnapshot, health: TransportHealth): CentrifugoConnectionStatus {
  // The SDK stopped because the server refused the credentials: only a fresh session (or sign-in) can fix that.
  if (realtime.connectionState === "disconnected" && realtime.lastError === AUTH_REQUIRED_REASON) return "authRequired";
  // Connected with no channel to hold (driver offline, no mission) is a healthy idle socket, not a degraded one.
  if (health === "healthy" || (realtime.connectionState === "connected" && realtime.subscriptionState === "unsubscribed")) return "connected";
  if (health === "disconnected") return "disconnected";
  return realtime.lastConnectedAt === null ? "connecting" : "reconnecting";
}

const derive = (realtime: RealtimeSnapshot, now: number, missionActive: boolean) => {
  const health = healthAt(realtime, now);
  // Fallback needs a real outage during a mission. authRequired keeps the store-and-forward data path (nothing can be
  // published without credentials either); the banner says why.
  const isFallbackActive = missionActive && health === "disconnected";
  return { health, isFallbackActive, status: statusFor(realtime, health) };
};

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
      // isFallbackActive is owned by evaluate(): flipping it here swallowed the "exited" transition, so the
      // store-and-forward queue was never flushed after a reconnect.
      const { health, status } = derive(realtime, now, missionActiveFlag);
      return {
        realtime,
        health,
        status,
        lastConnectedAt: realtime.lastConnectedAt ? new Date(realtime.lastConnectedAt).toISOString() : state.lastConnectedAt,
        error: event.type === "error" ? event.message : state.error,
      };
    }),

  recordHeartbeat: (now = Date.now()) => set((state) => ({ realtime: reduceRealtime(state.realtime, { type: "heartbeat" }, now) })),

  evaluate: (now, missionActive) => {
    missionActiveFlag = missionActive;
    const state = get();
    const next = derive(state.realtime, now, missionActive);
    const transition = next.isFallbackActive === state.isFallbackActive ? null : next.isFallbackActive ? "entered" : "exited";
    if (next.health !== state.health || next.status !== state.status || transition) set(next);
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
