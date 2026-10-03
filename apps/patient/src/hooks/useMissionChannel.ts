import { useEffect, useRef, useState } from "react";
import {
  gpsHealth,
  initialRealtime,
  isNewerPing,
  realtimeHealth,
  reduceRealtime,
  trackingBadge,
  type GpsHealth,
  type ParsedLifecycleMessage,
  type RealtimeEvent,
  type RealtimeSnapshot,
  type TrackingBadge,
  type TransportHealth,
} from "@sahayak/domain";
import {
  mountMissionChannel,
  type CentrifugoConnectionStatus,
  type DriverTelemetry,
  type MissionLifecycleEventType,
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
  /** Supabase access_token used to authorize the /realtime/token call. Null means no real session exists yet;
   *  the channel then reports a "no authenticated session" error rather than connecting. */
  authToken: string | null;
  /** Fires synchronously on every raw ping - use this, not
   *  `throttledTelemetry`, to drive an Animated.Value/.ValueXY ref directly
   *  for zero-re-render map rendering. */
  onTelemetryReceived?: (telemetry: DriverTelemetry) => void;
  onLifecycleEvent?: (event: MissionLifecycleEventType, missionId: string) => void;
  /** Parsed v1 message (seq, eventId, data). Takes precedence over `onLifecycleEvent` on the real channel. */
  onLifecycleMessage?: (message: ParsedLifecycleMessage) => void;
  /** Subscription re-established after events may have been missed: reconcile against the server. */
  onResubscribed?: (info: { recovered: boolean }) => void;
}

/** What the tracking UI may claim (P-UX-06): "live" only with a healthy socket AND a fresh fix; "paused" only on a real
 *  transport failure; a healthy socket with no recent fix is "awaitingGps", never "paused". */
export type TrackingConnection = TrackingBadge;

export interface UseMissionChannelReturn {
  status: CentrifugoConnectionStatus;
  isSubscribed: boolean;
  /** Safe for text rendering: flushed from the raw ping stream at most once
   *  every TELEMETRY_DISPLAY_FLUSH_MS, so a Centrifugo publish rate faster
   *  than that does not force a re-render on every single ping. */
  throttledTelemetry: DriverTelemetry | null;
  error: Error | null;
  /** The tracking badge, derived from transport health and GPS health separately. */
  connection: TrackingConnection;
  /** The one realtime connection state (SDK lifecycle only). */
  realtime: RealtimeSnapshot;
  transportHealth: TransportHealth;
  gps: GpsHealth;
}

/**
 * Connects to Centrifugo's mission:{missionId} channel per
 * docs/prompts/patient-app/P04-centrifugo-mission-channel.md. Real
 * connection when authToken is present; without one, reports an error
 * rather than connecting (real production behavior, not a fallback).
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
  onLifecycleMessage,
  onResubscribed,
}: UseMissionChannelOptions): UseMissionChannelReturn {
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const lastPingIsoRef = useRef<string | null>(null);
  const onMessageRef = useRef(onLifecycleMessage);
  onMessageRef.current = onLifecycleMessage;
  const onResubRef = useRef(onResubscribed);
  onResubRef.current = onResubscribed;
  const [status, setStatus] = useState<CentrifugoConnectionStatus>("disconnected");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [throttledTelemetry, setThrottledTelemetry] = useState<DriverTelemetry | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [realtime, setRealtime] = useState<RealtimeSnapshot>(initialRealtime);
  // The session token is read on every (re)connect through this ref: a refreshed token is picked up without tearing the
  // socket down, and the subscription is only remounted when a session appears or disappears.
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const hasSession = authToken !== null;

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
    setRealtime(initialRealtime());
    const flushTimer = setInterval(() => {
      if (pendingTelemetryRef.current) {
        setThrottledTelemetry(pendingTelemetryRef.current);
      }
      // Re-evaluated every flush so a silent feed flips the indicator without another event arriving.
      setTick((t) => t + 1);
    }, TELEMETRY_DISPLAY_FLUSH_MS);

    const callbacks = {
      onStatusChange: setStatus,
      onTransportEvent: (event: RealtimeEvent) => setRealtime((s) => reduceRealtime(s, event, Date.now())),
      onSubscriptionStateChange: setIsSubscribed,
      onTelemetry: (telemetry: DriverTelemetry) => {
        // Rule 10: a flushed or recovered ping must never move the marker backwards.
        if (!isNewerPing(lastPingIsoRef.current, telemetry)) return;
        lastPingIsoRef.current = telemetry.timestamp;
        setLastPingAt(Date.now());
        pendingTelemetryRef.current = telemetry;
        onTelemetryRef.current?.(telemetry);
      },
      onLifecycleEvent: (event: MissionLifecycleEventType, id: string) => {
        // The legacy shape has no seq: surface it as a parsed message so one consumer serves both.
        if (onMessageRef.current) onMessageRef.current({ event, missionId: id, data: {} });
        else onLifecycleRef.current?.(event, id);
      },
      onLifecycleMessage: (message: ParsedLifecycleMessage) => {
        if (onMessageRef.current) onMessageRef.current(message);
        else onLifecycleRef.current?.(message.event, missionId);
      },
      onResubscribed: (info: { recovered: boolean }) => onResubRef.current?.(info),
      onError: setError,
    };

    if (!hasSession) {
      // No real session (production build, Task 4.1 auth still a stub -
      // see HANDOVER D2): make this legible rather
      // than a silent, indistinguishable-from-network-failure permanent
      // "disconnected" - the whole point of surfacing connection health is
      // for the low-connectivity overlay to explain *why*.
      setError(new Error("No authenticated session: Centrifugo mission channel not connected"));
      clearInterval(flushTimer);
      return;
    }

    // Exactly one logical subscription per mounted mission: the effect owns it and its cleanup tears it down.
    const teardown = mountMissionChannel(missionId, () => authTokenRef.current, callbacks);
    return () => {
      clearInterval(flushTimer);
      teardown();
    };
  }, [missionId, hasSession]);

  const now = Date.now();
  const transportHealth = realtimeHealth(realtime, now);
  const gps = gpsHealth(lastPingAt, now);
  const connection = trackingBadge(transportHealth, gps);

  return { status, isSubscribed, throttledTelemetry, error, connection, realtime, transportHealth, gps };
}
