import { supabase } from "./supabaseClient";

/**
 * The signed-in patient's own account data. RLS limits every read here to the caller's rows, and the only column a
 * patient may write is full_name (column grant) - role and phone are server-owned and never sent from here.
 */
export interface PatientProfile {
  phone: string;
  fullName: string | null;
}

export interface ConsentEntry {
  purpose: string;
  granted: boolean;
  grantedAt: string;
}

export async function fetchPatientProfile(userId: string): Promise<PatientProfile | null> {
  try {
    const { data, error } = await supabase.from("profiles").select("phone,full_name").eq("id", userId).maybeSingle();
    if (error || !data) return null;
    return { phone: String(data.phone), fullName: data.full_name ? String(data.full_name) : null };
  } catch {
    return null;
  }
}

/** An empty name clears it. Returns false when the server did not store it. */
export async function savePatientName(userId: string, fullName: string): Promise<boolean> {
  const name = fullName.trim();
  try {
    const { error } = await supabase.from("profiles").update({ full_name: name === "" ? null : name }).eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}

/** The latest recorded decision per purpose (consent_records is append-only: newest row wins). */
export async function fetchConsents(userId: string): Promise<ConsentEntry[] | null> {
  try {
    const { data, error } = await supabase
      .from("consent_records")
      .select("purpose,granted,granted_at")
      .eq("user_id", userId)
      .order("granted_at", { ascending: false });
    if (error || !data) return null;
    const latest = new Map<string, ConsentEntry>();
    for (const row of data) {
      const purpose = String(row.purpose);
      if (!latest.has(purpose)) latest.set(purpose, { purpose, granted: Boolean(row.granted), grantedAt: String(row.granted_at) });
    }
    return [...latest.values()];
  } catch {
    return null;
  }
}
