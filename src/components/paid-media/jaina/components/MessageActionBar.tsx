"use client";

import { useCallback, useState } from "react";
import { ClipboardCheckIcon, ClipboardIcon, RefreshCwIcon } from "lucide-react";

type MessageActionBarProps = {
  content: string;
  onRegenerate?: () => void;
};

export function MessageActionBar({ content, onRegenerate }: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard not available
    }
  }, [content]);

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy response"}
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
      >
        {copied ? (
          <ClipboardCheckIcon className="size-3.5 text-emerald-500" />
        ) : (
          <ClipboardIcon className="size-3.5" />
        )}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      {onRegenerate ? (
        <button
          type="button"
          aria-label="Regenerate response"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <RefreshCwIcon className="size-3.5" />
          <span>Regenerate</span>
        </button>
      ) : null}
    </div>
  );
}
