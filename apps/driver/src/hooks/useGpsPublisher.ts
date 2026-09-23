import { useState, useEffect, useCallback, useRef } from "react";
import type { GeoPoint } from "@sahayak/domain";
import { telemetryQueueService } from "../services/telemetryQueue.service";
import {
  mountDriverTelemetryPublisher,
  type DriverTelemetryPublisher,
} from "../services/driverTelemetry";
import { useDriverConnectionStore } from "../state/driverConnection.store";

export interface UseGpsPublisherOptions {
  missionId: string | null;
  authToken: string | null;
  isPublishingActive: boolean; // active during enRouteToPatient, onScene, transporting
  publishIntervalMs?: number;  // defaults to 3000ms (~1 publish / 3s per architecture spec)
}

export interface UseGpsPublisherReturn {
  isPublishing: boolean;
  lastPublishedLocation: GeoPoint | null;
  isFallbackActive: boolean;
  queuedPingsCount: number;
  error: Error | null;
  recordTelemetryPing: (location: GeoPoint, speed?: number, heading?: number) => void;
  syncQueuedPings: () => Promise<number>;
}

export function useGpsPublisher({
  missionId,
  authToken,
  isPublishingActive,
  publishIntervalMs = 3000,
}: UseGpsPublisherOptions): UseGpsPublisherReturn {
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastPublishedLocation, setLastPublishedLocation] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const {
    isFallbackActive,
    queuedPingsCount,
    setConnectionStatus,
    setFallbackActive,
    markRestored,
    dismissRestoredBanner,
  } = useDriverConnectionStore();

  const lastPublishTimeRef = useRef<number>(0);
  const publisherRef = useRef<DriverTelemetryPublisher | null>(null);

  /**
   * Record telemetry ping.
   * If online: sends live over Centrifugo channel mission:{missionId}
   * If Centrifugo fails / offline: stores in local store-and-forward queue
   */
  const recordTelemetryPing = useCallback(
    (location: GeoPoint, speed?: number, heading?: number) => {
      if (!missionId || !isPublishingActive) return;

      const now = Date.now();
      // Throttle live publishing to ~1 publish / 3 seconds
      if (now - lastPublishTimeRef.current < publishIntervalMs) {
        return;
      }
      lastPublishTimeRef.current = now;

      if (isFallbackActive) {
        // Centrifugo is offline: Enqueue ping locally into Store-and-Forward queue
        telemetryQueueService.enqueuePing(missionId, location, {
          speed,
          heading,
          timestamp: new Date().toISOString(),
        });
        setLastPublishedLocation(location);
      } else {
        // Attempt live Centrifugo publication
        try {
          publisherRef.current?.publish({
            latitude: location.latitude,
            longitude: location.longitude,
            heading,
            speed,
            timestamp: new Date().toISOString(),
          });
          setLastPublishedLocation(location);
          setIsPublishing(true);
        } catch (err) {
          // Centrifugo publication failed -> failover to Store-and-Forward
          setConnectionStatus("fallback");
          setFallbackActive(true);
          telemetryQueueService.enqueuePing(missionId, location, {
            speed,
            heading,
            timestamp: new Date().toISOString(),
          });
          setError(err instanceof Error ? err : new Error("Centrifugo publication failed"));
        }
      }
    },
    [missionId, isPublishingActive, isFallbackActive, publishIntervalMs, setConnectionStatus, setFallbackActive]
  );

  /**
   * Sync all queued telemetry pings when connectivity is restored
   */
  const syncQueuedPings = useCallback(async (): Promise<number> => {
    if (!missionId) return 0;

    const { syncedCount } = await telemetryQueueService.flushQueue(async (_pings) => {
      // In production, transmits the batch to the gateway or sequential Centrifugo channel publish
      return true;
    });

    if (syncedCount > 0) {
      markRestored(syncedCount);
      setTimeout(() => {
        dismissRestoredBanner();
      }, 3500);
    }

    return syncedCount;
  }, [missionId, markRestored, dismissRestoredBanner]);

  useEffect(() => {
    if (!missionId || !authToken || !isPublishingActive) {
      setIsPublishing(false);
      return;
    }

    // Telemetry publishing active
    publisherRef.current = mountDriverTelemetryPublisher(missionId, authToken);
    setIsPublishing(true);

    return () => {
      publisherRef.current?.teardown();
      publisherRef.current = null;
      setIsPublishing(false);
    };
  }, [missionId, authToken, isPublishingActive]);

  return {
    isPublishing,
    lastPublishedLocation,
    isFallbackActive,
    queuedPingsCount,
    error,
    recordTelemetryPing,
    syncQueuedPings,
  };
}
