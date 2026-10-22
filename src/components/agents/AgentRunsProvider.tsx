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
  activeAgentRunsQuerySchema,
  activeAgentRunsResponseSchema,
  isTerminalAgentRunStatus,
} from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { type RunEventAgentKind, useAgentRunStream } from '@/hooks/useAgentRunStream';
import {
  browserStorage,
  createAcknowledgedRuns,
  shouldAnnounceRunEnd,
} from '@/lib/agents/runCompletionToast';
import { selectLiveRuns, useAgentRunStore } from '@/lib/agents/runStore';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { jainaSessionHref, resolveJainaSessionAdAccount } from '@/lib/jaina/deepLink';
import { DurableAiStudioRunTail } from './CanvasComposerRunTail';

function EventLogRunTail({ run, agent }: { run: AgentRunDto; agent: RunEventAgentKind }) {
  useAgentRunStream(run.runId, agent);
  return null;
}

/**
 * One tail per live run. React forbids calling a hook in a loop, so each run gets its own
 * mounted component — that is the whole reason this renders nothing.
 *
 * AI Studio runs use a specialized tail because they follow both their durable event
 * log and the run row that drives app-wide terminal status.
 */
function RunTail({ run }: { run: AgentRunDto }) {
  const { agent } = run;
  if (agent === 'canvas' || agent === 'hyperframes') return <DurableAiStudioRunTail run={run} />;
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
  jaina: (sessionId) => jainaSessionHref(sessionId),
  hyperframes: () => '/ai-studio',
  // A composer run's sessionId IS its canvas room.
  canvas: (sessionId) => `/ai-studio?roomId=${sessionId}`,
};

function runHref(run: AgentRunDto): string {
  // Room-level runs (the composer) carry no nodeId — link to the room alone.
  if (run.origin?.surface === 'ai-studio') {
    return `/ai-studio?roomId=${encodeURIComponent(run.origin.roomId)}${
      run.origin.nodeId ? `&focusNodeId=${encodeURIComponent(run.origin.nodeId)}` : ''
    }`;
  }
  return SESSION_HREF[run.agent](run.sessionId);
}

/**
 * Toast a run that reached a terminal status while you were elsewhere — the point of
 * detaching runs is that you stop having to babysit them, so the run has to come find you.
 * Which ends are worth a toast, and the once-per-run memory, are `shouldAnnounceRunEnd` and
 * `createAcknowledgedRuns`.
 */
function useCompletionToasts(): void {
  const runs = useAgentRunStore((state) => state.runs);
  const viewingSessionId = useAgentRunStore((state) => state.viewingSessionId);
  const { show } = useToast();
  const router = useRouter();
  const listeningSinceMs = useRef(Date.now());
  const acknowledged = useRef<ReturnType<typeof createAcknowledgedRuns> | null>(null);

  useEffect(() => {
    acknowledged.current ??= createAcknowledgedRuns(browserStorage());
    const memory = acknowledged.current;

    for (const { run, events } of Object.values(runs)) {
      if (!isTerminalAgentRunStatus(run.status)) continue;
      const announce = shouldAnnounceRunEnd({
        run,
        events,
        listeningSinceMs: listeningSinceMs.current,
        acknowledged: memory,
        viewingSessionId,
      });
      // Said or adopted, a run's end is settled here once — the next pass, reload or tab skips it.
      memory.add(run.runId);
      if (!announce) continue;

      const label = AGENT_LABEL[run.agent];
      const href = runHref(run);
      const brandId = run.brandId;
      const openSession = run.sessionId
        ? {
            label: 'View',
            onClick: () => {
              // A Jaina conversation lives under one ad account; land on that account.
              if (run.agent !== 'jaina' || !brandId) {
                router.push(href);
                return;
              }
              void resolveJainaSessionAdAccount({ brandId, sessionId: run.sessionId }).then(
                (adAccountId) => router.push(jainaSessionHref(run.sessionId, adAccountId)),
              );
            },
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
  }, [runs, show, router, viewingSessionId]);
}

async function fetchActiveRuns(brandId: string): Promise<AgentRunDto[]> {
  const token = await getBrowserAccessToken();
  if (!token) return [];

  const query = activeAgentRunsQuerySchema.parse({ brandId });
  const params = new URLSearchParams(query);
  const response = await fetch(`${getApiBaseUrl()}/api/agents/runs/active?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];

  const parsed = activeAgentRunsResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.runs : [];
}

export function AgentRunsProvider({ children }: { children: React.ReactNode }) {
  const { activeBrandId, user } = useActiveBrandContext();
  const userId = user?.id;
  const upsertRun = useAgentRunStore((state) => state.upsertRun);
  const resetRuns = useAgentRunStore((state) => state.reset);
  // useShallow: selectLiveRuns builds a fresh array every call, and an unstable snapshot
  // identity sends Zustand into an infinite re-render loop.
  const liveRuns = useAgentRunStore(useShallow(selectLiveRuns)).filter(
    (run) => run.brandId === activeBrandId,
  );

  useCompletionToasts();

  // Tear down the prior tenant synchronously, before descendants can attach tails for it.
  useLayoutEffect(() => {
    resetRuns();
  }, [activeBrandId, userId, resetRuns]);

  // Find only the runs that belong to the active tenant and current identity.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchActiveRuns(activeBrandId)
      .then((runs) => {
        if (cancelled) return;
        for (const run of runs) {
          if (run.brandId === activeBrandId) upsertRun(run);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, userId, upsertRun]);

  return (
    <>
      {liveRuns.map((run) => (
        <RunTail key={run.runId} run={run} />
      ))}
      {children}
    </>
  );
}
