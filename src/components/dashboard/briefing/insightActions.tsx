"use client";

import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Rocket,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The "North Star" verbs an insight row routes into. One source for the
// right-click context menu and the trailing tap-friendly dropdown so they never
// drift. Carrying the specific creative/campaign as a seed is a tracked
// fast-follow; v1 navigates to each surface.
export const NORTH_STAR_VERBS = [
  { key: "inspire", label: "Open in Studio", icon: Sparkles, href: "/ai-studio" },
  { key: "plan", label: "Plan a post", icon: CalendarPlus, href: "/organic?tab=planner" },
  { key: "launch", label: "Launch a campaign", icon: Rocket, href: "/scale/campaign-canvas" },
  { key: "jaina", label: "Ask Jaina", icon: MessageSquare, href: "/scale?tab=jaina" },
] as const;

export function InsightContextActions({ permalink }: { permalink?: string }) {
  const router = useRouter();
  return (
    <>
      <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">
        Take action
      </ContextMenuLabel>
      {NORTH_STAR_VERBS.map((verb) => (
        <ContextMenuItem key={verb.key} className="gap-2 text-xs" onSelect={() => router.push(verb.href)}>
          <verb.icon className="size-3.5" />
          {verb.label}
        </ContextMenuItem>
      ))}
      {permalink ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem className="gap-2 text-xs" onSelect={() => window.open(permalink, "_blank", "noopener")}>
            <ExternalLink className="size-3.5" />
            Open original
          </ContextMenuItem>
        </>
      ) : null}
    </>
  );
}

export function InsightActionsDropdown({ permalink }: { permalink?: string }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Row actions"
          className="size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {NORTH_STAR_VERBS.map((verb) => (
          <DropdownMenuItem key={verb.key} className="gap-2 text-xs" onSelect={() => router.push(verb.href)}>
            <verb.icon className="size-3.5" />
            {verb.label}
          </DropdownMenuItem>
        ))}
        {permalink ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs" onSelect={() => window.open(permalink, "_blank", "noopener")}>
              <ExternalLink className="size-3.5" />
              Open original
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
