import { decideSeq, type ParsedLifecycleMessage } from "@sahayak/domain";
import { contiguousFrom, type MissionSnapshot } from "../lib/missionApi.core.ts";

/**
 * Sequence-aware application of lifecycle messages (DATA_AND_SYNC_SPECIFICATION.md 7.5, rules 3, 5 and 9).
 *
 *   seq == lastSeq + 1  -> apply
 *   seq <= lastSeq      -> duplicate, dropped
 *   seq >  lastSeq + 1  -> gap: replay the missed events from the server in order; if that is not possible
 *                          (offline, a hole, an event this build does not know), jump to the server snapshot instead
 *   no seq (a pre-v1 publisher) -> applied as before
 *
 * It owns no I/O: the machine, the fetches and the persistence are injected, so the loss scenarios of section 7.6
 * are unit-testable without a socket.
 */
export interface MissionSyncDeps {
  /** Persisted baseline for this mission; null when nothing has been applied yet. */
  lastSeq: number | null;
  /** Feeds one already-ordered message to the patient machine. */
  apply: (message: ParsedLifecycleMessage) => void;
  /** Jumps the machine to the server's view (`HYDRATE`). */
  /** May be async (it reads the assigned crew); messages arriving meanwhile are held, so order is kept. */
  hydrate: (snapshot: MissionSnapshot) => void | Promise<void>;
  /** Events after `seq` in order, or null when they could not be read. */
  fetchEventsAfter: (seq: number) => Promise<ParsedLifecycleMessage[] | null>;
  fetchSnapshot: () => Promise<MissionSnapshot | null>;
  persist: (lastSeq: number) => void;
  onError?: (error: unknown) => void;
}

export interface MissionSync {
  /** Entry point for every message from the channel. Never throws. */
  handle: (message: ParsedLifecycleMessage) => void;
  /**
   * Resume / reconnect / gap recovery: bring the machine up to the server's state. Safe to call at any time.
   * `auto` replays the missed events when it can and otherwise jumps to the snapshot. `snapshot` always jumps: a cold
   * launch has a fresh machine, and replaying events onto an `idle` machine would be ignored (rule 9).
   */
  reconcile: (mode?: "auto" | "snapshot") => Promise<void>;
  getLastSeq: () => number | null;
}

export function createMissionSync(deps: MissionSyncDeps): MissionSync {
  let lastSeq = deps.lastSeq;
  let reconciling: Promise<void> | null = null;
  let held: ParsedLifecycleMessage[] = [];

  const advance = (seq: number | undefined) => {
    if (seq === undefined) return;
    lastSeq = seq;
    deps.persist(seq);
  };

  const applyOne = (message: ParsedLifecycleMessage) => {
    try {
      deps.apply(message);
    } catch (error) {
      deps.onError?.(error);
    }
    advance(message.seq);
  };

  function handle(message: ParsedLifecycleMessage): void {
    if (reconciling) {
      held.push(message);
      return;
    }
    const decision = decideSeq(lastSeq, message.seq);
    if (decision === "duplicate") return;
    if (decision === "apply") {
      applyOne(message);
      return;
    }
    held.push(message);
    void reconcile();
  }

  function reconcile(mode: "auto" | "snapshot" = "auto"): Promise<void> {
    if (reconciling) return reconciling;
    reconciling = (async () => {
      try {
        const baseline = lastSeq;
        let replayed = false;
        if (mode === "auto" && baseline !== null) {
          const missed = await deps.fetchEventsAfter(baseline);
          const ordered = missed ? contiguousFrom(missed, baseline) : null;
          if (ordered && ordered.length > 0) {
            for (const message of ordered) applyOne(message);
            replayed = true;
          } else if (ordered) {
            replayed = true; // nothing was missed: the server is at our baseline
          }
        }
        if (!replayed) {
          const snapshot = await deps.fetchSnapshot();
          if (snapshot) {
            await deps.hydrate(snapshot);
            advance(snapshot.stateVersion);
          }
        }
      } catch (error) {
        deps.onError?.(error);
      } finally {
        reconciling = null;
        // Messages that arrived mid-reconcile: order them, drop what the recovery already covered, apply what follows.
        // A second gap is left for the next message to trigger, so a broken server cannot spin this loop.
        const pending = held.filter((m) => m.seq !== undefined).sort((a, b) => a.seq! - b.seq!);
        const legacy = held.filter((m) => m.seq === undefined);
        held = [];
        for (const message of legacy) applyOne(message);
        for (const message of pending) {
          const decision = decideSeq(lastSeq, message.seq);
          if (decision === "apply") applyOne(message);
        }
      }
    })();
    return reconciling;
  }

  return { handle, reconcile, getLastSeq: () => lastSeq };
}
