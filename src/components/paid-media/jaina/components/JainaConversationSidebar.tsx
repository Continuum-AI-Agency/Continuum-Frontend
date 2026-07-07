'use client';

import { PlusIcon } from '@radix-ui/react-icons';
import { Loader2Icon, Trash2Icon } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { JainaConversationSession } from '@/lib/jaina/conversations';
import { cn } from '@/lib/utils';

type JainaConversationSidebarProps = {
  sessions: JainaConversationSession[];
  activeSessionId: string;
  sessionTitleById?: Record<string, string>;
  generatingSessionIds?: ReadonlySet<string>;
  isLoading: boolean;
  isInteractionDisabled: boolean;
  deletingSessionId?: string | null;
  onCreateConversation: () => void;
  onSelectConversation: (sessionId: string) => void;
  onDeleteConversation: (sessionId: string) => void;
};

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
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
}: JainaConversationSidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border/60 bg-background/60 backdrop-blur md:w-72 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-sm font-medium tracking-tight">Conversations</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onCreateConversation}
          disabled={isInteractionDisabled}
          className="gap-1"
          aria-label="Create new conversation"
        >
          <PlusIcon />
          New
        </Button>
      </div>

      <ScrollArea className="max-h-44 md:max-h-none md:flex-1 md:min-h-0">
        <div className="flex gap-2 p-2 md:flex-col">
          {isLoading && sessions.length === 0 ? (
            <span className="text-xs px-2 py-3 text-muted-foreground">Loading conversations…</span>
          ) : null}

          {!isLoading && sessions.length === 0 ? (
            <span className="text-xs px-2 py-3 text-muted-foreground">
              Start a chat to create your first conversation.
            </span>
          ) : null}

          {sessions.map((session) => {
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
                    isInteractionDisabled || isDeleting ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  <span className="text-xs font-medium line-clamp-2 w-full text-primary">
                    {getSessionTitle(session, sessionTitleById)}
                  </span>
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
    </aside>
  );
}
