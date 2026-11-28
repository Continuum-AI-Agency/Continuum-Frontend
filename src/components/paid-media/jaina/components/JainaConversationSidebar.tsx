'use client';

import { type AgentSessionListFilters, agentInitiatorLabel } from '@continuum/contracts';
import { Plus } from 'lucide-react';
import React from 'react';
import { ChatHistoryFilterBar } from '@/components/chat/ChatHistoryFilterBar';
import {
  CollapseConversationsButton,
  CollapsedConversationsRail,
} from '@/components/chat/collapsibleConversations';
import { SessionSearchFailureNotice } from '@/components/chat/SessionSearchFailureNotice';
import { SessionTagEditor } from '@/components/chat/SessionTagEditor';
import { useSessionSearch } from '@/components/chat/useSessionSearch';
import { CreateCampaignGoalDialog } from '@/components/goals/CreateCampaignGoalDialog';
import { Button } from '@/components/ui/button';
import { type Conversation, ConversationList } from '@/components/ui/conversation-list';
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
  /** Why the conversation list could not be read ("Couldn't load conversations — …"). */
  loadError?: string | null;
  onRetryLoad?: () => void;
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
// The tag editor stays out of the list until its row (ConversationList's `group`) is hovered or
// holds focus, like the row's actions menu. Touch screens have no hover: there it always shows.
const ROW_ACTION_REVEAL =
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

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
  loadError = null,
  onRetryLoad,
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

  const isRowLocked = (sessionId: string) =>
    isInteractionDisabled || deletingSessionId === sessionId;

  const selectConversation = (sessionId: string) => {
    if (isRowLocked(sessionId) || sessionId === activeSessionId) return;
    onSelectConversation(sessionId);
  };

  const deleteConversation = (sessionId: string) => {
    if (isRowLocked(sessionId)) return;
    onDeleteConversation(sessionId);
  };

  const toConversation = (session: JainaConversationSession): Conversation => {
    const activityAt = sessionActivityAt(session);
    const initiatorWord =
      session.initiator === 'agent' ? agentInitiatorLabel(session.initiatorAgent) : null;
    const tags = tagsFor(session);
    const isDeleting = deletingSessionId === session.sessionId;
    return {
      id: session.sessionId,
      title: getSessionTitle(session, sessionTitleById),
      updatedAt: activityAt ?? session.updatedAt,
      running: generatingSessionIds?.has(session.sessionId) ?? false,
      meta: (
        <>
          {isDeleting ? 'Deleting… · ' : null}
          <time
            className="tabular-nums"
            data-testid={`jaina-conversation-time-${session.sessionId}`}
            dateTime={activityAt ?? undefined}
          >
            {formatSessionActivity(activityAt)}
          </time>
          {initiatorWord ? ` · ${initiatorWord}` : null}
          {tags.length > 0 ? ` · ${tags.map((tag) => `#${tag}`).join(' ')}` : null}
        </>
      ),
      actions: onUpdateConversationTags ? (
        <SessionTagEditor
          sessionId={session.sessionId}
          tags={tags}
          disabled={isRowLocked(session.sessionId)}
          onChange={handleUpdateTags}
          className={ROW_ACTION_REVEAL}
        />
      ) : undefined,
    };
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
            <div className="flex flex-col gap-0.5 p-2">
              {isLoading && visibleSessions.length === 0 && !search.isActive ? (
                <span className="text-xs px-2 py-3 text-muted-foreground">
                  Loading conversations…
                </span>
              ) : null}

              {!isLoading && loadError && sessions.length === 0 && !search.isActive ? (
                <span
                  className="px-2 py-3 text-destructive-ink text-xs"
                  data-testid="jaina-conversations-error"
                  role="alert"
                >
                  {loadError}{' '}
                  {onRetryLoad ? (
                    <button
                      className="hit-area font-medium underline underline-offset-4"
                      onClick={onRetryLoad}
                      type="button"
                    >
                      Retry
                    </button>
                  ) : null}
                </span>
              ) : null}

              {search.isActive && !search.isSearching && search.failure ? (
                <SessionSearchFailureNotice failure={search.failure} onRetry={search.retry} />
              ) : null}

              {search.isActive &&
              !search.isSearching &&
              !search.failure &&
              visibleSessions.length === 0 ? (
                <span className="text-xs px-2 py-3 text-muted-foreground">
                  No conversations match these filters.
                </span>
              ) : null}

              {!isLoading && !loadError && !search.isActive && sessions.length === 0 ? (
                <span className="text-xs px-2 py-3 text-muted-foreground">
                  Start a chat to create your first conversation.
                </span>
              ) : null}

              {visibleSessions.length > 0 ? (
                <ConversationList
                  variant="embedded"
                  undoMs={0}
                  data={visibleSessions.map(toConversation)}
                  activeId={activeSessionId}
                  onSelect={(conversation) => selectConversation(conversation.id)}
                  onDelete={(conversation) => deleteConversation(conversation.id)}
                  className={cn(
                    'max-w-none bg-transparent p-0',
                    isInteractionDisabled && 'cursor-not-allowed opacity-60',
                  )}
                />
              ) : null}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
