"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared minimal card language for in-chat agent output (plan, bulk, pipeline,
 * trend, concept). One restrained surface, neutral-first meta, a single brand
 * accent reserved for state. Replaces the per-card rainbow-chip clutter.
 */

export function AgentCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "mt-2 rounded-2xl border border-border/50 bg-card/70 p-4",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-16px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function AgentCardEyebrow({
  label,
  right,
}: {
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {right}
    </div>
  );
}

export function AgentCardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-2.5 text-[14px] font-semibold leading-snug text-foreground text-pretty">
      {children}
    </h3>
  );
}

export function AgentCardSummary({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
      {children}
    </p>
  );
}

type StatusTone = "neutral" | "running" | "done" | "failed";

const STATUS_TEXT: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  running: "text-amber-600 dark:text-amber-400",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
};

const STATUS_DOT: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/40",
  running: "bg-amber-500",
  done: "bg-emerald-500",
  failed: "bg-destructive",
};

export function StatusLabel({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium tabular-nums",
        STATUS_TEXT[tone],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[tone], tone === "running" && "animate-pulse")} />
      {children}
    </span>
  );
}

// Per-platform color identity — the one place color is intentionally used for
// recognition rather than state. Everything else in a card stays neutral.
const PLATFORM_COLOR: Record<string, string> = {
  instagram: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  tiktok: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  linkedin: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  facebook: "bg-blue-600/15 text-blue-700 dark:text-blue-300",
  youtube: "bg-red-500/15 text-red-700 dark:text-red-300",
  twitter: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

export function PlatformTag({ platform, className }: { platform: string; className?: string }) {
  const color = PLATFORM_COLOR[platform] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        color,
        className,
      )}
    >
      {platform}
    </span>
  );
}

/**
 * Neutral meta line — `Reel · Wed 9:00 AM · Save`. The first item reads as the
 * primary label; the rest are muted, middot-separated. Pair with PlatformTag
 * for platform color; everything else stays neutral.
 */
export function MetaRow({
  items,
  className,
}: {
  items: Array<string | null | undefined>;
  className?: string;
}) {
  const parts = items.filter((p): p is string => Boolean(p && p.trim()));
  if (parts.length === 0) return null;
  return (
    <p className={cn("flex flex-wrap items-center text-[11.5px] leading-snug text-muted-foreground", className)}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="px-1.5 text-muted-foreground/40">·</span>}
          <span className={cn(i === 0 && "font-medium capitalize text-foreground/80")}>{part}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

type AgentButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  loading?: boolean;
};

export function AgentButton({ variant = "primary", loading, className, children, disabled, ...props }: AgentButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-medium",
        "transition-[transform,opacity,background-color,color] duration-150 ease-out",
        "active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50",
        variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "ghost" && "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {variant === "primary" && <span>Queued…</span>}
        </>
      ) : children}
    </button>
  );
}

/**
 * Footer approve/reject pair. Reject is de-emphasized (ghost) so the primary
 * action carries the hierarchy.
 */
export function ApproveRejectActions({
  locked,
  loading,
  approveLabel,
  onApprove,
  onReject,
}: {
  locked: boolean;
  loading?: boolean;
  approveLabel: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-end gap-1">
      <AgentButton variant="ghost" disabled={locked || loading} onClick={onReject}>
        Dismiss
      </AgentButton>
      <AgentButton variant="primary" disabled={locked} loading={loading} onClick={onApprove}>
        {approveLabel}
      </AgentButton>
    </div>
  );
}
