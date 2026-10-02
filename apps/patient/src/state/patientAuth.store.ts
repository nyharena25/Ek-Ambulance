import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { authStorage, supabase } from "../lib/supabaseClient";
import { signOutPatient } from "../services/missionSession.core";
import { usePatientLifecycleStore } from "./patientLifecycle.store";

export { realAccessToken } from "../hooks/otpAuth.core";

export interface PatientAuthStoreState {
  session: Session | null;
  isInitializing: boolean;
  /** Supabase signOut; the session itself is cleared by the SDK and mirrored here by onAuthStateChange. */
  signOut: () => Promise<{ ok: true } | { ok: false; code: "mission_in_progress" | "sign_out_failed" }>;
}

/**
 * Mirrors the Session persisted by supabaseClient's secure-store adapter
 * into a Zustand store, so components read a plain object instead of
 * awaiting supabase.auth.getSession() themselves. Same pattern as Step 5's
 * patientLifecycle.store.ts: a side effect (here, subscribing to auth
 * state) mounted once inside the create() initializer, not on every
 * render.
 */
export const usePatientAuthStore = create<PatientAuthStoreState>((set) => {
  supabase.auth.getSession().then(({ data }) => {
    set({ session: data.session, isInitializing: false });
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, isInitializing: false });
  });

  return {
    session: null,
    isInitializing: true,
    signOut: () =>
      signOutPatient({
        state: usePatientLifecycleStore.getState().currentState,
        signOut: () => supabase.auth.signOut(),
        storage: authStorage,
        resetLifecycle: () => usePatientLifecycleStore.getState().reset(),
      }),
  };
});
