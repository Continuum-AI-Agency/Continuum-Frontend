"use client";

import { cva } from "class-variance-authority";
import type { OrganicDraftStatus } from "./types";

type FramePlatform = "instagram" | "linkedin" | "facebook" | "tiktok" | "youtube" | "twitter";

/** Map raw platform tags (incl. aliases) to the canonical frame palette key. */
function normalizeFramePlatform(raw: string): FramePlatform {
  switch (raw) {
    case "instagram":
    case "linkedin":
    case "facebook":
    case "tiktok":
    case "youtube":
    case "twitter":
      return raw;
    default:
      return "instagram";
  }
}

// Full literal class strings (no template composition) so Tailwind's JIT
// emits every variant. Status encodes the frame STYLE; platform encodes its
// COLOR. draft = dashed, scheduled = thin solid, published = solid fill.
const CHIP_FRAME: Record<FramePlatform, Record<"draft" | "scheduled" | "published", string>> = {
  instagram: {
    draft: "border border-dashed border-fuchsia-500/60 bg-transparent text-fuchsia-900 dark:text-fuchsia-200",
    scheduled: "border border-fuchsia-500/70 bg-fuchsia-500/15 text-fuchsia-900 dark:text-fuchsia-100",
    published: "border border-fuchsia-500 bg-fuchsia-500 text-white",
  },
  linkedin: {
    draft: "border border-dashed border-sky-500/60 bg-transparent text-sky-900 dark:text-sky-200",
    scheduled: "border border-sky-500/70 bg-sky-500/15 text-sky-900 dark:text-sky-100",
    published: "border border-sky-600 bg-sky-600 text-white",
  },
  facebook: {
    draft: "border border-dashed border-blue-600/60 bg-transparent text-blue-900 dark:text-blue-200",
    scheduled: "border border-blue-600/70 bg-blue-600/15 text-blue-900 dark:text-blue-100",
    published: "border border-blue-600 bg-blue-600 text-white",
  },
  tiktok: {
    draft: "border border-dashed border-zinc-500/60 bg-transparent text-zinc-900 dark:text-zinc-200",
    scheduled: "border border-zinc-500/70 bg-zinc-500/15 text-zinc-900 dark:text-zinc-100",
    published: "border border-zinc-700 bg-zinc-800 text-white",
  },
  youtube: {
    draft: "border border-dashed border-red-500/60 bg-transparent text-red-900 dark:text-red-200",
    scheduled: "border border-red-500/70 bg-red-500/15 text-red-900 dark:text-red-100",
    published: "border border-red-500 bg-red-500 text-white",
  },
  twitter: {
    draft: "border border-dashed border-slate-500/60 bg-transparent text-slate-900 dark:text-slate-200",
    scheduled: "border border-slate-500/70 bg-slate-500/15 text-slate-900 dark:text-slate-100",
    published: "border border-slate-600 bg-slate-600 text-white",
  },
};

// List rows keep readable content, so they use a left accent rail (intensity by
// status) plus a faint published tint instead of a full solid fill.
const ROW_FRAME: Record<FramePlatform, Record<"draft" | "scheduled" | "published", string>> = {
  instagram: {
    draft: "border-l-[3px] border-l-fuchsia-500/40",
    scheduled: "border-l-[3px] border-l-fuchsia-500/80",
    published: "border-l-[3px] border-l-fuchsia-500 bg-fuchsia-500/10",
  },
  linkedin: {
    draft: "border-l-[3px] border-l-sky-500/40",
    scheduled: "border-l-[3px] border-l-sky-500/80",
    published: "border-l-[3px] border-l-sky-600 bg-sky-500/10",
  },
  facebook: {
    draft: "border-l-[3px] border-l-blue-600/40",
    scheduled: "border-l-[3px] border-l-blue-600/80",
    published: "border-l-[3px] border-l-blue-600 bg-blue-600/10",
  },
  tiktok: {
    draft: "border-l-[3px] border-l-zinc-500/40",
    scheduled: "border-l-[3px] border-l-zinc-500/80",
    published: "border-l-[3px] border-l-zinc-700 bg-zinc-500/10",
  },
  youtube: {
    draft: "border-l-[3px] border-l-red-500/40",
    scheduled: "border-l-[3px] border-l-red-500/80",
    published: "border-l-[3px] border-l-red-500 bg-red-500/10",
  },
  twitter: {
    draft: "border-l-[3px] border-l-slate-500/40",
    scheduled: "border-l-[3px] border-l-slate-500/80",
    published: "border-l-[3px] border-l-slate-600 bg-slate-500/10",
  },
};

/**
 * Frame classes encoding post status by frame style and platform by color.
 * `chip` = full box frame for compact calendar chips; `row` = left accent rail
 * for list rows. draft/placeholder dashed, scheduled thin solid, published
 * filled (chip) / solid rail + tint (row).
 */
export function statusFrameClasses(
  platformRaw: string,
  status: OrganicDraftStatus,
  variant: "chip" | "row" = "chip",
): string {
  const platform = normalizeFramePlatform(platformRaw);
  const table = variant === "chip" ? CHIP_FRAME : ROW_FRAME;
  const palette = table[platform];
  switch (status) {
    case "scheduled":
      return palette.scheduled;
    case "published":
      return palette.published;
    case "streaming":
      return variant === "chip"
        ? "border border-amber-500/70 bg-amber-500/15 text-amber-900 dark:text-amber-100 animate-pulse"
        : "border-l-[3px] border-l-amber-500/80 animate-pulse";
    case "failed":
      return variant === "chip"
        ? "border border-destructive/60 bg-destructive/10 text-destructive"
        : "border-l-[3px] border-l-destructive/70";
    case "draft":
    case "placeholder":
    default:
      return palette.draft;
  }
}

export const platformBadgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
  {
    variants: {
      platform: {
        instagram:
          "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-950 dark:text-fuchsia-100 shadow-sm shadow-fuchsia-500/10",
        linkedin:
          "border-sky-500/40 bg-sky-500/15 text-sky-950 dark:text-sky-100 shadow-sm shadow-sky-500/10",
        facebook:
          "border-blue-600/40 bg-blue-600/15 text-blue-950 dark:text-blue-100",
        tiktok:
          "border-zinc-500/40 bg-zinc-500/15 text-zinc-900 dark:text-zinc-100",
        youtube:
          "border-red-500/40 bg-red-500/15 text-red-900 dark:text-red-100",
        twitter:
          "border-slate-500/40 bg-slate-500/15 text-slate-900 dark:text-slate-100",
      },
    },
    defaultVariants: {
      platform: "instagram",
    },
  }
);

export const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
  {
    variants: {
      status: {
        draft: "border-muted bg-muted/60 text-muted-foreground",
        scheduled: "border-emerald-500/30 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
        streaming: "border-amber-500/30 bg-amber-500/15 text-amber-900 dark:text-amber-100 animate-pulse",
        failed: "border-destructive/30 bg-destructive/15 text-destructive",
        placeholder: "border-brand-primary/30 bg-brand-primary/10 text-brand-primary",
        published: "border-emerald-600/30 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
      },
    },
    defaultVariants: {
      status: "draft",
    },
  }
);

export const cardVariants = cva(
  "group relative w-full rounded-lg border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary overflow-hidden",
  {
    variants: {
      selected: {
        true: "border-2 border-brand-primary bg-brand-primary/10 shadow-[0_0_15px_rgba(var(--brand-primary-rgb),0.3)] z-10 scale-[1.02]",
        false: "border-subtle bg-surface/70 hover:bg-surface",
      },
      multiSelected: {
        true: "border-2 border-brand-primary/50 bg-brand-primary/5",
        false: "",
      },
      streaming: {
        true: "ring-1 ring-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]",
        false: "",
      },
      failed: {
        true: "ring-1 ring-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]",
        false: "",
      },
      platformHover: {
        instagram: "hover:border-fuchsia-500/50",
        linkedin: "hover:border-sky-500/50",
        facebook: "hover:border-blue-600/50",
        tiktok: "hover:border-zinc-500/50",
        youtube: "hover:border-red-500/50",
        twitter: "hover:border-slate-500/50",
        none: "",
      }
    },
    compoundVariants: [],
    defaultVariants: {
      selected: false,
      multiSelected: false,
      streaming: false,
      failed: false,
      platformHover: "none",
    },
  }
);
