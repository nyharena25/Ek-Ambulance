import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { isUuid } from "@sahayak/domain";
import { supabase } from "../lib/supabaseClient";

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
  };
});
