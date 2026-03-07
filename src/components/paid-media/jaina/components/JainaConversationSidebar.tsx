"use client";

import React from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { Button, Text } from "@radix-ui/themes";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { JainaConversationSession } from "@/lib/jaina/conversations";

type JainaConversationSidebarProps = {
  sessions: JainaConversationSession[];
  activeSessionId: string;
  sessionTitleById?: Record<string, string>;
  isLoading: boolean;
  isInteractionDisabled: boolean;
  onCreateConversation: () => void;
  onSelectConversation: (sessionId: string) => void;
};

function formatSessionTimestamp(value: string | null): string {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getSessionTitle(
  session: JainaConversationSession,
  sessionTitleById?: Record<string, string>
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
  return "New conversation";
}

export function JainaConversationSidebar({
  sessions,
  activeSessionId,
  sessionTitleById,
  isLoading,
  isInteractionDisabled,
  onCreateConversation,
  onSelectConversation,
}: JainaConversationSidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border/60 bg-background/60 backdrop-blur md:w-72 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <Text size="2" weight="medium" className="tracking-tight">
          Conversations
        </Text>
        <Button
          type="button"
          size="1"
          variant="soft"
          onClick={onCreateConversation}
          disabled={isInteractionDisabled}
          className="gap-1"
          aria-label="Create new conversation"
        >
          <PlusIcon />
          New
        </Button>
      </div>

      <ScrollArea className="max-h-44 md:max-h-none md:flex-1">
        <div className="flex gap-2 p-2 md:flex-col">
          {isLoading && sessions.length === 0 ? (
            <Text size="1" className="px-2 py-3 text-muted-foreground">
              Loading conversations…
            </Text>
          ) : null}

          {!isLoading && sessions.length === 0 ? (
            <Text size="1" className="px-2 py-3 text-muted-foreground">
              Start a chat to create your first conversation.
            </Text>
          ) : null}

          {sessions.map((session) => {
            const isActive = session.sessionId === activeSessionId;
            return (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => onSelectConversation(session.sessionId)}
                disabled={isInteractionDisabled || isActive}
                className={cn(
                  "flex min-w-[220px] flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors md:min-w-0",
                  isActive
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/60 bg-background/40 hover:border-border hover:bg-background/70",
                  isInteractionDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                )}
              >
                <Text
                  size="1"
                  weight="medium"
                  className="line-clamp-2 w-full text-primary"
                >
                  {getSessionTitle(session, sessionTitleById)}
                </Text>
                <div className="flex w-full items-center justify-between gap-2">
                  <Text size="1" className="uppercase tracking-wide text-muted-foreground">
                    {session.lastMessageRole ?? "session"}
                  </Text>
                  <Text size="1" className="text-muted-foreground">
                    {formatSessionTimestamp(session.lastMessageAt)}
                  </Text>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
