'use client';

import type { AgentSessionListFilters } from '@continuum/contracts';
import { Loader2Icon, Plus, Trash2Icon } from 'lucide-react';
import React from 'react';
import { AgentInitiatorPill } from '@/components/chat/AgentInitiatorPill';
import { ChatHistoryFilterBar } from '@/components/chat/ChatHistoryFilterBar';
import {
  CollapseConversationsButton,
  CollapsedConversationsRail,
} from '@/components/chat/collapsibleConversations';
import { SessionTagEditor } from '@/components/chat/SessionTagEditor';
import { useSessionSearch } from '@/components/chat/useSessionSearch';
import { CreateCampaignGoalDialog } from '@/components/goals/CreateCampaignGoalDialog';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { collectSessionTags } from '@/lib/agents/session-filters';
import { GOALS_PRODUCTION_DISABLED_REASON } from '@/lib/goals/access';
import type { JainaConversationSession } from '@/lib/jaina/conversations';
import { cn } from '@/lib/utils';
import { JainaGoalsSidebarPanel } from './JainaGoalsSidebarPanel';

type SidebarMode = 'chats' | 'goals';

type JainaConversationSidebarProps = {
  sessions: JainaConversationSession[];
  activeSessionId: string;
  sessionTitleById?: Record<string, string>;
  generatingSessionIds?: ReadonlySet<string>;
  isLoading: boolean;
  isInteractionDisabled: boolean;
  deletingSessionId?: string | null;
  brandId: string;
  goalsAccessEnabled: boolean;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  onCreateConversation: () => void;
  onSelectConversation: (sessionId: string) => void;
  onDeleteConversation: (sessionId: string) => void;
  /** Server-side chat-history search (trgm over title+preview, tag containment). */
  onSearchConversations?: (filters: AgentSessionListFilters) => Promise<JainaConversationSession[]>;
  /** Persists a conversation's tags; returns the tags as stored. */
  onUpdateConversationTags?: (sessionId: string, tags: string[]) => Promise<string[]>;
};

const AGENT_OPTIONS = [
  { value: 'organic', label: 'Organic' },
  { value: 'canvas', label: 'AI Studio' },
];

const SIDEBAR_BASE_CLASS =
  'flex w-full shrink-0 flex-col border-b border-border/60 bg-background/60 backdrop-blur md:border-b-0 md:border-r';

function formatSessionTimestamp(value: string | null): string {
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

function getSessionTitle(
  session: JainaConversationSession,
  sessionTitleById?: Record<string, string>,
): string {
  const overrideTitle = sessionTitleById?.[session.sessionId]?.trim();
  if (overrideTitle) {
    return overrideTitle;
  }
  if (session.title && session.title.trim().length > 0) {
    return session.title;
  }
  if (session.lastMessagePreview && session.lastMessagePreview.length > 0) {
    return session.lastMessagePreview;
  }
  return 'New conversation';
}

export function JainaConversationSidebar({
  sessions,
  activeSessionId,
  sessionTitleById,
  generatingSessionIds,
  isLoading,
  isInteractionDisabled,
  deletingSessionId,
  brandId,
  goalsAccessEnabled,
  isCollapsed = false,
  onToggleCollapsed,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
  onSearchConversations,
  onUpdateConversationTags,
}: JainaConversationSidebarProps) {
  const [mode, setMode] = React.useState<SidebarMode>('chats');
  const [tagOverrides, setTagOverrides] = React.useState<Record<string, string[]>>({});

  const noSearch = React.useCallback(async () => [] as JainaConversationSession[], []);
  const search = useSessionSearch<JainaConversationSession>({
    isEnabled: Boolean(onSearchConversations),
    fetchSessions: onSearchConversations ?? noSearch,
  });

  // A set facet hands the visible list to the server; otherwise the surface's
  // own live list (with generating markers) keeps rendering.
  const visibleSessions = search.isActive ? search.results : sessions;
  const availableTags = React.useMemo(() => collectSessionTags(sessions), [sessions]);

  const tagsFor = (session: JainaConversationSession): string[] =>
    tagOverrides[session.sessionId] ?? session.tags ?? [];

  const handleUpdateTags = async (sessionId: string, tags: string[]) => {
    if (!onUpdateConversationTags) return;
    const stored = await onUpdateConversationTags(sessionId, tags);
    setTagOverrides((current) => ({ ...current, [sessionId]: stored }));
  };

  if (isCollapsed && onToggleCollapsed) {
    return (
      <aside className={cn(SIDEBAR_BASE_CLASS, 'md:w-14')}>
        <CollapsedConversationsRail
          onExpand={onToggleCollapsed}
          onNewSession={onCreateConversation}
          isInteractionDisabled={isInteractionDisabled}
        />
      </aside>
    );
  }

  return (
    <aside className={cn(SIDEBAR_BASE_CLASS, 'md:w-72')}>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1">
          {onToggleCollapsed ? <CollapseConversationsButton onToggle={onToggleCollapsed} /> : null}
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => value && setMode(value as SidebarMode)}
            aria-label="Jaina workspace view"
          >
            <ToggleGroupItem value="chats" className="h-6 px-2 text-xs">
              Chats
            </ToggleGroupItem>
            {goalsAccessEnabled ? (
              <ToggleGroupItem value="goals" className="h-6 px-2 text-xs">
                Goals
              </ToggleGroupItem>
            ) : (
              <TooltipProvider delay={150}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="cursor-not-allowed">
                        <ToggleGroupItem
                          value="goals"
                          disabled
                          aria-label={`Goals (${GOALS_PRODUCTION_DISABLED_REASON})`}
                          className="pointer-events-none h-6 px-2 text-xs opacity-50"
                        >
                          Goals
                        </ToggleGroupItem>
                      </span>
                    }
                  />
                  <TooltipContent side="bottom">{GOALS_PRODUCTION_DISABLED_REASON}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </ToggleGroup>
        </div>
        {mode === 'chats' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onCreateConversation}
            disabled={isInteractionDisabled}
            className="gap-1"
            aria-label="Create new conversation"
          >
            <Plus />
            New
          </Button>
        ) : mode === 'goals' ? (
          <CreateCampaignGoalDialog brandId={brandId} compact />
        ) : null}
      </div>

      {mode === 'goals' ? (
        <JainaGoalsSidebarPanel brandId={brandId} />
      ) : (
        <>
          {onSearchConversations ? (
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
                <span className="text-xs px-2 py-3 text-muted-foreground">
                  Loading conversations…
                </span>
              ) : null}

              {search.isActive && !search.isSearching && visibleSessions.length === 0 ? (
                <span className="text-xs px-2 py-3 text-muted-foreground">
                  No conversations match these filters.
                </span>
              ) : null}

              {!isLoading && !search.isActive && sessions.length === 0 ? (
                <span className="text-xs px-2 py-3 text-muted-foreground">
                  Start a chat to create your first conversation.
                </span>
              ) : null}

              {visibleSessions.map((session) => {
                const isActive = session.sessionId === activeSessionId;
                const isDeleting = deletingSessionId === session.sessionId;
                const isGenerating = generatingSessionIds?.has(session.sessionId) ?? false;
                return (
                  <div
                    key={session.sessionId}
                    className={cn(
                      'flex min-w-[220px] items-start gap-1 rounded-md border text-left transition-colors md:min-w-0',
                      isActive
                        ? 'border-primary/70 bg-primary/10'
                        : 'border-border/60 bg-background/40 hover:border-border hover:bg-background/70',
                      isInteractionDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectConversation(session.sessionId)}
                      disabled={isInteractionDisabled || isActive || isDeleting}
                      className={cn(
                        'flex flex-1 flex-col items-start gap-1 px-3 py-2 text-left',
                        isInteractionDisabled || isDeleting
                          ? 'cursor-not-allowed'
                          : 'cursor-pointer',
                      )}
                    >
                      <span className="text-xs font-medium line-clamp-2 w-full text-primary">
                        {getSessionTitle(session, sessionTitleById)}
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
                        {isGenerating ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Loader2Icon className="size-3 animate-spin" />
                            <span className="text-xs uppercase tracking-wide">Working</span>
                          </span>
                        ) : (
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {session.lastMessageRole ?? 'session'}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatSessionTimestamp(session.lastMessageAt)}
                        </span>
                      </div>
                    </button>
                    {onUpdateConversationTags ? (
                      <SessionTagEditor
                        sessionId={session.sessionId}
                        tags={tagsFor(session)}
                        disabled={isInteractionDisabled || isDeleting}
                        onChange={handleUpdateTags}
                        className="mt-1"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDeleteConversation(session.sessionId)}
                      disabled={isInteractionDisabled || isDeleting}
                      aria-label={`Delete conversation ${getSessionTitle(session, sessionTitleById)}`}
                      className={cn(
                        'mr-1 mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors',
                        isInteractionDisabled || isDeleting
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer hover:bg-destructive/10 hover:text-destructive',
                      )}
                    >
                      {isDeleting ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
