"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OrganicCalendarDraft, OrganicPlatformTag } from "./types";
import { platformBadgeVariants, statusBadgeVariants } from "./draft-card-styles";

// ── Platform abbreviations ───────────────────────────────────────────────────

const PLATFORM_ABBR: Record<string, string> = {
  instagram: "IG",
  linkedin: "LI",
  facebook: "FB",
  tiktok: "TT",
  youtube: "YT",
  twitter: "TW",
};

export function PlatformBadge({ platform }: { platform: OrganicPlatformTag }) {
  const platformKey = platform as "instagram" | "linkedin" | "facebook" | "tiktok" | "youtube";
  return (
    <span className={cn(platformBadgeVariants({ platform: platformKey }), "px-1.5 py-0 text-[9px]")}>
      {PLATFORM_ABBR[platform] ?? platform.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ── Status pill (used in hover card) ────────────────────────────────────────

export function StatusBadge({
  status,
  format,
}: {
  status: OrganicCalendarDraft["status"];
  format?: string;
}) {
  if (format === "Newsletter") {
    return (
      <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
        Newsletter
      </span>
    );
  }

  const statusKey = status as
    | "draft"
    | "scheduled"
    | "streaming"
    | "failed"
    | "placeholder"
    | "published";

  const label = {
    draft: "Draft",
    scheduled: "Scheduled",
    streaming: "Generating",
    failed: "Failed",
    placeholder: "Seeded",
    published: "Published",
  }[status];

  return (
    <span className={cn(statusBadgeVariants({ status: statusKey }))}>{label}</span>
  );
}

// ── Status dot (used on the compact card) ───────────────────────────────────

const STATUS_DOT: Record<
  string,
  { color: string; label: string }
> = {
  draft: { color: "bg-muted-foreground/40", label: "Draft" },
  scheduled: { color: "bg-emerald-500", label: "Scheduled" },
  streaming: { color: "bg-amber-400", label: "Generating…" },
  failed: { color: "bg-destructive", label: "Failed" },
  placeholder: { color: "bg-brand-primary/50", label: "Seeded" },
  published: { color: "bg-emerald-600", label: "Published" },
};

export function StatusDot({
  status,
  format,
}: {
  status: OrganicCalendarDraft["status"];
  format?: string;
}) {
  if (format === "Newsletter") {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-destructive" />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">
            Newsletter
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const config = STATUS_DOT[status] ?? { color: "bg-muted-foreground/40", label: status };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "h-2 w-2 flex-shrink-0 rounded-full",
              config.color,
              status === "streaming" && "animate-pulse"
            )}
            aria-label={config.label}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
