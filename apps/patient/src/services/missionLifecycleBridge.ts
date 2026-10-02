import {
  readDriverAccepted,
  readMissionCancelled,
  readMissionCompleted,
  readTransportStarted,
  type MissionLifecycleEventType,
  type ParsedLifecycleMessage,
  type PatientLifecycleMachineEvent,
} from "@sahayak/domain";
import { assignedDriverOf } from "../lib/missionApi.core.ts";

/**
 * Translates the wire vocabulary into the domain machine's SERVER_* events.
 *
 * `missionId` is ALWAYS the mission the subscription is mounted for, never the payload's (7.5 rule 6): a forged or
 * mismatched payload cannot rewrite machine context. Server-supplied facts (driver, destination, fare, who cancelled)
 * travel with the event; anything the server did not send stays absent so screens omit it instead of inventing it.
 * Pulled out of booking/[id].tsx so the integration tests exercise this exact function.
 */
export function translateLifecycleMessage(
  message: Pick<ParsedLifecycleMessage, "event" | "data">,
  missionId: string
): PatientLifecycleMachineEvent {
  const data = message.data ?? {};
  switch (message.event) {
    case "DRIVER_ACCEPTED": {
      const d = readDriverAccepted(data);
      return {
        type: "SERVER_MISSION_ASSIGNED",
        payload: { missionId, driver: assignedDriverOf(data), maskedCall: d.maskedCall, etaMinutes: d.etaMinutes },
      };
    }
    case "DRIVER_ARRIVED":
      return { type: "SERVER_DRIVER_ARRIVED", payload: { missionId } };
    case "TRANSPORT_STARTED": {
      const t = readTransportStarted(data);
      return {
        type: "SERVER_TRANSPORT_STARTED",
        payload: { missionId, destination: t.destination, etaMinutes: t.etaMinutes, wardStatus: t.wardStatus },
      };
    }
    case "HOSPITAL_ARRIVED":
      return { type: "SERVER_HOSPITAL_ARRIVED", payload: { missionId } };
    case "MISSION_COMPLETED":
      return { type: "SERVER_MISSION_COMPLETED", payload: { missionId, completion: readMissionCompleted(data) } };
    case "MISSION_CANCELLED":
      return { type: "SERVER_MISSION_CANCELLED", payload: { missionId, ...readMissionCancelled(data) } };
    case "DRIVER_RELEASED":
      return { type: "SERVER_DRIVER_RELEASED", payload: { missionId } };
  }
}

/** Back-compat entry point for callers that only have the event name (older tests, and the mock channel test fixture). */
export function translateLifecycleEvent(
  event: MissionLifecycleEventType,
  missionId: string,
  data: Record<string, unknown> = {}
): PatientLifecycleMachineEvent {
  return translateLifecycleMessage({ event, data }, missionId);
}
