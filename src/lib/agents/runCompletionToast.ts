// When a run's end is worth a toast, and remembering that it was said.
//
// A completion toast is for work that ended somewhere you weren't, while the app was open. The
// old rule — "a run already terminal the first time we see it is adopted silently" — never held:
// the hydrate is async, so the first pass saw an EMPTY store, and every run the hydrate later
// found `running` whose log already ended re-toasted on every page load. A Jaina run killed
// mid-turn by a Backend deploy is exactly that: its row stays `running`, its log carries the
// terminal `error` frame, and "Jaina run failed" greeted the reader on every Optimizer visit.
//
// Two rules close it, each enough on its own for its case:
//   - A run that ENDED BEFORE this page opened is adopted silently: it is history, not news.
//   - A run is announced at most ONCE per browser, remembered across reloads and tabs.

import {
  type AgentRunDto,
  type AgentRunEventDto,
  runStatusFromFrameType,
} from '@continuum/contracts';

/** When the run ended, as the row or the log's last terminal frame says; null when unknowable. */
export function runEndedAtMs(run: AgentRunDto, events: readonly AgentRunEventDto[]): number | null {
  const finished = run.finishedAt ? Date.parse(run.finishedAt) : Number.NaN;
  if (Number.isFinite(finished)) return finished;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (!event || !runStatusFromFrameType(event.type)) continue;
    const at = Date.parse(event.ts);
    return Number.isFinite(at) ? at : null;
  }
  return null;
}

export function shouldAnnounceRunEnd(input: {
  run: AgentRunDto;
  events: readonly AgentRunEventDto[];
  /** When this page started listening. A run that ended before it is not news. */
  listeningSinceMs: number;
  acknowledged: { has: (runId: string) => boolean };
  viewingSessionId: string | null;
}): boolean {
  const { run } = input;
  // `cancelled` is a user action — they already know.
  if (run.status !== 'completed' && run.status !== 'failed') return false;
  if (input.acknowledged.has(run.runId)) return false;
  // Another agent's callee run: the caller's own turn reports it.
  if (run.initiator === 'agent') return false;
  // They watched it finish.
  if (run.sessionId && run.sessionId === input.viewingSessionId) return false;
  const endedAt = runEndedAtMs(run, input.events);
  return endedAt === null || endedAt >= input.listeningSinceMs;
}

const ACKNOWLEDGED_KEY = 'continuum:agent-run-toasts:acknowledged';
/** Enough for every run a person could have ended recently; the oldest fall off first. */
const ACKNOWLEDGED_CAP = 200;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The runs this browser has already announced (or adopted). Per-viewer convenience state, so it
 * lives in localStorage — and every read and write survives storage being unavailable, which
 * only costs the dedupe across reloads, never the toast itself.
 */
export function createAcknowledgedRuns(storage: KeyValueStorage | null): {
  has: (runId: string) => boolean;
  add: (runId: string) => void;
} {
  const read = (): string[] => {
    try {
      const raw = storage?.getItem(ACKNOWLEDGED_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  };
  const ids = read();
  const known = new Set(ids);

  return {
    // Re-read on a miss so a second tab's announcement counts here too.
    has: (runId) => known.has(runId) || read().includes(runId),
    add: (runId) => {
      if (known.has(runId)) return;
      known.add(runId);
      const next = [...read().filter((id) => id !== runId), runId].slice(-ACKNOWLEDGED_CAP);
      try {
        storage?.setItem(ACKNOWLEDGED_KEY, JSON.stringify(next));
      } catch {
        // Storage refused (private window, quota): this tab still remembers it.
      }
    },
  };
}

/** localStorage when the browser grants it, else null. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
