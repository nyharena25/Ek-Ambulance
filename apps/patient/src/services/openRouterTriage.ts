import type { PrimaryComplaintType, TriageInput, UrgencyTier } from "@sahayak/domain";

/**
 * AI symptom extraction. It only SUGGESTS: toTriageInput() output goes through the
 * domain computeTriageUrgency(), which alone decides tier and vehicle constraint.
 */

export interface TriageExtraction {
  primaryComplaint: PrimaryComplaintType;
  respiratoryDistress: boolean;
  severeHemorrhage: boolean;
  alteredMentalStatus: boolean;
  recommendedTier: UrgencyTier;
}

export type TriageFailureReason =
  | "no_auth"
  | "consent"
  | "empty_input"
  | "timeout"
  | "auth"
  | "rate_limit"
  | "network"
  | "invalid_response";

export type TriageExtractionResult =
  | { ok: true; data: TriageExtraction }
  | { ok: false; reason: TriageFailureReason };

// Routed through the gateway's /triage/extract proxy, never OpenRouter directly: the OpenRouter key lives only in the
// gateway's server-side environment (docker-compose.yml's token-mint service), never in the app binary. The client sends
// its own Supabase session token and the patient's text; the gateway fixes the model, prompt and schema.
const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL || "http://localhost:8000";
const TIMEOUT_MS = 8000;
const MAX_INPUT_CHARS = 1000;

const COMPLAINTS: readonly PrimaryComplaintType[] = [
  "severe_trauma",
  "chest_pain",
  "breathing_distress",
  "unconscious",
  "minor_injury",
];
const TIERS: readonly UrgencyTier[] = ["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"];

/** Validates the model's message content; tolerates ```json fences, rejects anything off-schema. */
export function parseTriageExtraction(content: unknown): TriageExtraction | null {
  if (typeof content !== "string") return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const { primaryComplaint, respiratoryDistress, severeHemorrhage, alteredMentalStatus, recommendedTier } = obj;
  if (
    !COMPLAINTS.includes(primaryComplaint as PrimaryComplaintType) ||
    !TIERS.includes(recommendedTier as UrgencyTier) ||
    typeof respiratoryDistress !== "boolean" ||
    typeof severeHemorrhage !== "boolean" ||
    typeof alteredMentalStatus !== "boolean"
  ) {
    return null;
  }
  return {
    primaryComplaint: primaryComplaint as PrimaryComplaintType,
    respiratoryDistress,
    severeHemorrhage,
    alteredMentalStatus,
    recommendedTier: recommendedTier as UrgencyTier,
  };
}

/**
 * Deterministic bridge into the START engine. A "minor" complaint carrying any red-flag
 * indicator is escalated to severe_trauma so the engine's own START rules return Cat 1;
 * the AI's recommendedTier is deliberately ignored here.
 */
export function toTriageInput(ex: TriageExtraction): TriageInput {
  const redFlag = ex.respiratoryDistress || ex.severeHemorrhage || ex.alteredMentalStatus;
  const primaryComplaint =
    ex.primaryComplaint === "minor_injury" && redFlag ? "severe_trauma" : ex.primaryComplaint;
  return {
    primaryComplaint,
    traumaAssessment: {
      respiration: ex.respiratoryDistress ? "abnormal" : "normal",
      severeBleeding: ex.severeHemorrhage,
      responsiveness: ex.alteredMentalStatus ? "unresponsive" : "alert",
    },
  };
}

export const TIER_SEVERITY: Record<UrgencyTier, number> = {
  CAT_1_IMMEDIATE: 3,
  CAT_2_URGENT: 2,
  CAT_3_DELAYED: 1,
};

/** Never throws or rejects; every failure maps to a reason so the UI can fall back to manual triage.
 *  `authToken` is the caller's own real Supabase session token (not an API key). Only the patient's text is sent: the
 *  gateway holds the OpenRouter key and fixes the model, prompt and schema, and refuses a caller without a recorded
 *  third_party_llm consent (`consent`). `no_auth` (no real session) degrades to manual triage. */
export async function extractTriageIndicators(
  description: string,
  opts: { authToken?: string | null; gatewayUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<TriageExtractionResult> {
  const gatewayUrl = opts.gatewayUrl ?? GATEWAY_URL;
  const { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, authToken } = opts;
  const text = description.trim().slice(0, MAX_INPUT_CHARS);

  if (!authToken) return { ok: false, reason: "no_auth" };
  if (!text) return { ok: false, reason: "empty_input" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${gatewayUrl}/triage/extract`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.status === 403) {
      const err = await res.json().then((b: { error?: unknown }) => b?.error, () => undefined);
      return { ok: false, reason: err === "consent_required" ? "consent" : "auth" };
    }
    if (res.status === 401) return { ok: false, reason: "auth" };
    if (res.status === 429) return { ok: false, reason: "rate_limit" };
    if (!res.ok) return { ok: false, reason: "network" };
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const data = parseTriageExtraction(body?.choices?.[0]?.message?.content);
    return data ? { ok: true, data } : { ok: false, reason: "invalid_response" };
  } catch (err) {
    return { ok: false, reason: (err as { name?: string })?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
