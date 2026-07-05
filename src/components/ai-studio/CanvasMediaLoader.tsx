"use client";

import React from "react";
import { ImageIcon, MagicWandIcon, VideoIcon } from "@radix-ui/react-icons";
import { ErrorRetryState } from "@/components/shared/state";
import { cn } from "@/lib/utils";

// "loading" keeps the decorative canvas warm-up (the default, unchanged
// behaviour). "error" is the deterministic failure surface (IMP-011): when the
// caller's realtime status resolves to a failure, it passes status="error" plus
// an onRetry so the canvas never sits on an ambiguous forever-loading state.
type CanvasMediaLoaderStatus = "loading" | "error";

type CanvasMediaLoaderProps = {
  className?: string;
  status?: CanvasMediaLoaderStatus;
  errorMessage?: string;
  onRetry?: () => void;
};

const DEFAULT_ERROR_MESSAGE =
  "We couldn't finish loading the AI Studio canvas. This is usually a connection issue — retry to reconnect.";

export function CanvasMediaLoader({
  className,
  status = "loading",
  errorMessage,
  onRetry,
}: CanvasMediaLoaderProps) {
  if (status === "error") {
    return (
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background px-6 py-8",
          className,
        )}
      >
        <div className="relative z-10 w-full max-w-[520px] rounded-lg border border-border/70 bg-background/95 p-[var(--card-pad)] shadow-md backdrop-blur">
          <ErrorRetryState
            title="AI Studio canvas didn't load"
            message={errorMessage ?? DEFAULT_ERROR_MESSAGE}
            onRetry={onRetry}
            retryLabel="Retry"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading AI Studio canvas"
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background px-6 py-8",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-6 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl motion-reduce:animate-none" />
        <div className="absolute -right-12 bottom-0 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl motion-reduce:animate-none" />
      </div>

      <div className="relative z-10 w-full max-w-[520px] rounded-lg border border-border/70 bg-background/95 p-[var(--card-pad)] shadow-md backdrop-blur">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Continuum AI Studio</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Preparing media canvas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Restoring your workspace, syncing collaborators, and warming generation tools.
          </p>
        </div>

        <div className="relative h-52 overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-muted/70 via-background to-muted/30">
          <div className="absolute left-[10%] top-[22%] flex w-28 items-center gap-2 rounded-lg border border-indigo-500/25 bg-background/90 px-3 py-2 shadow-sm">
            <ImageIcon className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-medium text-foreground">Image</span>
          </div>

          <div className="absolute right-[10%] top-[22%] flex w-28 items-center gap-2 rounded-lg border border-cyan-500/25 bg-background/90 px-3 py-2 shadow-sm">
            <VideoIcon className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-medium text-foreground">Video</span>
          </div>

          <div className="absolute bottom-[16%] left-1/2 flex w-32 -translate-x-1/2 items-center gap-2 rounded-lg border border-violet-500/25 bg-background/90 px-3 py-2 shadow-sm">
            <MagicWandIcon className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-medium text-foreground">Prompt</span>
          </div>

          <div className="absolute left-[36%] top-[32%] h-px w-[28%] bg-gradient-to-r from-indigo-500/20 via-indigo-500/90 to-cyan-500/20" />
          <div className="absolute left-[31%] top-[44%] h-px w-[20%] origin-left -rotate-[35deg] bg-gradient-to-r from-indigo-500/20 via-indigo-500/80 to-violet-500/20" />
          <div className="absolute right-[31%] top-[44%] h-px w-[20%] origin-right rotate-[35deg] bg-gradient-to-r from-cyan-500/20 via-cyan-500/80 to-violet-500/20" />

          <div className="absolute left-[49%] top-[31%] h-2.5 w-2.5 rounded-full bg-indigo-400/90 shadow-[0_0_14px_rgba(129,140,248,0.65)] animate-pulse motion-reduce:animate-none" />
          <div
            className="absolute left-[41%] top-[38%] h-2.5 w-2.5 rounded-full bg-violet-400/90 shadow-[0_0_14px_rgba(167,139,250,0.65)] animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: "220ms" }}
          />
          <div
            className="absolute right-[41%] top-[38%] h-2.5 w-2.5 rounded-full bg-cyan-400/90 shadow-[0_0_14px_rgba(34,211,238,0.65)] animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: "440ms" }}
          />

          <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-indigo-400/40 animate-spin motion-reduce:animate-none" />
            <div
              className="absolute inset-[6px] rounded-full border border-cyan-400/45 animate-spin motion-reduce:animate-none"
              style={{ animationDirection: "reverse", animationDuration: "2.8s" }}
            />
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm">
              <MagicWandIcon className="h-4 w-4 text-foreground" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
            Session
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse motion-reduce:animate-none"
              style={{ animationDelay: "180ms" }}
            />
            Nodes
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse motion-reduce:animate-none"
              style={{ animationDelay: "360ms" }}
            />
            Media Engine
          </span>
        </div>
      </div>
    </div>
  );
}

