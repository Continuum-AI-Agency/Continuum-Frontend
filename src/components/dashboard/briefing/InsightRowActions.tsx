"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, MessageSquare, Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// North Star verbs surfaced as a per-insight contextual action bar (revealed on
// row hover/focus). v1 navigates to each surface; carrying the specific
// creative/campaign as a seed into the target is a tracked fast-follow.
const VERBS = [
  { key: "inspire", label: "Inspire", icon: Sparkles, href: "/ai-studio" },
  { key: "plan", label: "Plan", icon: CalendarPlus, href: "/organic?tab=planner" },
  { key: "launch", label: "Launch", icon: Rocket, href: "/scale/campaign-canvas" },
  { key: "jaina", label: "Ask Jaina", icon: MessageSquare, href: "/scale?tab=jaina" },
] as const;

export function InsightRowActions() {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-1">
      {VERBS.map((verb) => (
        <Button
          key={verb.key}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push(verb.href)}
          className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <verb.icon className="size-3.5" />
          {verb.label}
        </Button>
      ))}
    </div>
  );
}
