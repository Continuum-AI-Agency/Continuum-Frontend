"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { OrganicSession } from "@/lib/organic/agent-sessions"
import { HistoryIcon, PlusIcon } from "lucide-react"

type OrganicSessionTriggerProps = {
  sessionCount: number
  isLoading: boolean
  onClick: () => void
}

export function OrganicSessionTrigger({ sessionCount, isLoading, onClick }: OrganicSessionTriggerProps) {
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onClick} disabled={isLoading} className="gap-1.5">
      <HistoryIcon className="size-3.5" />
      Sessions
      {sessionCount > 1 && (
        <Badge variant="secondary" className="px-1.5 py-0 text-xs h-auto">
          {sessionCount}
        </Badge>
      )}
    </Button>
  )
}

type OrganicSessionSidebarProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessions: OrganicSession[]
  activeSessionId: string | null
  isLoading: boolean
  isStreaming: boolean
  onNewSession: () => void
  onSelectSession: (sessionId: string) => void
}

export function OrganicSessionSidebar({
  open,
  onOpenChange,
  sessions,
  activeSessionId,
  isLoading,
  isStreaming,
  onNewSession,
  onSelectSession,
}: OrganicSessionSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <SheetHeader className="flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-sm font-medium">Conversations</SheetTitle>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onNewSession}
            disabled={isStreaming}
            className="gap-1.5 h-7 text-xs"
          >
            <PlusIcon className="size-3.5" />
            New
          </Button>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg px-3 py-2.5 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))
            ) : sessions.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No conversations yet
              </p>
            ) : (
              sessions.map((session) => (
                <SessionItem
                  key={session.sessionId}
                  session={session}
                  isActive={session.sessionId === activeSessionId}
                  isDisabled={isStreaming}
                  onClick={() => onSelectSession(session.sessionId)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

type SessionItemProps = {
  session: OrganicSession
  isActive: boolean
  isDisabled: boolean
  onClick: () => void
}

function formatSessionTime(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function SessionItem({ session, isActive, isDisabled, onClick }: SessionItemProps) {
  const preview = session.lastMessagePreview ?? session.title ?? "New conversation"
  const time = formatSessionTime(session.lastMessageAt ?? session.createdAt)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        "w-full rounded-lg py-2.5 text-left transition-colors",
        isActive
          ? "bg-primary/10 border-l-2 border-primary pl-[10px] pr-3"
          : "pl-3 pr-3 hover:bg-muted/50",
        isDisabled && "opacity-50 pointer-events-none"
      )}
    >
      <p className="line-clamp-2 text-sm leading-snug text-foreground">
        {preview}
      </p>
      {time && (
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
          {time}
        </p>
      )}
    </button>
  )
}
