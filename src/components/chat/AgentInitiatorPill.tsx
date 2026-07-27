'use client';

import type { AgentInitiator, AgentKind } from '@continuum/contracts';
import { agentConversationPath, agentInitiatorLabel } from '@continuum/contracts';
import { ArrowUpRightIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { Pill } from '@/components/kibo-ui/pill';
import { cn } from '@/lib/utils';

// "AI · Organic" — the marker on a conversation another agent started, plus the
// banner that gives the callee transcript a way back to the originating run.

export type AgentInitiatorPillProps = {
  initiator: AgentInitiator | null | undefined;
  initiatorAgent: string | null | undefined;
  className?: string;
};

export function AgentInitiatorPill({
  initiator,
  initiatorAgent,
  className,
}: AgentInitiatorPillProps) {
  if (initiator !== 'agent') return null;
  return (
    <Pill variant="outline" className={cn('gap-1 text-primary', className)}>
      <SparklesIcon className="size-3" />
      {agentInitiatorLabel(initiatorAgent)}
    </Pill>
  );
}

const KNOWN_AGENTS: readonly AgentKind[] = ['organic', 'jaina', 'canvas', 'hyperframes'];

const asAgentKind = (value: string | null | undefined): AgentKind | null =>
  KNOWN_AGENTS.find((agent) => agent === value) ?? null;

export type ChatProvenanceBannerProps = {
  initiator: AgentInitiator | null | undefined;
  initiatorAgent: string | null | undefined;
  callerSessionId: string | null | undefined;
  callerRunId?: string | null;
  className?: string;
};

/**
 * Header strip on a callee conversation: "Initiated by Organic — view
 * originating run". The link is built by the shared `agentConversationPath` so
 * the deep-link scheme cannot drift from the Backend's.
 */
export function ChatProvenanceBanner({
  initiator,
  initiatorAgent,
  callerSessionId,
  callerRunId,
  className,
}: ChatProvenanceBannerProps) {
  if (initiator !== 'agent') return null;

  const callerAgent = asAgentKind(initiatorAgent);
  const label = agentInitiatorLabel(initiatorAgent).replace(/^AI · /, '');
  const href =
    callerAgent && callerSessionId
      ? agentConversationPath(callerAgent, callerSessionId, callerRunId ?? undefined)
      : null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <SparklesIcon className="size-3.5 text-primary" />
      <span>Initiated by {label}</span>
      {href ? (
        <>
          <span aria-hidden="true">—</span>
          <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">
            view originating run
            <ArrowUpRightIcon className="size-3" />
          </Link>
        </>
      ) : null}
    </div>
  );
}
