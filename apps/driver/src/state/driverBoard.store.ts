import { create } from "zustand";
import { estimateClockOffsetMs, sortOldestFirst, type BoardBand, type BoardEmergency } from "@sahayak/domain";
import { getServerAdapter } from "./driverLifecycle.store.ts";
import { useDriverStandbyStore } from "./driverStandby.store.ts";
import { mockBoardSnapshot, seedMockEmergencies, type MockEmergency } from "../services/mockBoardFeed.ts";

/**
 * The driver's Booking board. With a verified session it is the server's per-driver answer (`list_nearby_emergencies`);
 * without one, in a development build only, it is the mock feed. A release build with no session shows nothing rather than
 * a fabricated emergency (G-25). Sections are the server's `band`, never recomputed here: the server decides what this
 * driver may see.
 */

const IS_DEV = typeof __DEV__ === "undefined" || __DEV__;
export const BOARD_POLL_MS = 5_000;

export type BoardTab = Exclude<BoardBand, "fallback">;

export interface DriverBoardState {
  /** Oldest first, all bands. */
  items: BoardEmergency[];
  /** `serverNow - localNow` at the last refresh: timers count to the server's deadline, not the phone's clock. */
  clockOffsetMs: number;
  status: "idle" | "ready" | "error";
  errorCode: string | null;
  tab: BoardTab;
  pages: Record<BoardTab, number>;
  refresh: () => Promise<void>;
  setTab: (tab: BoardTab) => void;
  setPage: (tab: BoardTab, page: number) => void;
  /** Optimistic removal once this driver's claim is recorded. */
  markTaken: (missionId: string) => void;
}

export const itemsInBand = (items: readonly BoardEmergency[], band: BoardBand): BoardEmergency[] => items.filter((i) => i.band === band);

let mockEmergencies: MockEmergency[] | null = null;
const mockTaken = new Set<string>();

export const useDriverBoardStore = create<DriverBoardState>((set, get) => ({
  items: [],
  clockOffsetMs: 0,
  status: "idle",
  errorCode: null,
  tab: "green",
  pages: { green: 0, red: 0 },

  refresh: async () => {
    const standby = useDriverStandbyStore.getState();
    // Offline drivers are not in the pool: there is no board to show (the server answers the same).
    if (!standby.isOnline) {
      set({ items: [], status: "ready", errorCode: null });
      return;
    }
    const server = getServerAdapter();
    if (server) {
      const result = await server.fetchBoard();
      // A failed read keeps what is on screen: an emergency must not vanish because of a network blip.
      if (!result.ok) return set({ status: "error", errorCode: result.error.code });
      set({
        items: sortOldestFirst(result.data.items),
        clockOffsetMs: estimateClockOffsetMs(result.data.serverNow, Date.now()),
        status: "ready",
        errorCode: null,
      });
      return;
    }
    if (!IS_DEV) {
      set({ items: [], status: "ready", errorCode: null });
      return;
    }
    const now = Date.now();
    mockEmergencies ??= seedMockEmergencies(standby.gps, now);
    const snapshot = mockBoardSnapshot(standby.gps, mockEmergencies, mockTaken, standby.registeredAis125Type, now);
    set({ items: sortOldestFirst(snapshot.items), clockOffsetMs: 0, status: "ready", errorCode: null });
  },

  setTab: (tab) => set({ tab }),
  setPage: (tab, page) => set({ pages: { ...get().pages, [tab]: page } }),

  markTaken: (missionId) => {
    mockTaken.add(missionId);
    set({ items: get().items.filter((i) => i.missionId !== missionId) });
  },
}));

// One interval however many screens want the board (the Booking page and the standby fallback card both do).
let watchers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** Starts polling; returns the stop function. The first refresh is immediate. */
export function startBoardPolling(intervalMs: number = BOARD_POLL_MS): () => void {
  watchers += 1;
  if (watchers === 1) {
    void useDriverBoardStore.getState().refresh();
    timer = setInterval(() => void useDriverBoardStore.getState().refresh(), intervalMs);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    watchers -= 1;
    if (watchers === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
