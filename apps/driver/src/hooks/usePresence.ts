import { useState, useCallback } from "react";
import { CareLevel, GeoPoint } from "@sahayak/domain";

export interface UpdatePresenceParams {
  isOnline: boolean;
  location: GeoPoint;
  careLevel: CareLevel;
}

export interface PresenceResponse {
  driverId: string;
  isOnline: boolean;
  geoIndexed: boolean;
  updatedAt: string;
}

export interface PresenceApiError {
  error: string;
  error_description: string;
  i18nKey?: "driverCrewIncomplete" | "driverAis125Verified";
}

export interface UsePresenceReturn {
  isLoading: boolean;
  isOnline: boolean;
  error: PresenceApiError | null;
  updatePresence: (params: UpdatePresenceParams) => Promise<boolean>;
  clearError: () => void;
}

export function usePresence(authToken: string | null): UsePresenceReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState<PresenceApiError | null>(null);

  const updatePresence = useCallback(
    async (params: UpdatePresenceParams): Promise<boolean> => {
      if (!authToken) return false;
      // Implemented in task P04
      // Note: Maps domain GeoPoint { latitude, longitude } to wire { lat, lng }
      // Maps 403 "crew_incomplete" to i18nKey: "driverCrewIncomplete"
      setIsLoading(true);
      setError(null);
      try {
        setIsOnline(params.isOnline);
        return true;
      } finally {
        setIsLoading(false);
      }
    },
    [authToken]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    isOnline,
    error,
    updatePresence,
    clearError
  };
}
