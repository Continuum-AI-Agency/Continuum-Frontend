"use client";

import { cva } from "class-variance-authority";

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
    compoundVariants: [
      {
        selected: false,
        multiSelected: false,
        platformHover: "instagram",
        class: "hover:shadow-fuchsia-500/5",
      },
      {
        selected: false,
        multiSelected: false,
        platformHover: "linkedin",
        class: "hover:shadow-sky-500/5",
      }
    ],
    defaultVariants: {
      selected: false,
      multiSelected: false,
      streaming: false,
      failed: false,
      platformHover: "none",
    },
  }
);
