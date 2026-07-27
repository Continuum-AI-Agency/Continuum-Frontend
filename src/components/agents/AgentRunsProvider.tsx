'use client';

// Mounted ONCE in the authenticated layout, above the router.
//
// This is the component that makes an agent run survive navigation. Before it, the only
// thing tailing a run was the chat panel itself — and the panel lives inside the /organic
// route, so leaving the page tore down the reader (and, Backend-side, killed the model
// mid-turn). Nothing in the app knew a run existed once you looked away from it.
//
// Now: on load we ask the Backend which runs are still in flight, and we keep tailing every
// one of them into the app-level store for as long as they live — regardless of what page
// you are on, or whether any panel is mounted at all. Come back and the transcript is
// whole, because the frames never stopped arriving.

import {
  type AgentRunDto,
  activeAgentRunsResponseSchema,
  isTerminalAgentRunStatus,
} from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/ui/ToastProvider';
import { type RunEventAgentKind, useAgentRunStream } from '@/hooks/useAgentRunStream';
import { selectLiveRuns, useAgentRunStore } from '@/lib/agents/runStore';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { CanvasComposerRunTail } from './CanvasComposerRunTail';
import { HyperframesRunWorker } from './HyperframesRunWorker';

function EventLogRunTail({ run, agent }: { run: AgentRunDto; agent: RunEventAgentKind }) {
  useAgentRunStream(run.runId, agent);
  return agent === 'hyperframes' ? <HyperframesRunWorker run={run} /> : null;
}

/**
 * One tail per live run. React forbids calling a hook in a loop, so each run gets its own
 * mounted component — that is the whole reason this renders nothing.
 *
 * Canvas uses a specialized tail because it follows both its durable event log and
 * the run row that drives app-wide terminal status.
 */
function RunTail({ run }: { run: AgentRunDto }) {
  const { agent } = run;
  if (agent === 'canvas') return <CanvasComposerRunTail run={run} />;
  return <EventLogRunTail run={run} agent={agent} />;
}

const AGENT_LABEL: Record<AgentRunDto['agent'], string> = {
  organic: 'Organic',
  jaina: 'Jaina',
  hyperframes: 'HyperFrames',
  canvas: 'AI Studio',
};

/** Where a session lives, so a completion toast can take you back to it. */
const SESSION_HREF: Record<AgentRunDto['agent'], (sessionId: string) => string> = {
  organic: (sessionId) => `/organic?tab=agent&sessionId=${sessionId}`,
  jaina: (sessionId) => `/scale?tab=jaina&sessionId=${sessionId}`,
  hyperframes: () => '/ai-studio',
  // A composer run's sessionId IS its canvas room.
  canvas: (sessionId) => `/ai-studio?roomId=${sessionId}`,
};

/**
 * Toast a run that reached a terminal status while you were elsewhere — the point of
 * detaching runs is that you stop having to babysit them, so the run has to come find you.
 *
 * Runs already terminal the first time we see them (the hydrate on page load) are adopted
 * silently; otherwise every reload would re-toast work that finished yesterday.
 */
function useCompletionToasts(): void {
  const runs = useAgentRunStore((state) => state.runs);
  const viewingSessionId = useAgentRunStore((state) => state.viewingSessionId);
  const { show } = useToast();
  const router = useRouter();
  const announced = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    for (const { run } of Object.values(runs)) {
      if (!isTerminalAgentRunStatus(run.status) || announced.current.has(run.runId)) continue;
      announced.current.add(run.runId);

      if (!seeded.current) continue;
      // `cancelled` is a user action — they already know.
      if (run.status === 'cancelled') continue;
      // They watched it finish. A toast is for work that completed somewhere they weren't.
      if (run.sessionId && run.sessionId === viewingSessionId) continue;

      const label = AGENT_LABEL[run.agent];
      // Room-level runs (the composer) carry no nodeId — link to the room alone.
      const href =
        run.origin?.surface === 'ai-studio'
          ? `/ai-studio?roomId=${encodeURIComponent(run.origin.roomId)}${
              run.origin.nodeId ? `&focusNodeId=${encodeURIComponent(run.origin.nodeId)}` : ''
            }`
          : SESSION_HREF[run.agent](run.sessionId);
      const openSession = run.sessionId
        ? {
            label: 'View',
            onClick: () => router.push(href),
          }
        : undefined;

      show({
        title:
          run.status === 'completed'
            ? `${label} finished${run.title ? `: ${run.title}` : ''}`
            : `${label} run failed`,
        description: run.status === 'failed' ? (run.errorMessage ?? undefined) : undefined,
        variant: run.status === 'completed' ? 'success' : 'error',
        action: openSession,
        dedupeKey: `agent-run:${run.runId}`,
      });
    }
    seeded.current = true;
  }, [runs, show, router, viewingSessionId]);
}

async function fetchActiveRuns(): Promise<AgentRunDto[]> {
  const token = await getBrowserAccessToken();
  if (!token) return [];

  const response = await fetch(`${getApiBaseUrl()}/api/agents/runs/active`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];

  const parsed = activeAgentRunsResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.runs : [];
}

export function AgentRunsProvider({ children }: { children: React.ReactNode }) {
  const upsertRun = useAgentRunStore((state) => state.upsertRun);
  // useShallow: selectLiveRuns builds a fresh array every call, and an unstable snapshot
  // identity sends Zustand into an infinite re-render loop.
  const liveRuns = useAgentRunStore(useShallow(selectLiveRuns));

  useCompletionToasts();

  // Find the runs that were already going before this page existed — the ones started
  // before a navigation, a reload, or in another tab.
  useEffect(() => {
    let cancelled = false;
    void fetchActiveRuns().then((runs) => {
      if (cancelled) return;
      for (const run of runs) upsertRun(run);
    });
    return () => {
      cancelled = true;
    };
  }, [upsertRun]);

  return (
    <>
      {liveRuns.map((run) => (
        <RunTail key={run.runId} run={run} />
      ))}
      {children}
    </>
  );
}
