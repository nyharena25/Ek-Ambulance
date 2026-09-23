export type CentrifugoConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "fallback";

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
