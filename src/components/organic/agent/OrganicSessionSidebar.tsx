"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { OrganicSession } from "@/lib/organic/agent-sessions"
import { PlusIcon, Trash2Icon } from "lucide-react"

type OrganicSessionSidebarProps = {
  sessions: OrganicSession[]
  activeSessionId: string | null
  isLoading: boolean
  isInteractionDisabled: boolean
  onNewSession: () => void
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
}

function formatSessionTime(value: string | null): string {
  if (!value) return "No activity"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "No activity"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function getSessionTitle(session: OrganicSession): string {
  if (session.title?.trim()) return session.title
  if (session.lastMessagePreview) return session.lastMessagePreview
  return "New conversation"
}

export function OrganicSessionSidebar({
  sessions,
  activeSessionId,
  isLoading,
  isInteractionDisabled,
  onNewSession,
  onSelectSession,
  onDeleteSession,
}: OrganicSessionSidebarProps) {
  return (
    <aside className="@container/agent-sidebar flex w-full shrink-0 flex-col border-b border-border/60 bg-background/60 backdrop-blur md:w-[var(--shell-secondary-w)] md:max-w-[22rem] md:min-w-[var(--shell-secondary-w-min)] md:border-b-0 md:border-r">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <p className="text-sm font-medium tracking-tight">Conversations</p>
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

      <ScrollArea className="max-h-44 md:max-h-none md:flex-1 md:min-h-0">
        <div className="flex gap-2 p-2 md:flex-col">
          {isLoading && sessions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Loading conversations…</p>
          ) : null}

          {!isLoading && sessions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Start a chat to create your first conversation.
            </p>
          ) : null}

          {sessions.map((session) => {
            const isActive = session.sessionId === activeSessionId
            return (
              <div
                key={session.sessionId}
                className={cn(
                  "group/session relative flex min-w-[14rem] flex-col rounded-md border transition-colors md:min-w-0",
                  isActive
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/60 bg-background/40 hover:border-border hover:bg-background/70",
                  isInteractionDisabled && "opacity-60"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(session.sessionId)}
                  disabled={isInteractionDisabled || isActive}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 px-3 py-2 pr-8 text-left",
                    isInteractionDisabled
                      ? "cursor-not-allowed"
                      : isActive
                        ? "cursor-default"
                        : "cursor-pointer"
                  )}
                >
                  <span className="line-clamp-2 w-full text-xs font-medium text-primary">
                    {getSessionTitle(session)}
                  </span>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {session.lastMessageRole ?? "session"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSessionTime(session.lastMessageAt ?? session.createdAt)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  title="Delete conversation"
                  onClick={() => onDeleteSession(session.sessionId)}
                  disabled={isInteractionDisabled}
                  className={cn(
                    "absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40",
                    isActive
                      ? "opacity-100"
                      : "opacity-0 group-hover/session:opacity-100"
                  )}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}
