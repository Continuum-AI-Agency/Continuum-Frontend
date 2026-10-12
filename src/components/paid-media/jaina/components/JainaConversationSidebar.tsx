'use client';

import { type AgentSessionListFilters, agentInitiatorLabel } from '@continuum/contracts';
import { Loader2Icon, Plus, Trash2Icon } from 'lucide-react';
import React from 'react';
import { ChatHistoryFilterBar } from '@/components/chat/ChatHistoryFilterBar';
import {
  CollapseConversationsButton,
  CollapsedConversationsRail,
} from '@/components/chat/collapsibleConversations';
import { SessionTagEditor } from '@/components/chat/SessionTagEditor';
import { useSessionSearch } from '@/components/chat/useSessionSearch';
import { CreateCampaignGoalDialog } from '@/components/goals/CreateCampaignGoalDialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { collectSessionTags } from '@/lib/agents/session-filters';
import { GOALS_PRODUCTION_DISABLED_REASON } from '@/lib/goals/access';
import {
  formatSessionActivity,
  type JainaConversationSession,
  sessionActivityAt,
} from '@/lib/jaina/conversations';
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

// Breakpoints are `@3xl/jaina` — the chat surface's own width — never viewport `md:`. The same
// sidebar sits in a full-width tab and in a 420px floating panel on a desktop screen.
// A row's tag and delete actions stay out of the list until the row is hovered or holds focus,
// so the list reads as titles and times. Touch screens have no hover: there they always show.
const ROW_ACTION_REVEAL =
  'opacity-0 group-hover/conversation:opacity-100 group-focus-within/conversation:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

const SIDEBAR_BASE_CLASS =
  'flex w-full shrink-0 flex-col border-b border-border/60 bg-background/60 backdrop-blur @3xl/jaina:border-b-0 @3xl/jaina:border-r';

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
      <aside className={cn(SIDEBAR_BASE_CLASS, '@3xl/jaina:w-14')}>
        <CollapsedConversationsRail
          onExpand={onToggleCollapsed}
          onNewSession={onCreateConversation}
          isInteractionDisabled={isInteractionDisabled}
        />
      </aside>
    );
  }

  return (
    <aside className={cn(SIDEBAR_BASE_CLASS, '@3xl/jaina:w-72')}>
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
          <ScrollArea className="max-h-44 @3xl/jaina:max-h-none @3xl/jaina:flex-1 @3xl/jaina:min-h-0">
            <div className="flex gap-1 p-2 @3xl/jaina:flex-col @3xl/jaina:gap-0.5">
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
                const activityAt = sessionActivityAt(session);
                const initiatorWord =
                  session.initiator === 'agent'
                    ? agentInitiatorLabel(session.initiatorAgent)
                    : null;
                const tags = tagsFor(session);
                return (
                  <div
                    key={session.sessionId}
                    className={cn(
                      'group/conversation flex min-w-[220px] items-start gap-0.5 rounded-md text-left transition-colors @3xl/jaina:min-w-0',
                      isActive ? 'bg-primary/10' : 'hover:bg-muted/50',
                      isInteractionDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectConversation(session.sessionId)}
                      disabled={isInteractionDisabled || isActive || isDeleting}
                      aria-current={isActive ? 'true' : undefined}
                      data-testid={`jaina-conversation-${session.sessionId}`}
                      className={cn(
                        'flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left',
                        isInteractionDisabled || isDeleting
                          ? 'cursor-not-allowed'
                          : 'cursor-pointer',
                      )}
                    >
                      <span
                        className={cn(
                          'line-clamp-2 w-full text-xs font-medium',
                          isActive ? 'text-primary-ink' : 'text-foreground',
                        )}
                      >
                        {getSessionTitle(session, sessionTitleById)}
                      </span>
                      <span className="flex w-full min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        {isGenerating ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-primary-ink">
                            <Loader2Icon className="size-3 animate-spin" />
                            Working
                            <span aria-hidden="true" className="text-muted-foreground">
                              ·
                            </span>
                          </span>
                        ) : null}
                        <time
                          className="shrink-0 tabular-nums"
                          data-testid={`jaina-conversation-time-${session.sessionId}`}
                          dateTime={activityAt ?? undefined}
                        >
                          {formatSessionActivity(activityAt)}
                        </time>
                        {initiatorWord ? (
                          <span className="shrink-0">
                            <span aria-hidden="true">· </span>
                            {initiatorWord}
                          </span>
                        ) : null}
                        {tags.length > 0 ? (
                          <span className="min-w-0 truncate">
                            <span aria-hidden="true">· </span>
                            {tags.map((tag) => `#${tag}`).join(' ')}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {onUpdateConversationTags ? (
                      <SessionTagEditor
                        sessionId={session.sessionId}
                        tags={tags}
                        disabled={isInteractionDisabled || isDeleting}
                        onChange={handleUpdateTags}
                        className={cn('mt-1.5', ROW_ACTION_REVEAL)}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDeleteConversation(session.sessionId)}
                      disabled={isInteractionDisabled || isDeleting}
                      aria-label={`Delete conversation ${getSessionTitle(session, sessionTitleById)}`}
                      className={cn(
                        'mt-1.5 mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
                        isDeleting ? 'opacity-100' : ROW_ACTION_REVEAL,
                        isInteractionDisabled || isDeleting
                          ? 'cursor-not-allowed'
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
