import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { isUuid } from "@sahayak/domain";
import { authStorage, supabase } from "../lib/supabaseClient";
import { canSignOut, clearPersistedMission } from "../services/missionSession.core";
import { usePatientLifecycleStore } from "./patientLifecycle.store";

/**
 * The access token, but only for a session the server can verify: a session with a non-UUID user id (or no
 * session at all) is not "signed in" for anything that reaches the server.
 */
export function realAccessToken(session: Session | null): string | null {
  return session && isUuid(session.user.id) ? session.access_token : null;
}

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
    signOut: async () => {
      if (!canSignOut(usePatientLifecycleStore.getState().currentState)) return { ok: false, code: "mission_in_progress" };
      const { error } = await supabase.auth.signOut();
      if (error) return { ok: false, code: "sign_out_failed" };
      // App state only (the SDK owns the session keys): no mission context or resume baseline carries to the next account.
      await clearPersistedMission(authStorage);
      usePatientLifecycleStore.getState().reset();
      return { ok: true };
    },
  };
});
