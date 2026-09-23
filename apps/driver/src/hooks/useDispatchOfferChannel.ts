import { useState, useEffect } from "react";

export interface DispatchOfferEvent {
  offerId: string;
  missionId: string;
  expiresAt: string;
  [key: string]: unknown; // Payload shape flagged as Open Question
}

export interface UseDispatchOfferChannelOptions {
  driverId: string | null;
  authToken: string | null;
  onOfferReceived?: (offer: DispatchOfferEvent) => void;
  onOfferTimeout?: (offerId: string) => void;
}

export interface UseDispatchOfferChannelReturn {
  isConnected: boolean;
  isSubscribed: boolean;
  currentOffer: DispatchOfferEvent | null;
  error: Error | null;
}

export function useDispatchOfferChannel({
  driverId,
  authToken,
  onOfferReceived
}: UseDispatchOfferChannelOptions): UseDispatchOfferChannelReturn {
  const [isConnected] = useState(false);
  const [isSubscribed] = useState(false);
  const [currentOffer] = useState<DispatchOfferEvent | null>(null);
  const [error] = useState<Error | null>(null);

  useEffect(() => {
    if (!driverId || !authToken) return;

    // Implemented in task P05
    // Two-step token flow: POST /realtime/token with scope: "driver:{driverId}:offers"
    // Reconnect refreshes token
    return () => {
      // Unmount cleanup
    };
  }, [driverId, authToken, onOfferReceived]);

  return {
    isConnected,
    isSubscribed,
    currentOffer,
    error
  };
}
