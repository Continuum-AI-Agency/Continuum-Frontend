'use client';

import {
  ORGANIC_DRAFT_STATUS_PHASE,
  ORGANIC_PHASE_PRESENTATION,
  type OrganicStatusTone,
} from '@continuum/contracts';
import { cva } from 'class-variance-authority';
import type { OrganicDraftStatus } from './types';

// The planner encodes exactly two facts on a draft, on two orthogonal axes:
//
//   STATUS   — where the post is in its lifecycle. One hue per status, taken from
//              the semantic token set (styleguide §1), surfaced as the readable
//              pill, the card's status strip, and the frame treatment.
//   PLATFORM — where the post will go. One brand color per platform, surfaced as
//              the card's left accent rail and the platform badge.
//
// The WORDS and the TONE are not the planner's to choose: they come from
// `ORGANIC_PHASE_PRESENTATION` in the contracts, the one table the chat, the plan
// row and this card all read. What lives here is the planner's own RENDERING of a
// tone — badge variant, status strip, frame treatment — because a dense calendar
// chip needs a different treatment from a chat line, not a different word.

/** Frame treatment a status gets on the month chip / list row. */
export type DraftStatusFrame = 'dashed' | 'solid' | 'filled' | 'pulse' | 'danger';

/** Pill tone — a `ui/badge` variant, so every hue resolves through a semantic token. */
export type DraftStatusTone = 'muted' | 'violet' | 'warning' | 'teal' | 'success' | 'outline';

/**
 * The planner's rendering of the canonical tone. This is the ONLY place a semantic
 * tone becomes a badge variant here — it is why "will post" and "already posted"
 * cannot drift back into two shades of the same emerald.
 */
const TONE_BADGE: Record<OrganicStatusTone, DraftStatusTone> = {
  neutral: 'muted',
  pending: 'violet',
  active: 'warning',
  ready: 'muted',
  scheduled: 'teal',
  live: 'success',
  error: 'outline',
};

/** Solid fill of the same hue, for the card's top status strip. */
const TONE_STRIP: Record<OrganicStatusTone, string> = {
  neutral: 'bg-muted-foreground/40',
  pending: 'bg-primary/60',
  active: 'bg-warning',
  ready: 'bg-muted-foreground/40',
  scheduled: 'bg-secondary',
  live: 'bg-success',
  error: 'bg-destructive',
};

export type DraftStatusPresentation = {
  label: string;
  /** What the status means, in words — the pill's tooltip / accessible name. */
  hint: string;
  tone: DraftStatusTone;
  /** Desaturated fill for tones the Badge set only carries solid (destructive). */
  pillClassName?: string;
  /** Solid fill of the same hue, for the card's top status strip. */
  strip: string;
  frame: DraftStatusFrame;
};

// Only the FRAME is the planner's own call — it is a treatment, not a word. Label,
// hint and tone are read from the contracts table below, so a status cannot say one
// thing here and another in the chat.
const STATUS_FRAME = {
  draft: 'dashed',
  placeholder: 'dashed',
  streaming: 'pulse',
  scheduled: 'solid',
  published: 'filled',
  failed: 'danger',
} as const satisfies Record<OrganicDraftStatus, DraftStatusFrame>;

// `failed` is the one tone the Badge set carries only as a solid destructive fill,
// which shouted louder than the state deserves on a dense grid.
const PILL_CLASS_OVERRIDE: Partial<Record<OrganicDraftStatus, string>> = {
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
};

function presentationFor(status: OrganicDraftStatus): DraftStatusPresentation {
  const phase = ORGANIC_PHASE_PRESENTATION[ORGANIC_DRAFT_STATUS_PHASE[status]];
  return {
    // The dense form: the calendar chip has room for one word, and it must be the
    // same claim the chat's longer `label` makes.
    label: phase.pill,
    hint: phase.hint,
    tone: TONE_BADGE[phase.tone],
    ...(PILL_CLASS_OVERRIDE[status] ? { pillClassName: PILL_CLASS_OVERRIDE[status] } : {}),
    strip: TONE_STRIP[phase.tone],
    frame: STATUS_FRAME[status],
  };
}

export const DRAFT_STATUS_PRESENTATION = {
  draft: presentationFor('draft'),
  placeholder: presentationFor('placeholder'),
  streaming: presentationFor('streaming'),
  scheduled: presentationFor('scheduled'),
  published: presentationFor('published'),
  failed: presentationFor('failed'),
} satisfies Record<OrganicDraftStatus, DraftStatusPresentation>;

export function draftStatusPresentation(status: OrganicDraftStatus): DraftStatusPresentation {
  return DRAFT_STATUS_PRESENTATION[status] ?? DRAFT_STATUS_PRESENTATION.draft;
}

/**
 * Lifecycle order for the legend: authored -> seeded -> generating -> approved -> live,
 * with the failure state last.
 *
 * Exported so the toolbar legend is DERIVED from the table the cards actually read. A
 * hardcoded legend drifted into four separate falsehoods (violet claimed "Generating"
 * when it means "Seeded", Scheduled was drawn as an unfilled outline, `placeholder` was
 * missing entirely, and Failed was a solid destructive fill).
 */
export const DRAFT_STATUS_LEGEND_ORDER = [
  'draft',
  'placeholder',
  'streaming',
  'scheduled',
  'published',
  'failed',
] as const satisfies readonly OrganicDraftStatus[];

export type DraftStatusLegendEntry = {
  status: OrganicDraftStatus;
  /** The word the pill shows. */
  label: string;
  /** What the status means, in plain language — the legend's hint row. */
  hint: string;
};

/** Every status, in legend order, with the exact words the planner's pills use. */
export function draftStatusLegendEntries(): DraftStatusLegendEntry[] {
  return DRAFT_STATUS_LEGEND_ORDER.map((status) => {
    const { label, hint } = DRAFT_STATUS_PRESENTATION[status];
    return { status, label, hint };
  });
}

/**
 * "Needs setup" is READINESS, not a status: a draft missing its caption or media still has
 * status `draft`. The legend has to say so instead of listing it beside the six statuses.
 */
export const DRAFT_READINESS_LEGEND_NOTE =
  '"Needs setup" is not a status — it flags a post that still needs a caption or media before it can be scheduled.';

type FramePlatform = 'instagram' | 'linkedin' | 'facebook' | 'tiktok' | 'youtube' | 'twitter';

/** Map raw platform tags (incl. aliases) to the canonical frame palette key. */
function normalizeFramePlatform(raw: string): FramePlatform {
  switch (raw) {
    case 'instagram':
    case 'linkedin':
    case 'facebook':
    case 'tiktok':
    case 'youtube':
    case 'twitter':
      return raw;
    default:
      return 'instagram';
  }
}

// Full literal class strings (no template composition) so Tailwind's JIT emits every
// variant. The platform supplies the hue; the status supplies the treatment.
const CHIP_FRAME: Record<FramePlatform, Record<'dashed' | 'solid' | 'filled', string>> = {
  instagram: {
    dashed:
      'border border-dashed border-fuchsia-500/60 bg-transparent text-fuchsia-900 dark:text-fuchsia-200',
    solid: 'border border-fuchsia-500/70 bg-fuchsia-500/15 text-fuchsia-900 dark:text-fuchsia-100',
    filled: 'border border-fuchsia-500 bg-fuchsia-500 text-white',
  },
  linkedin: {
    dashed: 'border border-dashed border-sky-500/60 bg-transparent text-sky-900 dark:text-sky-200',
    solid: 'border border-sky-500/70 bg-sky-500/15 text-sky-900 dark:text-sky-100',
    filled: 'border border-sky-600 bg-sky-600 text-white',
  },
  facebook: {
    dashed:
      'border border-dashed border-blue-600/60 bg-transparent text-blue-900 dark:text-blue-200',
    solid: 'border border-blue-600/70 bg-blue-600/15 text-blue-900 dark:text-blue-100',
    filled: 'border border-blue-600 bg-blue-600 text-white',
  },
  tiktok: {
    dashed:
      'border border-dashed border-zinc-500/60 bg-transparent text-zinc-900 dark:text-zinc-200',
    solid: 'border border-zinc-500/70 bg-zinc-500/15 text-zinc-900 dark:text-zinc-100',
    filled: 'border border-zinc-700 bg-zinc-800 text-white',
  },
  youtube: {
    dashed: 'border border-dashed border-red-500/60 bg-transparent text-red-900 dark:text-red-200',
    solid: 'border border-red-500/70 bg-red-500/15 text-red-900 dark:text-red-100',
    filled: 'border border-red-500 bg-red-500 text-white',
  },
  twitter: {
    dashed:
      'border border-dashed border-slate-500/60 bg-transparent text-slate-900 dark:text-slate-200',
    solid: 'border border-slate-500/70 bg-slate-500/15 text-slate-900 dark:text-slate-100',
    filled: 'border border-slate-600 bg-slate-600 text-white',
  },
};

// List rows keep readable content, so they use a left accent rail (intensity by
// status) plus a faint published tint instead of a full solid fill.
const ROW_FRAME: Record<FramePlatform, Record<'dashed' | 'solid' | 'filled', string>> = {
  instagram: {
    dashed: 'border-l-[3px] border-l-fuchsia-500/40',
    solid: 'border-l-[3px] border-l-fuchsia-500/80',
    filled: 'border-l-[3px] border-l-fuchsia-500 bg-fuchsia-500/10',
  },
  linkedin: {
    dashed: 'border-l-[3px] border-l-sky-500/40',
    solid: 'border-l-[3px] border-l-sky-500/80',
    filled: 'border-l-[3px] border-l-sky-600 bg-sky-500/10',
  },
  facebook: {
    dashed: 'border-l-[3px] border-l-blue-600/40',
    solid: 'border-l-[3px] border-l-blue-600/80',
    filled: 'border-l-[3px] border-l-blue-600 bg-blue-600/10',
  },
  tiktok: {
    dashed: 'border-l-[3px] border-l-zinc-500/40',
    solid: 'border-l-[3px] border-l-zinc-500/80',
    filled: 'border-l-[3px] border-l-zinc-700 bg-zinc-500/10',
  },
  youtube: {
    dashed: 'border-l-[3px] border-l-red-500/40',
    solid: 'border-l-[3px] border-l-red-500/80',
    filled: 'border-l-[3px] border-l-red-500 bg-red-500/10',
  },
  twitter: {
    dashed: 'border-l-[3px] border-l-slate-500/40',
    solid: 'border-l-[3px] border-l-slate-500/80',
    filled: 'border-l-[3px] border-l-slate-600 bg-slate-500/10',
  },
};

// The two status treatments that carry their own hue rather than the platform's:
// a run in progress and a run that failed are about the RUN, not the channel.
const STATUS_ONLY_FRAME: Record<'pulse' | 'danger', { chip: string; row: string }> = {
  pulse: {
    chip: 'border border-warning/70 bg-warning/15 text-warning animate-pulse',
    row: 'border-l-[3px] border-l-warning/80 animate-pulse',
  },
  danger: {
    chip: 'border border-destructive/60 bg-destructive/10 text-destructive',
    row: 'border-l-[3px] border-l-destructive/70',
  },
};

/**
 * Frame classes for a draft chip/row: platform supplies the hue, status supplies
 * the treatment (`DRAFT_STATUS_PRESENTATION[status].frame`). `chip` = full box
 * frame for compact calendar chips; `row` = left accent rail for list rows.
 */
export function statusFrameClasses(
  platformRaw: string,
  status: OrganicDraftStatus,
  variant: 'chip' | 'row' = 'chip',
): string {
  const { frame } = draftStatusPresentation(status);
  if (frame === 'pulse' || frame === 'danger') {
    return STATUS_ONLY_FRAME[frame][variant];
  }

  const palette = (variant === 'chip' ? CHIP_FRAME : ROW_FRAME)[
    normalizeFramePlatform(platformRaw)
  ];
  return palette[frame];
}

export const platformBadgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider',
  {
    variants: {
      platform: {
        instagram:
          'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-950 dark:text-fuchsia-100 shadow-sm shadow-fuchsia-500/10',
        linkedin:
          'border-sky-500/40 bg-sky-500/15 text-sky-950 dark:text-sky-100 shadow-sm shadow-sky-500/10',
        facebook: 'border-blue-600/40 bg-blue-600/15 text-blue-950 dark:text-blue-100',
        tiktok: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-900 dark:text-zinc-100',
        youtube: 'border-red-500/40 bg-red-500/15 text-red-900 dark:text-red-100',
        twitter: 'border-slate-500/40 bg-slate-500/15 text-slate-900 dark:text-slate-100',
      },
    },
    defaultVariants: {
      platform: 'instagram',
    },
  },
);

export const cardVariants = cva(
  'group relative w-full rounded-lg border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary overflow-hidden',
  {
    variants: {
      selected: {
        // The selected card drives the preview panel, so it has to win the cell at a
        // glance: a full brand ring (not a tinted border alone) plus a brand fill.
        true: 'z-10 border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary ring-offset-1 ring-offset-background',
        false: 'border-subtle bg-surface/70 hover:bg-surface',
      },
      multiSelected: {
        true: 'border-2 border-brand-primary/50 bg-brand-primary/5',
        false: '',
      },
      streaming: {
        true: 'ring-1 ring-warning/50',
        false: '',
      },
      failed: {
        true: 'ring-1 ring-destructive/50',
        false: '',
      },
      platformHover: {
        instagram: 'hover:border-fuchsia-500/50',
        linkedin: 'hover:border-sky-500/50',
        facebook: 'hover:border-blue-600/50',
        tiktok: 'hover:border-zinc-500/50',
        youtube: 'hover:border-red-500/50',
        twitter: 'hover:border-slate-500/50',
        none: '',
      },
    },
    compoundVariants: [],
    defaultVariants: {
      selected: false,
      multiSelected: false,
      streaming: false,
      failed: false,
      platformHover: 'none',
    },
  },
);
