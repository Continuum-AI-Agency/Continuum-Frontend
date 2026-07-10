"use client";

import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentMentionSuggestion } from "@/lib/agent-references";
import { enqueueAgentMentions } from "@/lib/agent/mention-queue-store";

type PinToAgentButtonProps = {
  suggestions: AgentMentionSuggestion | AgentMentionSuggestion[];
  label?: string;
  className?: string;
  /** Compact icon-only control for dense tables / metric cards. */
  iconOnly?: boolean;
  stopPropagation?: boolean;
};

/**
 * Pins one or more structured @-mentions into the organic agent composer.
 * Works from any surface on the organic page (metrics, What's Working, etc.).
 */
export function PinToAgentButton({
  suggestions,
  label = "Add to agent",
  className,
  iconOnly = false,
  stopPropagation = true,
}: PinToAgentButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      aria-label={label}
      title={label}
      className={cn(
        iconOnly
          ? "size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
          : "h-7 gap-1.5 px-2 text-xs text-muted-foreground",
        className,
      )}
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
          event.preventDefault();
        }
        enqueueAgentMentions(suggestions);
      }}
    >
      <MessageSquarePlus className="size-3.5" />
      {iconOnly ? null : <span>{label}</span>}
    </Button>
  );
}
