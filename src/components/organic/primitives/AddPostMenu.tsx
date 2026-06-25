import * as React from "react"
import { PencilLine, Sparkles } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CreatePostOptions, PlannerPlatformKey } from "./planner-platforms"

type AddPostMenuProps = {
  dayId: string
  platformKey: PlannerPlatformKey
  onCreatePost: (options: CreatePostOptions) => void
  // The styled + trigger, supplied by each call site so per-view density stays intact.
  children: React.ReactNode
  align?: "start" | "center" | "end"
}

// Shared "+" menu for every calendar view: author a post manually from scratch, or
// hand the slot to the agent. Manual seeds a real draft; AI keeps the placeholder
// flow the generation pipeline expects.
export const AddPostMenu = React.memo(function AddPostMenu({
  dayId,
  platformKey,
  onCreatePost,
  children,
  align = "center",
}: AddPostMenuProps) {
  const handleCreateManually = React.useCallback(() => {
    onCreatePost({ dayId, platformKey, status: "draft", mode: "manual" })
  }, [dayId, platformKey, onCreatePost])

  const handleGenerateWithAi = React.useCallback(() => {
    onCreatePost({ dayId, platformKey, status: "placeholder", mode: "ai" })
  }, [dayId, platformKey, onCreatePost])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuItem onSelect={handleCreateManually}>
          <PencilLine className="size-4" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Create manually</span>
            <span className="text-xs text-muted-foreground">Write it from scratch</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleGenerateWithAi}>
          <Sparkles className="size-4" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Generate with AI</span>
            <span className="text-xs text-muted-foreground">Let the agent draft it</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
