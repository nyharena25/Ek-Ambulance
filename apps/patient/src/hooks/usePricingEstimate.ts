import { useState, useCallback } from "react";
import {
  CareLevel,
  Jurisdiction,
  PricingEstimateResponse
} from "@sahayak/domain";

export interface FetchEstimateParams {
  careLevel: CareLevel;
  jurisdiction: Jurisdiction;
  distanceKm: number;
}

export interface UsePricingEstimateReturn {
  isLoading: boolean;
  estimate: PricingEstimateResponse | null;
  error: Error | null;
  fetchEstimate: (params: FetchEstimateParams) => Promise<PricingEstimateResponse | null>;
}

export function usePricingEstimate(): UsePricingEstimateReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [estimate, setEstimate] = useState<PricingEstimateResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const fetchEstimate = useCallback(async (_params: FetchEstimateParams): Promise<PricingEstimateResponse | null> => {
    // Implemented in task P05
    // Note: figure is indicative only; authoritative fare recomputed server-side at REQUEST time
    setIsLoading(true);
    setError(null);
    try {
      // Server call implemented in task P05.
      setEstimate(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    estimate,
    error,
    fetchEstimate
  };
}
