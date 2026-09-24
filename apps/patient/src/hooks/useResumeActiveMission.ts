import { useEffect, useRef } from "react";
import { useRootNavigationState, useRouter } from "expo-router";
import { usePatientAuthStore, realAccessToken } from "../state/patientAuth.store";
import { usePatientLifecycleStore } from "../state/patientLifecycle.store";
import { fetchActiveMission } from "../lib/missionApi";
import { authStorage } from "../lib/supabaseClient";
import { savePersistedMission } from "../services/missionSession.core";

/**
 * Section 7.5 rule 9 / 7.6: every store is in memory, so a process kill used to orphan the mission. On launch with a
 * verified session and a cold (idle) machine, look up the caller's non-terminal mission (a one-row query), hydrate the
 * machine from it and open the right screen; the mission channel then subscribes as usual.
 */
export function useResumeActiveMission(): void {
  const router = useRouter();
  const navReady = Boolean(useRootNavigationState()?.key);
  const token = realAccessToken(usePatientAuthStore((s) => s.session));
  const attempted = useRef(false);

  useEffect(() => {
    if (!navReady || !token || attempted.current) return;
    if (usePatientLifecycleStore.getState().currentState !== "idle") return;
    attempted.current = true;
    void (async () => {
      const result = await fetchActiveMission();
      if (!result.ok || !result.data) return;
      const s = result.data;
      // Re-check: the patient may have started a new booking while the lookup was in flight.
      if (usePatientLifecycleStore.getState().currentState !== "idle") return;
      usePatientLifecycleStore.getState().send({
        type: "HYDRATE",
        payload: { missionId: s.missionId, status: s.status, vehicleType: s.vehicleType, jurisdiction: s.jurisdiction, pickup: s.pickup, fareDetails: s.fareDetails },
      });
      await savePersistedMission(authStorage, { missionId: s.missionId, lastSeq: s.stateVersion });
      const lat = s.pickup ? String(s.pickup.latitude) : undefined;
      const lon = s.pickup ? String(s.pickup.longitude) : undefined;
      if (s.status === "requesting") {
        router.replace({ pathname: "/booking/matching", params: { vehicleType: s.vehicleType, jurisdiction: s.jurisdiction, address: s.pickupAddress, lat, lon } });
      } else {
        router.replace({ pathname: "/booking/[id]", params: { id: s.missionId, vehicleType: s.vehicleType, jurisdiction: s.jurisdiction, address: s.pickupAddress, lat, lon } });
      }
    })();
  }, [navReady, token, router]);
}
