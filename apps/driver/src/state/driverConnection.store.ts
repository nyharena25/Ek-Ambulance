import { create } from "zustand";
import type { CentrifugoConnectionStatus } from "../types/driverConnection.types";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings";

export interface DriverConnectionStoreState {
  status: CentrifugoConnectionStatus;
  isFallbackActive: boolean;
  queuedPingsCount: number;
  lastSyncedCount: number;
  showRestoredBanner: boolean;
  lastConnectedAt: string | null;
  language: SupportedLanguage;
  error: string | null;

  setConnectionStatus: (status: CentrifugoConnectionStatus) => void;
  setFallbackActive: (active: boolean) => void;
  setQueuedPingsCount: (count: number) => void;
  markRestored: (syncedCount: number) => void;
  dismissRestoredBanner: () => void;
  setLanguage: (language: SupportedLanguage) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useDriverConnectionStore = create<DriverConnectionStoreState>((set) => ({
  status: "connected",
  isFallbackActive: false,
  queuedPingsCount: 0,
  lastSyncedCount: 0,
  showRestoredBanner: false,
  lastConnectedAt: null,
  language: "en",
  error: null,

  setConnectionStatus: (status) =>
    set((state) => {
      const isFallback = status === "disconnected" || status === "fallback";
      return {
        status,
        isFallbackActive: isFallback,
        lastConnectedAt: status === "connected" ? new Date().toISOString() : state.lastConnectedAt,
      };
    }),

  setFallbackActive: (isFallbackActive) =>
    set({
      isFallbackActive,
      status: isFallbackActive ? "fallback" : "connected",
    }),

  setQueuedPingsCount: (queuedPingsCount) => set({ queuedPingsCount }),

  markRestored: (syncedCount) =>
    set({
      status: "connected",
      isFallbackActive: false,
      lastSyncedCount: syncedCount,
      showRestoredBanner: true,
      lastConnectedAt: new Date().toISOString(),
    }),

  dismissRestoredBanner: () => set({ showRestoredBanner: false, lastSyncedCount: 0 }),

  setLanguage: (language) => set({ language }),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      status: "connected",
      isFallbackActive: false,
      queuedPingsCount: 0,
      lastSyncedCount: 0,
      showRestoredBanner: false,
      lastConnectedAt: null,
      language: "en",
      error: null,
    }),
}));
