"use client";

import * as React from "react";
import { TrashIcon, MixerHorizontalIcon, Cross2Icon, CheckIcon, VideoIcon } from "@radix-ui/react-icons";
import { Image, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BulkActionToolbarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onMove: () => void;
  onApprove?: () => void;
  /** Number of selected reel drafts eligible for video generation. */
  reelCount?: number;
  onGenerateReels?: () => void;
  isGeneratingReels?: boolean;
  /** Open library picker and apply selection to all selected drafts. */
  onAttachCreative?: () => void;
  /** Trigger opt-in headless media generation across selected drafts. */
  onGenerateMedia?: () => void;
  isGeneratingMedia?: boolean;
  className?: string;
}

export function BulkActionToolbar({
  selectedCount,
  onClear,
  onDelete,
  onMove,
  onApprove,
  reelCount = 0,
  onGenerateReels,
  isGeneratingReels = false,
  onAttachCreative,
  onGenerateMedia,
  isGeneratingMedia = false,
  className,
}: BulkActionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300",
        className
      )}
    >
      <div className="flex items-center gap-4 px-4 py-2 bg-surface/80 backdrop-blur-md border border-brand-primary/30 rounded-full shadow-2xl shadow-brand-primary/20">
        <div className="flex items-center gap-2 border-r border-subtle pr-4">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary text-white text-xs font-bold">
            {selectedCount}
          </span>
          <span className="text-sm font-medium text-primary">Selected</span>
          <button
            onClick={onClear}
            aria-label="Clear selection"
            className="p-1 hover:bg-subtle rounded-full transition-colors"
          >
            <Cross2Icon className="w-4 h-4 text-secondary" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onAttachCreative ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAttachCreative}
              className="h-8 gap-2 text-secondary hover:text-primary"
            >
              <Image className="w-4 h-4" />
              Attach creative…
            </Button>
          ) : null}
          {onGenerateMedia ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onGenerateMedia}
              disabled={isGeneratingMedia}
              className="h-8 gap-2 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
            >
              <Sparkles className="w-4 h-4" />
              {isGeneratingMedia ? "Generating…" : "Generate media"}
            </Button>
          ) : null}
          {onGenerateReels && reelCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onGenerateReels}
              disabled={isGeneratingReels}
              className="h-8 gap-2 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
            >
              <VideoIcon className="w-4 h-4" />
              {isGeneratingReels ? "Generating…" : `Generate ${reelCount} video${reelCount === 1 ? "" : "s"}`}
            </Button>
          ) : null}
          {onApprove ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onApprove}
              className="h-8 gap-2 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"
            >
              <CheckIcon className="w-4 h-4" />
              Approve
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onMove}
            className="h-8 gap-2 text-secondary hover:text-primary"
          >
            <MixerHorizontalIcon className="w-4 h-4" />
            Move
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
