import type {
  DriverLifecycleEvent,
  DriverLifecycleMachineEvent,
  DriverLifecycleState,
  MissionLifecycleEventType,
} from "@sahayak/domain";

/**
 * Maps a driver domain event to the wire lifecycle event
 * apps/patient/src/services/missionLifecycleBridge.ts expects on
 * mission:{missionId}, per the Wire Event Publishing Closure directive.
 *
 * The directive's own action names ("ARRIVED_ON_SCENE" -> "SERVER_DRIVER_ARRIVED")
 * name the UI gesture and the PATIENT machine's post-translation event,
 * not the wire value itself: SERVER_DRIVER_ARRIVED isn't a member of
 * MissionLifecycleEventType at all - it's what translateLifecycleEvent
 * produces FROM the real wire event, "DRIVER_ARRIVED". Mapped to the
 * actual wire vocabulary throughout (see HANDOVER for the full table),
 * same class of directive-vs-reality naming mismatch as OFFER_EXPIRED ->
 * SERVER_OFFER_TIMEOUT in an earlier phase.
 *
 * Events with no patient-visible milestone (GO_ONLINE, GO_OFFLINE,
 * DECLINE_DISPATCH, CONFIRM_ARRIVAL_HOSPITAL, SERVER_OFFER_RECEIVED/TIMEOUT)
 * are intentionally absent - there is no corresponding
 * MissionLifecycleEventType value for them (confirmed by the Cross-Client
 * sweep's own integration test: "no distinct wire event for this step").
 */
const WIRE_LIFECYCLE_EVENT_MAP: Partial<Record<DriverLifecycleEvent["type"], MissionLifecycleEventType>> = {
  ACCEPT_DISPATCH: "DRIVER_ACCEPTED",
  CONFIRM_ARRIVAL_SCENE: "DRIVER_ARRIVED",
  CONFIRM_PATIENT_ONBOARD: "TRANSPORT_STARTED",
  COMPLETE_MISSION: "MISSION_COMPLETED",
  ABORT_MISSION: "MISSION_CANCELLED",
};

/**
 * Determines which wire lifecycle event (if any) should publish after a
 * driver domain event was sent to the lifecycle actor. Returns null when
 * the event has no wire counterpart, OR when the transition was rejected
 * (beforeState === afterState) - ties publishing to a REAL, successful
 * state transition rather than to the send() call itself, so an illegal
 * event (e.g. COMPLETE_MISSION sent from transporting - see
 * driverLifecycle.test.ts's skip-state-rejection case) or a duplicate
 * dispatch of an already-applied action never (re-)publishes. All five
 * mapped events have a `target` in driverLifecycle.ts (none are
 * context-only), so this guard is safe for all of them.
 */
export function wireLifecycleEventFor(
  eventType: DriverLifecycleMachineEvent["type"],
  beforeState: DriverLifecycleState,
  afterState: DriverLifecycleState
): MissionLifecycleEventType | null {
  if (beforeState === afterState) return null;
  return WIRE_LIFECYCLE_EVENT_MAP[eventType as DriverLifecycleEvent["type"]] ?? null;
}

export interface WireLifecyclePublisher {
  publishLifecycleEvent: (event: MissionLifecycleEventType, driverId: string) => void;
}

/**
 * The single point every driverLifecycle.store.ts send() routes through.
 * Safe no-op - with a console.warn, per the directive's "warning fallback"
 * requirement - if there is no mounted publisher, no active mission, or
 * no known driver identity. Never throws, never blocks the
 * already-applied state transition that triggered it.
 */
export function publishForTransition(
  publisher: WireLifecyclePublisher | null,
  eventType: DriverLifecycleMachineEvent["type"],
  beforeState: DriverLifecycleState,
  afterState: DriverLifecycleState,
  missionId: string | null,
  driverId: string | null
): MissionLifecycleEventType | null {
  const wireEvent = wireLifecycleEventFor(eventType, beforeState, afterState);
  if (!wireEvent) return null;

  if (!publisher || !missionId || !driverId) {
    console.warn(
      `[driverLifecycle] Skipped publishing "${wireEvent}" - no active mission channel or driver identity`
    );
    return null;
  }

  publisher.publishLifecycleEvent(wireEvent, driverId);
  return wireEvent;
}
