'use client';

import type { AgentSessionListFilters } from '@continuum/contracts';
import { Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { AgentInitiatorPill } from '@/components/chat/AgentInitiatorPill';
import { ChatHistoryFilterBar } from '@/components/chat/ChatHistoryFilterBar';
import {
  CollapseConversationsButton,
  CollapsedConversationsRail,
} from '@/components/chat/collapsibleConversations';
import { SessionTagEditor } from '@/components/chat/SessionTagEditor';
import { useSessionSearch } from '@/components/chat/useSessionSearch';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { collectSessionTags } from '@/lib/agents/session-filters';
import type { OrganicSession } from '@/lib/organic/agent-sessions';
import { cn } from '@/lib/utils';
import { presentSessionTitles } from './sessionTitles';

type OrganicSessionSidebarProps = {
  sessions: OrganicSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  isInteractionDisabled: boolean;
  /** Sessions whose run is still generating — rendered with a "Working" marker. */
  streamingSessionIds?: ReadonlySet<string>;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  /**
   * Server-side chat-history search. Filtering must run in Postgres (trgm over
   * title+preview, tag containment) rather than over the page this sidebar
   * holds, so an old conversation is findable at all.
   */
  onSearchSessions?: (filters: AgentSessionListFilters) => Promise<OrganicSession[]>;
  /** Persists a session's tags; returns the tags as stored. */
  onUpdateSessionTags?: (sessionId: string, tags: string[]) => Promise<string[]>;
};

const AGENT_OPTIONS = [
  { value: 'jaina', label: 'Jaina' },
  { value: 'canvas', label: 'AI Studio' },
];

const SIDEBAR_BASE_CLASS =
  '@container/agent-sidebar flex w-full shrink-0 flex-col border-b border-border/60 bg-background/60 backdrop-blur md:border-b-0 md:border-r';

function formatSessionTime(value: string | null): string {
  if (!value) return 'No activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function OrganicSessionSidebar({
  sessions,
  activeSessionId,
  isLoading,
  isInteractionDisabled,
  streamingSessionIds,
  isCollapsed = false,
  onToggleCollapsed,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onSearchSessions,
  onUpdateSessionTags,
}: OrganicSessionSidebarProps) {
  const [tagOverrides, setTagOverrides] = useState<Record<string, string[]>>({});

  const noSearch = useCallback(async () => [] as OrganicSession[], []);
  const search = useSessionSearch<OrganicSession>({
    isEnabled: Boolean(onSearchSessions),
    fetchSessions: onSearchSessions ?? noSearch,
  });

  // While a facet is set the server owns the list; otherwise the parent's live
  // list (with streaming markers) keeps rendering.
  const visibleSessions = search.isActive ? search.results : sessions;
  const sessionTitles = useMemo(() => presentSessionTitles(visibleSessions), [visibleSessions]);
  const availableTags = useMemo(() => collectSessionTags(sessions), [sessions]);

  const tagsFor = (session: OrganicSession): string[] =>
    tagOverrides[session.sessionId] ?? session.tags ?? [];

  const handleUpdateTags = async (sessionId: string, tags: string[]) => {
    if (!onUpdateSessionTags) return;
    const stored = await onUpdateSessionTags(sessionId, tags);
    setTagOverrides((current) => ({ ...current, [sessionId]: stored }));
  };

  if (isCollapsed && onToggleCollapsed) {
    return (
      <aside className={cn(SIDEBAR_BASE_CLASS, 'md:w-14')}>
        <CollapsedConversationsRail
          onExpand={onToggleCollapsed}
          onNewSession={onNewSession}
          isInteractionDisabled={isInteractionDisabled}
        />
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        SIDEBAR_BASE_CLASS,
        'md:w-[var(--shell-secondary-w)] md:max-w-[22rem] md:min-w-[var(--shell-secondary-w-min)]',
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1">
          {onToggleCollapsed ? <CollapseConversationsButton onToggle={onToggleCollapsed} /> : null}
          <span className="px-2 text-xs font-medium">Chats</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onNewSession}
          disabled={isInteractionDisabled}
          className="h-6 gap-1 px-2 text-xs"
        >
          <PlusIcon className="size-3" />
          New
        </Button>
      </div>

      {onSearchSessions ? (
        <ChatHistoryFilterBar
          filters={search.filters}
          onFiltersChange={search.setFilters}
          availableTags={availableTags}
          agentOptions={AGENT_OPTIONS}
          isSearching={search.isSearching}
        />
      ) : null}
      <ScrollArea className="max-h-44 md:max-h-none md:flex-1 md:min-h-0">
        <div className="flex gap-2 p-2 md:flex-col">
          {isLoading && visibleSessions.length === 0 && !search.isActive ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Loading conversations…</p>
          ) : null}

          {search.isActive && !search.isSearching && visibleSessions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No conversations match these filters.
            </p>
          ) : null}

          {!isLoading && !search.isActive && sessions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Start a chat to create your first conversation.
            </p>
          ) : null}

          {visibleSessions.map((session) => {
            const isActive = session.sessionId === activeSessionId;
            const isWorking = streamingSessionIds?.has(session.sessionId) ?? false;
            return (
              <div
                key={session.sessionId}
                className={cn(
                  'group/session relative flex min-w-[14rem] flex-col rounded-md border transition-colors md:min-w-0',
                  isActive
                    ? 'border-primary/70 bg-primary/10'
                    : 'border-border/60 bg-background/40 hover:border-border hover:bg-background/70',
                  isInteractionDisabled && 'opacity-60',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(session.sessionId)}
                  disabled={isInteractionDisabled || isActive}
                  className={cn(
                    'flex w-full flex-col items-start gap-1 px-3 py-2 pr-8 text-left',
                    isInteractionDisabled
                      ? 'cursor-not-allowed'
                      : isActive
                        ? 'cursor-default'
                        : 'cursor-pointer',
                  )}
                >
                  <span className="line-clamp-2 w-full text-xs font-medium text-primary">
                    {sessionTitles.get(session.sessionId) ?? 'New conversation'}
                  </span>
                  <div className="flex w-full flex-wrap items-center gap-1">
                    <AgentInitiatorPill
                      initiator={session.initiator}
                      initiatorAgent={session.initiatorAgent}
                    />
                    {tagsFor(session).map((tag) => (
                      <Pill key={tag} variant="outline" className="text-muted-foreground">
                        #{tag}
                      </Pill>
                    ))}
                  </div>
                  <div className="flex w-full items-center justify-between gap-2">
                    {isWorking ? (
                      <span className="inline-flex items-center gap-1 text-2xs uppercase tracking-wide text-primary">
                        <Loader2Icon className="size-3 animate-spin" />
                        Working
                      </span>
                    ) : (
                      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                        {session.lastMessageRole ?? 'session'}
                      </span>
                    )}
                    <span className="text-2xs text-muted-foreground">
                      {formatSessionTime(session.lastMessageAt ?? session.createdAt)}
                    </span>
                  </div>
                </button>
                <div
                  className={cn(
                    'absolute right-1 top-1 flex items-center gap-0.5',
                    isActive ? 'opacity-100' : 'opacity-0 group-hover/session:opacity-100',
                  )}
                >
                  {onUpdateSessionTags ? (
                    <SessionTagEditor
                      sessionId={session.sessionId}
                      tags={tagsFor(session)}
                      disabled={isInteractionDisabled}
                      onChange={handleUpdateTags}
                    />
                  ) : null}
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    title="Delete conversation"
                    onClick={() => onDeleteSession(session.sessionId)}
                    disabled={isInteractionDisabled}
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
