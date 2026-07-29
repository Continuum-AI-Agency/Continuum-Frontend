'use client';

// The workspace has exactly one focused run, and it has two front doors: the
// `?run=` deep link in a report email, and a click in the Runs tab. This hook is
// the single owner of that id so both doors end up in the same place — the same
// `useAutomationRunDetail` query already feeding the canvas overlay and the
// live-run pill. Clicking a row therefore starts no second polling loop.
//
// The location seam is injected so the hook is testable without a process-wide
// mock of `next/navigation`.

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

export const AUTOMATION_RUN_SEARCH_PARAM = 'run';

export type RunLocation = {
  /** The run id the current URL points at, or null. */
  runId: string | null;
  /** Rewrites the URL in place; never pushes a history entry. */
  replaceRunId: (runId: string | null) => void;
};

export function useRunSearchParamLocation(): RunLocation {
  const router = useRouter();
  const searchParams = useSearchParams();

  const replaceRunId = useCallback(
    (runId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (runId) next.set(AUTOMATION_RUN_SEARCH_PARAM, runId);
      else next.delete(AUTOMATION_RUN_SEARCH_PARAM);
      const query = next.toString();
      router.replace(query ? `?${query}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  return { runId: searchParams.get(AUTOMATION_RUN_SEARCH_PARAM), replaceRunId };
}

export type ActiveRun = {
  activeRunId: string | null;
  /** Focuses a run (or clears the focus) in state and in the URL together. */
  focusRun: (runId: string | null) => void;
};

export function useActiveRun({
  useLocation = useRunSearchParamLocation,
}: {
  useLocation?: () => RunLocation;
} = {}): ActiveRun {
  const { runId, replaceRunId } = useLocation();
  const [activeRunId, setActiveRunId] = useState<string | null>(() => runId);

  const focusRun = useCallback(
    (nextRunId: string | null) => {
      setActiveRunId(nextRunId);
      replaceRunId(nextRunId);
    },
    [replaceRunId],
  );

  return { activeRunId, focusRun };
}
