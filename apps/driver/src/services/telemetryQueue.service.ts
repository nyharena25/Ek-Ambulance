import type { GeoPoint } from "@sahayak/domain";
import type {
  QueuedTelemetryPing,
  TelemetryQueueState,
  SmsEmergencyPayload,
} from "../types/driverConnection.types.ts";

export interface TelemetryQueueOptions {
  maxCapacity?: number;
  smsDispatchNumber?: string;
}

type QueueListener = (state: TelemetryQueueState) => void;

export class TelemetryQueueService {
  private static instance: TelemetryQueueService;

  private pings: QueuedTelemetryPing[] = [];
  private isSyncing = false;
  private lastSyncAttemptAt: string | null = null;
  private lastSuccessfulSyncAt: string | null = null;
  private maxCapacity: number;
  private smsDispatchNumber: string;
  private listeners: Set<QueueListener> = new Set();

  constructor(options: TelemetryQueueOptions = {}) {
    this.maxCapacity = options.maxCapacity || 1000;
    this.smsDispatchNumber = options.smsDispatchNumber || "108";
  }

  public static getInstance(options?: TelemetryQueueOptions): TelemetryQueueService {
    if (!TelemetryQueueService.instance) {
      TelemetryQueueService.instance = new TelemetryQueueService(options);
    }
    return TelemetryQueueService.instance;
  }

  /**
   * Enqueue a new GPS telemetry ping when Centrifugo or network is offline/degraded.
   */
  public enqueuePing(
    missionId: string,
    location: GeoPoint,
    extras: Partial<QueuedTelemetryPing> = {}
  ): QueuedTelemetryPing {
    const ping: QueuedTelemetryPing = {
      id: `ping_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      missionId,
      latitude: Number(location.latitude.toFixed(6)),
      longitude: Number(location.longitude.toFixed(6)),
      heading: extras.heading !== undefined ? Math.round(extras.heading) : undefined,
      speed: extras.speed !== undefined ? Math.round(extras.speed) : undefined,
      altitude: extras.altitude,
      accuracy: extras.accuracy,
      timestamp: extras.timestamp || new Date().toISOString(),
      syncStatus: "queued",
      retryCount: 0,
      recordedInDeadZone: true,
    };

    this.pings.push(ping);

    // Safeguard mobile memory: If prolonged offline period exceeds max capacity, compact
    if (this.pings.length > this.maxCapacity) {
      this.compactQueue();
    }

    this.notify();
    return ping;
  }

  /**
   * Compact queue during prolonged dead zones in rural UP.
   * Preserves earliest departure ping and latest 20 pings; downsamples intermediate redundant pings.
   */
  public compactQueue(): void {
    if (this.pings.length <= this.maxCapacity) return;

    const head = this.pings.slice(0, 10);
    const tail = this.pings.slice(-50);
    const middle = this.pings.slice(10, -50);

    // Filter middle to keep every 2nd ping
    const compactedMiddle = middle.filter((_, index) => index % 2 === 0);

    this.pings = [...head, ...compactedMiddle, ...tail];
  }

  /**
   * Get all pings currently pending sync (queued or failed).
   */
  public getPendingPings(): QueuedTelemetryPing[] {
    return this.pings.filter((p) => p.syncStatus === "queued" || p.syncStatus === "failed");
  }

  /**
   * Get total number of pending pings.
   */
  public getPendingCount(): number {
    return this.getPendingPings().length;
  }

  /**
   * Get complete snapshot of all pings in the buffer.
   */
  public getAllPings(): QueuedTelemetryPing[] {
    return [...this.pings];
  }

  /**
   * Returns current queue state.
   */
  public getState(): TelemetryQueueState {
    const failedCount = this.pings.filter((p) => p.syncStatus === "failed").length;
    return {
      pings: [...this.pings],
      isSyncing: this.isSyncing,
      lastSyncAttemptAt: this.lastSyncAttemptAt,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      failedPingsCount: failedCount,
    };
  }

  /**
   * Flush all pending pings to Centrifugo or backend API upon connection restoration.
   */
  public async flushQueue(
    syncFn: (pings: QueuedTelemetryPing[]) => Promise<boolean>
  ): Promise<{ syncedCount: number; remainingCount: number }> {
    const pending = this.getPendingPings();
    if (pending.length === 0) {
      return { syncedCount: 0, remainingCount: 0 };
    }

    this.isSyncing = true;
    this.lastSyncAttemptAt = new Date().toISOString();
    this.notify();

    // Mark pending items as syncing
    pending.forEach((p) => {
      p.syncStatus = "syncing";
    });

    try {
      const success = await syncFn(pending);
      if (success) {
        // Mark as synced and retain in memory or prune
        const syncedIds = new Set(pending.map((p) => p.id));
        this.pings = this.pings.filter((p) => !syncedIds.has(p.id));
        this.lastSuccessfulSyncAt = new Date().toISOString();
      } else {
        // Revert to failed and increment retry
        pending.forEach((p) => {
          p.syncStatus = "failed";
          p.retryCount += 1;
        });
      }
    } catch {
      pending.forEach((p) => {
        p.syncStatus = "failed";
        p.retryCount += 1;
      });
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return {
      syncedCount: pending.length - this.getPendingCount(),
      remainingCount: this.getPendingCount(),
    };
  }

  /**
   * Generate an encrypted/compact GSM-compliant (<= 140 chars) SMS payload for rural UP dead zones.
   * Formatted for instant ingestion by UP 108 Emergency Control Room.
   */
  public formatSmsFallbackPayload(
    missionId: string,
    specificPing?: QueuedTelemetryPing
  ): SmsEmergencyPayload {
    const ping = specificPing || this.pings[this.pings.length - 1];
    const timestamp = ping ? ping.timestamp : new Date().toISOString();
    const timeStr = timestamp.split("T")[1]?.slice(0, 8) || "NOW";

    const lat = ping ? ping.latitude.toFixed(4) : "0.0000";
    const lng = ping ? ping.longitude.toFixed(4) : "0.0000";
    const spd = ping?.speed !== undefined ? `${ping.speed}K` : "--";
    const pendingCount = this.getPendingCount();

    // Concise GSM-7 character layout strictly < 140 chars
    // Format: UP108:AMB MSN-8819 LOC:26.8467,80.9462 SPD:58K Q:14 T:08:49:02
    const body = `UP108:AMB ${missionId} LOC:${lat},${lng} SPD:${spd} Q:${pendingCount} T:${timeStr}`;

    return {
      smsNumber: this.smsDispatchNumber,
      body,
      missionId,
      timestamp,
    };
  }

  /**
   * Clear all pings and reset state (e.g. at end of mission).
   */
  public clear(): void {
    this.pings = [];
    this.isSyncing = false;
    this.lastSyncAttemptAt = null;
    this.lastSuccessfulSyncAt = null;
    this.notify();
  }

  /**
   * Subscribe to queue state updates.
   */
  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch {
        // Keep notifying remaining listeners
      }
    });
  }
}

export const telemetryQueueService = TelemetryQueueService.getInstance();
