/** What the UI may claim about the realtime link (driverConnection.store derives it from SDK evidence only). Whether the
 *  store-and-forward fallback is active is a separate flag (isFallbackActive), never a status. */
export type CentrifugoConnectionStatus =
  | "connecting" // first connect of this session, not yet up
  | "connected" // socket up and every required channel subscribed (or none required)
  | "reconnecting" // was up, or is up with a channel not (re)subscribed yet: degraded, retrying
  | "disconnected" // down past the failure threshold
  | "authRequired"; // the server refused the credentials: retrying the network will not help

export type TelemetrySyncStatus = "queued" | "syncing" | "synced" | "failed";

export interface QueuedTelemetryPing {
  id: string;
  missionId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  altitude?: number;
  accuracy?: number;
  timestamp: string; // ISO 8601
  syncStatus: TelemetrySyncStatus;
  retryCount: number;
  recordedInDeadZone?: boolean;
}

export interface TelemetryQueueState {
  pings: QueuedTelemetryPing[];
  isSyncing: boolean;
  lastSyncAttemptAt: string | null;
  lastSuccessfulSyncAt: string | null;
  failedPingsCount: number;
}

export interface CentrifugoChannelTokenResponse {
  token: string;
  channel: string;
  publish?: boolean;
}

export interface SmsEmergencyPayload {
  smsNumber: string;
  body: string;
  missionId: string;
  timestamp: string;
}
