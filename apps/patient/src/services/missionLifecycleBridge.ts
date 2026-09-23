import type { PatientLifecycleMachineEvent } from "@sahayak/domain";
import type { MissionLifecycleEventType } from "../hooks/useMissionChannel";

/**
 * Translates Centrifugo's wire vocabulary (MissionLifecycleEventType) into
 * the domain machine's own SERVER_* / CANCEL event vocabulary (unchanged
 * since Step 5, already tested there). Pulled out of booking/[id].tsx so
 * the Phase 5 golden-path integration test exercises this exact function
 * rather than a re-implementation of it - a copy could drift from the
 * real route's logic and the test would never catch it.
 */
export function translateLifecycleEvent(
  event: MissionLifecycleEventType,
  missionId: string
): PatientLifecycleMachineEvent {
  switch (event) {
    case "DRIVER_ACCEPTED":
      return { type: "SERVER_MISSION_ASSIGNED", payload: { missionId } };
    case "DRIVER_ARRIVED":
      return { type: "SERVER_DRIVER_ARRIVED", payload: { missionId } };
    case "TRANSPORT_STARTED":
      return { type: "SERVER_TRANSPORT_STARTED", payload: { missionId } };
    case "MISSION_COMPLETED":
      return { type: "SERVER_MISSION_COMPLETED", payload: { missionId } };
    case "MISSION_CANCELLED":
      return {
        type: "CANCEL",
        payload: {
          missionId,
          reason: "other",
          reasonNote: "Cancelled by dispatch or driver",
          cancelledAt: new Date().toISOString(),
        },
      };
  }
}
