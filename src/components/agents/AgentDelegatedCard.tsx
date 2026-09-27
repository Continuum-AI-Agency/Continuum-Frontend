'use client';

import type { AgentDelegatedFrameData } from '@continuum/contracts';
import { AGENT_INITIATOR_LABELS, agentConversationPath } from '@continuum/contracts';
import { ArrowLeftRightIcon, ArrowUpRightIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { cn } from '@/lib/utils';
import { HyperframesFilmView, useHyperframesFilm } from './HyperframesRunFilm';

// One cross-agent call, as it reads in the CALLER's transcript:
// "⇄ Asked Jaina: '<query>'" with the call status and a link into the callee
// conversation. Shared by the Organic transcript, the Jaina renderer and the
// AI Studio composer so a delegation looks the same wherever it happens.

const STATUS_TEXT: Record<AgentDelegatedFrameData['status'], string> = {
  running: 'Working',
  completed: 'Answered',
  failed: 'Failed',
  timeout: 'Still running',
  refused: 'Refused',
};

const FILM_STATUS = { running: 'running', ready: 'completed', failed: 'failed' } as const;

const STATUS_VARIANT: Record<
  AgentDelegatedFrameData['status'],
  'success' | 'error' | 'warning' | 'info'
> = {
  running: 'info',
  completed: 'success',
  failed: 'error',
  timeout: 'warning',
  refused: 'warning',
};

export const agentDelegatedLabel = (data: AgentDelegatedFrameData): string =>
  `Asked ${AGENT_INITIATOR_LABELS[data.calleeAgent] ?? data.calleeAgent}`;

/** The link into the callee conversation: the frame's own deep link, else derived. */
export const agentDelegatedHref = (data: AgentDelegatedFrameData): string | null => {
  if (data.deepLink) return data.deepLink;
  if (!data.calleeSessionId) return null;
  return agentConversationPath(data.calleeAgent, data.calleeSessionId, data.calleeRunId);
};

export type AgentDelegatedCardProps = {
  data: AgentDelegatedFrameData;
  className?: string;
};

export function AgentDelegatedCard({ data, className }: AgentDelegatedCardProps) {
  const href = agentDelegatedHref(data);
  // A film outlives the call that asked for it, so its card follows the run, not the frame.
  const film = useHyperframesFilm(
    data.calleeAgent === 'hyperframes' ? (data.calleeRunId ?? null) : null,
  );
  const status = film ? FILM_STATUS[film.state] : data.status;

  return (
    <div
      data-testid="agent-delegated-card"
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <ArrowLeftRightIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">{agentDelegatedLabel(data)}</span>
        <Pill variant="secondary" className="ml-auto gap-1">
          {status === 'running' ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <PillIndicator variant={STATUS_VARIANT[status]} />
          )}
          {STATUS_TEXT[status]}
        </Pill>
      </div>

      <p className="line-clamp-3 text-xs text-muted-foreground">“{data.query}”</p>

      {film ? <HyperframesFilmView film={film} /> : null}

      {href ? (
        <Link
          href={href}
          className="inline-flex w-fit items-center gap-1 text-2xs text-primary hover:underline"
        >
          Open conversation
          <ArrowUpRightIcon className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
