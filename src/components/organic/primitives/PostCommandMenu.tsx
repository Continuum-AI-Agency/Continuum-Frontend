"use client"

import * as React from "react"
import {
  CalendarCheck,
  Hash,
  MoreHorizontal,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/**
 * The ⋯ command menu for the previewer: global post actions that don't earn a
 * permanent place on the canvas. Mirrors CalendarDraftCard's "Quick Edit"
 * vocabulary so the card and editor speak one language. Presentational — the
 * parent wires every action.
 */
export function PostCommandMenu({
  onEditCreativeDirection,
  onEditHashtags,
  onApproveSchedule,
  canSchedule = false,
  isScheduled = false,
  onMoveBackToDraft,
  onPublish,
  canPublish = false,
  isPublishing = false,
  onOpenInStudio,
  onDelete,
}: {
  onEditCreativeDirection: () => void
  onEditHashtags: () => void
  onApproveSchedule?: () => void
  canSchedule?: boolean
  isScheduled?: boolean
  onMoveBackToDraft?: () => void
  onPublish?: () => void
  canPublish?: boolean
  isPublishing?: boolean
  onOpenInStudio?: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Post actions"
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 before:absolute before:-inset-1.5 before:content-['']"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Edit</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onEditCreativeDirection}>
          <Sparkles className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          Creative direction
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEditHashtags}>
          <Hash className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          Hashtags
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {onApproveSchedule && (
          <DropdownMenuItem onSelect={onApproveSchedule} disabled={!canSchedule}>
            <CalendarCheck className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Approve &amp; schedule
          </DropdownMenuItem>
        )}
        {isScheduled && onMoveBackToDraft && (
          <DropdownMenuItem onSelect={onMoveBackToDraft}>
            <Undo2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Move back to draft
          </DropdownMenuItem>
        )}

        {canPublish && onPublish && (
          <DropdownMenuItem onSelect={onPublish} disabled={isPublishing}>
            <Send className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            {isPublishing ? "Publishing…" : "Publish to Instagram"}
          </DropdownMenuItem>
        )}
        {onOpenInStudio && (
          <DropdownMenuItem onSelect={onOpenInStudio}>
            <Wand2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Open in AI Studio
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={onDelete}
          className={cn("text-destructive focus:text-destructive")}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete draft
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
