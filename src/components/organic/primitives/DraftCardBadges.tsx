"use client";

import { cn } from "@/lib/utils";
import type { OrganicCalendarDraft, OrganicPlatformTag } from "./types";
import { platformBadgeVariants, statusBadgeVariants } from "./draft-card-styles";

export function PlatformBadge({ platform }: { platform: OrganicPlatformTag }) {
  const platformKey = platform as "instagram" | "linkedin" | "facebook" | "tiktok" | "youtube";
  return (
    <span className={cn(platformBadgeVariants({ platform: platformKey }))}>
      {platform === "instagram" ? "IG" : platform === "linkedin" ? "LinkedIn" : platform}
    </span>
  );
}

export function StatusBadge({ status, format }: { status: OrganicCalendarDraft["status"], format?: string }) {
  if (format === "Newsletter") {
    return (
      <span className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-100">
        Newsletter
      </span>
    );
  }
  
  const statusKey = status as "draft" | "scheduled" | "streaming" | "failed" | "placeholder";
  const label = {
    draft: "Draft",
    scheduled: "Scheduled",
    streaming: "Streaming",
    failed: "Failed",
    placeholder: "Seeded",
  }[status];

  return (
    <span className={cn(statusBadgeVariants({ status: statusKey }))}>
      {label}
    </span>
  );
}
