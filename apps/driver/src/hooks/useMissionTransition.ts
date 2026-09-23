import { useState, useCallback } from "react";
import { DriverLifecycleEvent } from "@sahayak/domain";

export type InMissionClientEventType =
  | "CONFIRM_ARRIVAL_SCENE"
  | "CONFIRM_PATIENT_ONBOARD"
  | "CONFIRM_ARRIVAL_HOSPITAL"
  | "COMPLETE_MISSION";

export type ServerMissionEventName =
  | "ON_SCENE"
  | "PATIENT_ON_BOARD"
  | "ARRIVED_HOSPITAL"
  | "COMPLETE";

export const CLIENT_TO_SERVER_EVENT_MAP: Record<InMissionClientEventType, ServerMissionEventName> = {
  CONFIRM_ARRIVAL_SCENE: "ON_SCENE",
  CONFIRM_PATIENT_ONBOARD: "PATIENT_ON_BOARD",
  CONFIRM_ARRIVAL_HOSPITAL: "ARRIVED_HOSPITAL",
  COMPLETE_MISSION: "COMPLETE"
};

export interface TransitionSuccessResponse {
  ok: true;
  status: string;
}

export interface TransitionErrorResponse {
  error: string;
  from?: string;
}

export interface UseMissionTransitionReturn {
  isTransitioning: boolean;
  error: TransitionErrorResponse | null;
  submitTransition: (
    missionId: string,
    event: DriverLifecycleEvent
  ) => Promise<TransitionSuccessResponse | null>;
  clearError: () => void;
}

export function useMissionTransition(authToken: string | null): UseMissionTransitionReturn {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<TransitionErrorResponse | null>(null);

  const submitTransition = useCallback(
    async (
      _missionId: string,
      _event: DriverLifecycleEvent
    ): Promise<TransitionSuccessResponse | null> => {
      if (!authToken) return null;
      // Implemented in task P06
      // Server-authoritative: advances local state ONLY after receiving { ok: true }
      setIsTransitioning(true);
      setError(null);
      return null;
    },
    [authToken]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isTransitioning,
    error,
    submitTransition,
    clearError
  };
}
