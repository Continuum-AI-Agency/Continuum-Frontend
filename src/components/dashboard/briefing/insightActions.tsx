'use client';

import {
  CalendarPlus,
  ExternalLink,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { enqueueAgentMentions } from '@/lib/agent/mention-queue-store';
import type { AgentMentionSuggestion } from '@/lib/agent-references';

// The "North Star" verbs an insight row routes into. One source for the
// right-click context menu and the trailing tap-friendly dropdown so they never
// drift. Carrying the specific creative/campaign as a seed is a tracked
// fast-follow; v1 navigates to each surface.
export const NORTH_STAR_VERBS = [
  { key: 'inspire', label: 'Open in Studio', icon: Sparkles, href: '/ai-studio' },
  { key: 'plan', label: 'Plan a post', icon: CalendarPlus, href: '/organic?tab=planner' },
  { key: 'launch', label: 'Launch a campaign', icon: Rocket, href: '/scale/campaign-canvas' },
  { key: 'jaina', label: 'Ask Jaina', icon: MessageSquare, href: '/scale?tab=jaina' },
] as const;

type InsightActionExtras = {
  permalink?: string;
  /** When set, "Add to agent" pins this structured mention into the organic composer. */
  agentSuggestion?: AgentMentionSuggestion | null;
};

export function InsightContextActions({ permalink, agentSuggestion }: InsightActionExtras) {
  const router = useRouter();
  return (
    <>
      <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">
        Take action
      </ContextMenuLabel>
      {agentSuggestion ? (
        <ContextMenuItem
          className="gap-2 text-xs"
          onSelect={() => enqueueAgentMentions(agentSuggestion)}
        >
          <MessageSquarePlus className="size-3.5" />
          Add to agent
        </ContextMenuItem>
      ) : null}
      {NORTH_STAR_VERBS.map((verb) => (
        <ContextMenuItem
          key={verb.key}
          className="gap-2 text-xs"
          onSelect={() => router.push(verb.href)}
        >
          <verb.icon className="size-3.5" />
          {verb.label}
        </ContextMenuItem>
      ))}
      {permalink ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="gap-2 text-xs"
            onSelect={() => window.open(permalink, '_blank', 'noopener')}
          >
            <ExternalLink className="size-3.5" />
            Open original
          </ContextMenuItem>
        </>
      ) : null}
    </>
  );
}

export function InsightActionsDropdown({ permalink, agentSuggestion }: InsightActionExtras) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Row actions"
            className="size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        {agentSuggestion ? (
          <>
            <DropdownMenuItem
              className="gap-2 text-xs"
              onSelect={() => enqueueAgentMentions(agentSuggestion)}
            >
              <MessageSquarePlus className="size-3.5" />
              Add to agent
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {NORTH_STAR_VERBS.map((verb) => (
          <DropdownMenuItem
            key={verb.key}
            className="gap-2 text-xs"
            onSelect={() => router.push(verb.href)}
          >
            <verb.icon className="size-3.5" />
            {verb.label}
          </DropdownMenuItem>
        ))}
        {permalink ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-xs"
              onSelect={() => window.open(permalink, '_blank', 'noopener')}
            >
              <ExternalLink className="size-3.5" />
              Open original
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
