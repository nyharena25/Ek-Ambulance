import type { MissionTelemetryPing } from "@sahayak/domain";
import { ingestTelemetry } from "../lib/driverServer";
import { batchFullyAcknowledged } from "../lib/driverServer.core";
import { getServerAdapter } from "../state/driverLifecycle.store";
import type { QueuedTelemetryPing } from "../types/driverConnection.types";

/**
 * Persistence of live GPS (DATA_AND_SYNC_SPECIFICATION.md 5.3.8, 7.7). Live pings go to the patient over the channel and are
 * best-effort; the server ALSO needs them in `telemetry_logs` because the final fare is computed from the measured transport
 * leg (D-2). So each live ping is buffered here and uploaded in acknowledged batches. A ping leaves the buffer only when the
 * server acknowledged (or permanently rejected) it, and re-uploading is safe: the server deduplicates on
 * (mission, driver, recorded_at).
 */

/**
 * Dead-zone queue flush callback (D-UX-08 / G-10): true only when the SERVER acknowledged the whole batch. Without a server
 * session (local development) nothing is acknowledged, so the pings stay queued instead of being reported as synced.
 */
export async function syncQueuedPings(missionId: string, pings: QueuedTelemetryPing[]): Promise<boolean> {
  if (pings.length === 0) return true;
  if (!getServerAdapter()) return false;
  const result = await ingestTelemetry(missionId, pings.map((p) => ({ ...p, recordedInDeadZone: true })));
  return result.ok && batchFullyAcknowledged(pings.length, result.data);
}

const MAX_BUFFER = 1000;
const UPLOAD_INTERVAL_MS = 20_000;

let buffer: QueuedTelemetryPing[] = [];

export function recordLivePing(missionId: string, ping: MissionTelemetryPing): void {
  buffer.push({
    id: `live_${ping.timestamp}`,
    missionId,
    latitude: ping.latitude,
    longitude: ping.longitude,
    heading: ping.heading,
    speed: ping.speed,
    accuracy: ping.accuracy,
    timestamp: ping.timestamp,
    syncStatus: "queued",
    retryCount: 0,
  });
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
}

/** Uploads what is buffered for `missionId`. Returns how many pings the server acknowledged. Never throws. */
export async function flushLivePings(missionId: string): Promise<number> {
  if (!getServerAdapter()) return 0;
  const batch = buffer.filter((p) => p.missionId === missionId).slice(0, 500);
  if (batch.length === 0) return 0;
  const result = await ingestTelemetry(missionId, batch);
  if (!result.ok || !batchFullyAcknowledged(batch.length, result.data)) return 0;
  const sent = new Set(batch.map((p) => p.id));
  buffer = buffer.filter((p) => !sent.has(p.id));
  return result.data.acknowledged;
}

/** Periodic upload while a mission is active. Returns the stop function. */
export function startTelemetryUploadLoop(getActiveMissionId: () => string | null): () => void {
  const timer = setInterval(() => {
    const id = getActiveMissionId();
    if (id) void flushLivePings(id);
  }, UPLOAD_INTERVAL_MS);
  return () => clearInterval(timer);
}
