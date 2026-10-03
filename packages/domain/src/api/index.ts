/**
 * Pure helpers shared by both apps' Mission API clients (DATA_AND_SYNC_SPECIFICATION.md 6.4.5). No I/O: each app owns its
 * own supabase-bound calls; the mapping of results and errors lives here so a code means the same thing on both sides.
 */

export interface ApiError {
  /** Machine code from the server (`out_of_zone`, `offer_taken`, `invalid_transition`, ...) or `network` / `unknown`. */
  code: string;
  /** HTTP status the server mapped the error to; 0 when there was no response. */
  status: number;
  detail?: string;
  retryable: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

interface RpcErrorLike {
  message?: string | null;
  code?: string | null;
  details?: string | null;
}

/** PostgREST maps SQLSTATE `PTnnn` to HTTP nnn; the machine code is the error message (migration 20260924000003). */
export function mapRpcError(error: RpcErrorLike | null | undefined): ApiError {
  const message = error?.message ?? "";
  const sqlstate = error?.code ?? "";
  const pt = /^PT(\d{3})$/.exec(sqlstate);
  if (pt) return { code: message || "unknown", status: Number(pt[1]), detail: error?.details ?? undefined, retryable: false };
  if (sqlstate === "42501") return { code: "forbidden", status: 403, detail: message || undefined, retryable: false };
  // supabase-js reports a fetch failure as an error with no SQLSTATE and the TypeError text.
  if (/network|fetch|timeout|abort|failed to/i.test(message) || sqlstate === "") {
    return { code: "network", status: 0, detail: message || undefined, retryable: true };
  }
  return { code: "unknown", status: 0, detail: message || undefined, retryable: false };
}

/** v4-shaped UUID. An idempotency key only has to be unique per caller, not unpredictable. */
export function newIdempotencyKey(random: () => number = Math.random): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
