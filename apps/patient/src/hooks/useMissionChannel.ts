import { useEffect, useRef, useState } from "react";
import {
  mountMissionChannel,
  createMockMissionChannel,
  type CentrifugoConnectionStatus,
  type DriverTelemetry,
  type MissionLifecycleEventType,
  type MockMissionChannelControls,
} from "../services/missionChannel.service";

export type { CentrifugoConnectionStatus, DriverTelemetry, MissionLifecycleEventType };

/** How often raw pings are allowed to flush into `throttledTelemetry`. The
 *  live map marker's rotation should NOT wait on this - it reads every raw
 *  ping via `onTelemetryReceived` and drives an Animated.Value directly,
 *  which never re-renders. This interval only protects TEXT displays
 *  (e.g. a speed readout), where React Native has no re-render-free way to
 *  bind a number into a translated string. */
const TELEMETRY_DISPLAY_FLUSH_MS = 2000;

export interface UseMissionChannelOptions {
  missionId: string | null;
  /** Supabase access_token used to authorize the /realtime/token call. Null
   *  means no real session exists yet (auth, Task 4.1, is still a stub) -
   *  in __DEV__ this falls back to the mock emitter automatically. */
  authToken: string | null;
  /** Fires synchronously on every raw ping (real or mock) - use this, not
   *  `throttledTelemetry`, to drive an Animated.Value/.ValueXY ref directly
   *  for zero-re-render map rendering. */
  onTelemetryReceived?: (telemetry: DriverTelemetry) => void;
  onLifecycleEvent?: (event: MissionLifecycleEventType, missionId: string) => void;
}

export interface UseMissionChannelReturn {
  status: CentrifugoConnectionStatus;
  isSubscribed: boolean;
  /** Safe for text rendering: flushed from the raw ping stream at most once
   *  every TELEMETRY_DISPLAY_FLUSH_MS, so a Centrifugo publish rate faster
   *  than that does not force a re-render on every single ping. */
  throttledTelemetry: DriverTelemetry | null;
  error: Error | null;
  /** Non-null only when running the dev mock emitter (no real authToken,
   *  __DEV__ true). Wire to debug-drawer buttons - MissionTrackingScreen's
   *  onSimulateTransportStart and TransportingScreen's
   *  onSimulateHospitalArrival already exist for exactly this. */
  mockControls: MockMissionChannelControls | null;
}

/**
 * Connects to Centrifugo's mission:{missionId} channel per
 * docs/prompts/patient-app/P04-centrifugo-mission-channel.md. Real
 * connection when authToken is present; falls back to the dev-only mock
 * emitter (src/services/missionChannel.service.ts) when __DEV__ and no
 * token exists yet, so the full lifecycle is testable without a live
 * backend or real auth (Task 4.1 is still a stub - see HANDOVER D2).
 *
 * Cleans up on unmount and whenever missionId/authToken change: the mount
 * effect's own return value is the teardown, called by React exactly once
 * per mount per React's own effect-cleanup contract. The teardown itself is
 * idempotent (src/services/missionChannel.service.ts) as a second safety net.
 */
export function useMissionChannel({
  missionId,
  authToken,
  onTelemetryReceived,
  onLifecycleEvent,
}: UseMissionChannelOptions): UseMissionChannelReturn {
  const [status, setStatus] = useState<CentrifugoConnectionStatus>("disconnected");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [throttledTelemetry, setThrottledTelemetry] = useState<DriverTelemetry | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [mockControls, setMockControls] = useState<MockMissionChannelControls | null>(null);

  // Latest-callback refs so the mount effect below doesn't need these
  // (typically inline arrows that change every render) in its deps array -
  // that would tear down and remount the socket on every parent re-render.
  const onTelemetryRef = useRef(onTelemetryReceived);
  onTelemetryRef.current = onTelemetryReceived;
  const onLifecycleRef = useRef(onLifecycleEvent);
  onLifecycleRef.current = onLifecycleEvent;

  // Ping buffer for the throttled display flush - written on every raw
  // ping, read at most once per TELEMETRY_DISPLAY_FLUSH_MS.
  const pendingTelemetryRef = useRef<DriverTelemetry | null>(null);

  useEffect(() => {
    if (!missionId) return;

    setError(null);
    const flushTimer = setInterval(() => {
      if (pendingTelemetryRef.current) {
        setThrottledTelemetry(pendingTelemetryRef.current);
      }
    }, TELEMETRY_DISPLAY_FLUSH_MS);

    const callbacks = {
      onStatusChange: setStatus,
      onSubscriptionStateChange: setIsSubscribed,
      onTelemetry: (telemetry: DriverTelemetry) => {
        pendingTelemetryRef.current = telemetry;
        onTelemetryRef.current?.(telemetry);
      },
      onLifecycleEvent: (event: MissionLifecycleEventType, id: string) => {
        onLifecycleRef.current?.(event, id);
      },
      onError: setError,
    };

    if (__DEV__ && !authToken) {
      const { controls, teardown } = createMockMissionChannel(missionId, callbacks);
      setMockControls(controls);
      return () => {
        clearInterval(flushTimer);
        setMockControls(null);
        teardown();
      };
    }

    if (!authToken) {
      // No real session and not in dev mock mode (production build, Task
      // 4.1 auth still a stub - see HANDOVER D2): make this legible rather
      // than a silent, indistinguishable-from-network-failure permanent
      // "disconnected" - the whole point of surfacing connection health is
      // for the low-connectivity overlay to explain *why*.
      setError(new Error("No authenticated session: Centrifugo mission channel not connected"));
      clearInterval(flushTimer);
      return;
    }

    const teardown = mountMissionChannel(missionId, authToken, callbacks);
    return () => {
      clearInterval(flushTimer);
      teardown();
    };
  }, [missionId, authToken]);

  return { status, isSubscribed, throttledTelemetry, error, mockControls };
}
