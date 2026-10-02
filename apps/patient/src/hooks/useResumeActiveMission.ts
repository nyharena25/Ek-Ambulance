import { useEffect, useRef } from "react";
import { useRootNavigationState, useRouter } from "expo-router";
import { usePatientAuthStore, realAccessToken } from "../state/patientAuth.store";
import { usePatientLifecycleStore } from "../state/patientLifecycle.store";
import { fetchActiveMission, fetchAssignedDriver } from "../lib/missionApi";
import { authStorage } from "../lib/supabaseClient";
import { resumeRoute, savePersistedMission } from "../services/missionSession.core";

/**
 * Section 7.5 rule 9 / 7.6: every store is in memory, so a process kill used to orphan the mission. On launch with a
 * verified session and a cold (idle) machine, look up the caller's non-terminal mission (a one-row query), hydrate the
 * machine from it and open the right screen; the mission channel then subscribes as usual.
 */
export function useResumeActiveMission(): void {
  const router = useRouter();
  const navReady = Boolean(useRootNavigationState()?.key);
  const session = usePatientAuthStore((s) => s.session);
  const token = realAccessToken(session);
  const userId = token ? session!.user.id : null;
  // Once per signed-in account, not once per process: RootLayout outlives a sign-out, so signing back in (or as another
  // patient) must look up that account's mission again. A token refresh keeps the same id and does not re-run it.
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!navReady || !userId || attemptedFor.current === userId) return;
    if (usePatientLifecycleStore.getState().currentState !== "idle") return;
    attemptedFor.current = userId;
    void (async () => {
      const result = await fetchActiveMission();
      if (!result.ok || !result.data) return;
      const s = result.data;
      const driver = s.status === "requesting" ? undefined : await fetchAssignedDriver(s.missionId);
      // Re-check: the patient may have started a new booking while the lookup was in flight.
      if (usePatientLifecycleStore.getState().currentState !== "idle") return;
      usePatientLifecycleStore.getState().send({
        type: "HYDRATE",
        payload: { missionId: s.missionId, status: s.status, vehicleType: s.vehicleType, jurisdiction: s.jurisdiction, pickup: s.pickup, fareDetails: s.fareDetails, driver },
      });
      await savePersistedMission(authStorage, { missionId: s.missionId, lastSeq: s.stateVersion });
      const lat = s.pickup ? String(s.pickup.latitude) : undefined;
      const lon = s.pickup ? String(s.pickup.longitude) : undefined;
      const pathname = resumeRoute(s.status);
      const params = { vehicleType: s.vehicleType, jurisdiction: s.jurisdiction, address: s.pickupAddress, lat, lon };
      if (pathname === "/booking/matching") router.replace({ pathname, params });
      else router.replace({ pathname, params: { id: s.missionId, ...params } });
    })();
  }, [navReady, userId, router]);
}
