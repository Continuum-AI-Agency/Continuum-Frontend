"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type MessageActionsProps = {
  content: string;
  onRegenerate?: () => void;
  disabled?: boolean;
  className?: string;
};

const COPY_RESET_MS = 1500;

// Hover/focus action row under a settled assistant message: copy the text and
// regenerate the turn. Kept intentionally small and muted so it reads as a
// secondary affordance, not chrome competing with the message.
export function MessageActions({ content, onRegenerate, disabled, className }: MessageActionsProps) {
  const [copied, setCopied] = React.useState(false);
  const resetRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    []
  );

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard is best-effort: it may be unavailable in an insecure context
      // or denied by permission. Copy is a convenience, not a critical path.
    }
  }, [content]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex items-center gap-0.5 text-muted-foreground", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copied ? "Copied" : "Copy message"}
              className="text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
            >
              {copied ? (
                <CheckIcon className="size-3.5 text-emerald-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
        </Tooltip>

        {onRegenerate ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Regenerate response"
                className="text-muted-foreground hover:text-foreground"
                disabled={disabled}
                onClick={onRegenerate}
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Regenerate</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
