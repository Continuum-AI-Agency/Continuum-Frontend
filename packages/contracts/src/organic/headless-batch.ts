/**
 * Headless at scale from the Organic agent: one approval buys a batch of up to 60 reels and still
 * sets, each made by the product's own director as its own durable job and landed on its own
 * draft. The Backend builds every shape here (headlessBatchCreate, headlessBatchStatus, the
 * `ui.headless_batch` frame, the batch and cast routes); the Frontend renders the card from them.
 *
 * Money is bounded before the card: every piece holds a fixed cap, the batch's worst case is the
 * sum of those caps (plus the copy written for pieces with no caption, and up to eight character
 * packs a cast-less brand pays for), and a batch whose
 * worst case is over its maxUsd, or over what the brand's 24 h Organic headless window has left,
 * is refused before anyone is asked. Outputs are chat-media refs, never URLs.
 */
import { z } from 'zod';
import { HEADLESS_CONCEPTS } from '../headless-content/concepts';
import { headlessCreativeBlocksSchema } from '../headless-content/styles';
import { chatMediaItemSchema } from './chat-media';
import { organicGeneratablePlatformSchema } from './publishing';

export const HEADLESS_BATCH_MAX_ITEMS = 60;

export const headlessBatchFormatSchema = z.enum(['reel', 'still_set']);
export type HeadlessBatchFormat = z.infer<typeof headlessBatchFormatSchema>;

/**
 * What one piece may hold against the window (capUsd, enforced on the run) and what it costs on
 * a typical first pass (expectedUsd, shown on the card). A reel's cap trades the director's own
 * in-run retakes for the batch's one re-direct; a still set over its cap is refused by name.
 * 12 reels and 8 still sets fit the owner's $150 window.
 */
export const HEADLESS_BATCH_PIECE_COST_USD = {
  reel: { capUsd: 9, expectedUsd: 3.5 },
  still_set: { capUsd: 5, expectedUsd: 1 },
} as const satisfies Record<HeadlessBatchFormat, { capUsd: number; expectedUsd: number }>;

/** A reel whose concept runs past six beats (a tour's eight), held at twice a reel's cap. */
export const HEADLESS_BATCH_LONG_REEL_COST_USD = { capUsd: 18, expectedUsd: 7 } as const;
const LONG_REEL_BEATS = 6;

/** What one piece holds: its format's cost, or the long reel's when its concept runs long.
 *  ponytail: a conceptVariantId on a long base reads as a short reel and is refused over_item_cap
 *  at its run; resolve the variant's base here if brands make long variants. */
export function headlessBatchPieceCost(item: {
  format: HeadlessBatchFormat;
  blocks?: { concept?: string };
}): { capUsd: number; expectedUsd: number } {
  const beats = HEADLESS_CONCEPTS.find((concept) => concept.id === item.blocks?.concept)?.beats;
  return item.format === 'reel' && (beats?.length ?? 0) > LONG_REEL_BEATS
    ? HEADLESS_BATCH_LONG_REEL_COST_USD
    : HEADLESS_BATCH_PIECE_COST_USD[item.format];
}

/** A brand with no approved cast approves the drafted people once: one pack render each. */
export const HEADLESS_BATCH_CAST_PACK_USD = 2;
/** The most characters one cast approval takes (headlessCastApproveRequestSchema's 8 ids). */
export const HEADLESS_BATCH_CAST_MAX_CHARACTERS = 8;
/** The pack worst case a cast-less batch holds: every approvable id a character. */
export const HEADLESS_BATCH_CAST_PACK_MAX_USD =
  HEADLESS_BATCH_CAST_PACK_USD * HEADLESS_BATCH_CAST_MAX_CHARACTERS;

/**
 * The caption and hashtags a new placeholder gets when its item names none, in the brand's
 * voice: one model call per HEADLESS_BATCH_COPY_CHUNK pieces, held per piece.
 */
export const HEADLESS_BATCH_COPY_USD = { capUsd: 0.05, expectedUsd: 0.01 } as const;
export const HEADLESS_BATCH_COPY_CHUNK = 20;

/** maxUsd when the caller names none: the first pass plus room for re-directs. */
export const HEADLESS_BATCH_DEFAULT_MAX_MULTIPLE = 1.6;

/** Failure reasons a piece is re-directed on, once, inside the batch's maxUsd. */
export const HEADLESS_BATCH_REDIRECT_PREFIXES = [
  'nothing_planned',
  'run_failed:run_blocked',
  'guided_refused:over_item_cap',
] as const;

export const isHeadlessBatchRedirectReason = (reason: string | null | undefined): boolean =>
  Boolean(reason && HEADLESS_BATCH_REDIRECT_PREFIXES.some((prefix) => reason.startsWith(prefix)));

/** Where a piece lands: an existing draft of the brand, or a new placeholder in a calendar slot. */
export const headlessBatchSlotSchema = z.union([
  z.object({ draftId: z.string().uuid() }).strict(),
  z
    .object({
      scheduledAt: z.string().datetime({ offset: true }),
      platform: organicGeneratablePlatformSchema,
    })
    .strict(),
]);
export type HeadlessBatchSlot = z.infer<typeof headlessBatchSlotSchema>;

/** The blocks a piece is built from, by id. A reel's concept is optional: the director picks. */
export const headlessBatchBlocksSchema = headlessCreativeBlocksSchema.partial({ concept: true });
export type HeadlessBatchBlocks = z.infer<typeof headlessBatchBlocksSchema>;

export const headlessBatchItemInputSchema = z
  .object({
    format: headlessBatchFormatSchema,
    slot: headlessBatchSlotSchema,
    blocks: headlessBatchBlocksSchema.optional(),
    /** A short steer for the director. Never copy, a claim or a price. */
    direction: z.string().trim().min(1).max(400).optional(),
    /** The new placeholder's caption, kept verbatim. Absent, the brand's copy writer writes one. */
    caption: z.string().trim().min(1).max(2200).optional(),
  })
  .strict();
export type HeadlessBatchItemInput = z.infer<typeof headlessBatchItemInputSchema>;

export const headlessBatchCreateInputSchema = z
  .object({
    items: z.array(headlessBatchItemInputSchema).min(1).max(HEADLESS_BATCH_MAX_ITEMS),
    /** The language the pieces speak (es or en); absent, the brand's content language. */
    language: z.string().trim().min(2).max(32).optional(),
    /** The most this batch may hold, re-directs included. Default: 1.6 × the summed caps. */
    maxUsd: z.number().positive().max(1000).optional(),
    /** `/slug` shortcuts every piece carries (the create tools' `shortcuts`); a format shortcut
     *  (`/tour`) also makes every reel that pins no concept that concept. */
    shortcuts: z
      .array(
        z
          .string()
          .trim()
          .regex(/^\/?[a-z0-9][a-z0-9-]*$/i, 'a shortcut slug such as goldenhour'),
      )
      .max(6)
      .optional(),
    /** Fold the brand book's imagery and personality into every piece's style. */
    brandBook: z.boolean().optional(),
  })
  .strict()
  .refine((input) => input.items.every((item) => !item.caption || !('draftId' in item.slot)), {
    message: 'a caption is for a new placeholder; a named draft keeps its own copy',
  });
export type HeadlessBatchCreateInput = z.infer<typeof headlessBatchCreateInputSchema>;

const usd = z.number().nonnegative();

/** The bound the approval card shows (tool.approval_required `batchPreview`). */
export const headlessBatchQuoteSchema = z
  .object({
    items: z.number().int().positive(),
    reels: z.number().int().nonnegative(),
    stillSets: z.number().int().nonnegative(),
    /** Σ piece caps: the most the first pass holds against the window. */
    capUsd: usd,
    /** The copy writer's hold: pieces with no caption landing on a new placeholder. */
    copyUsd: usd,
    /** A cast-less brand's character packs, at their worst (HEADLESS_BATCH_CAST_PACK_MAX_USD). */
    castPackUsd: usd,
    /** capUsd + copyUsd + castPackUsd: what the card shows and the window must hold. */
    boundUsd: usd,
    expectedUsd: usd,
    maxUsd: usd,
    /** The brand's rolling 24 h Organic headless window, less its open batches' unstarted pieces. */
    windowRemainingUsd: usd.nullable(),
    /** No approved cast: the first piece drafts one and every other piece waits for its approval. */
    castApprovalNeeded: z.boolean(),
    /** Why the batch cannot be asked for, naming the dollars; null when it can. */
    refusal: z.string().nullable(),
  })
  .strict();
export type HeadlessBatchQuote = z.infer<typeof headlessBatchQuoteSchema>;

const cents = (value: number) => Math.round(value * 100) / 100;
const dollars = (value: number) => `$${value.toFixed(2)}`;

/** The worst case of a batch before anyone is asked, and the refusal when it does not fit. */
export function quoteHeadlessBatch(
  items: ReadonlyArray<{
    format: HeadlessBatchFormat;
    blocks?: { concept?: string };
    caption?: string;
    slot?: HeadlessBatchSlot;
  }>,
  options: { maxUsd?: number; castApprovalNeeded: boolean; windowRemainingUsd: number | null },
): HeadlessBatchQuote {
  const reels = items.filter((item) => item.format === 'reel').length;
  const stillSets = items.length - reels;
  const longReels = items.filter(
    (item) => headlessBatchPieceCost(item) === HEADLESS_BATCH_LONG_REEL_COST_USD,
  ).length;
  const sum = (key: 'capUsd' | 'expectedUsd') =>
    cents(items.reduce((total, item) => total + headlessBatchPieceCost(item)[key], 0));
  const capUsd = sum('capUsd');
  const captioned = items.filter(
    (item) => !item.caption && !(item.slot && 'draftId' in item.slot),
  ).length;
  const copyUsd = cents(captioned * HEADLESS_BATCH_COPY_USD.capUsd);
  const castPackUsd = options.castApprovalNeeded ? HEADLESS_BATCH_CAST_PACK_MAX_USD : 0;
  const boundUsd = cents(capUsd + copyUsd + castPackUsd);
  const maxUsd = cents(options.maxUsd ?? Math.ceil(capUsd * HEADLESS_BATCH_DEFAULT_MAX_MULTIPLE));
  const pieces = [
    `${reels - longReels} reel${reels - longReels === 1 ? '' : 's'} at up to ${dollars(HEADLESS_BATCH_PIECE_COST_USD.reel.capUsd)}${longReels ? `, ${longReels} long reel${longReels === 1 ? '' : 's'} at up to ${dollars(HEADLESS_BATCH_LONG_REEL_COST_USD.capUsd)}` : ''} and ${stillSets} still set${stillSets === 1 ? '' : 's'} at up to ${dollars(HEADLESS_BATCH_PIECE_COST_USD.still_set.capUsd)}`,
    copyUsd
      ? `${dollars(copyUsd)} of copy for ${captioned} caption${captioned === 1 ? '' : 's'}`
      : '',
    castPackUsd
      ? `up to ${dollars(castPackUsd)} of character packs (${dollars(HEADLESS_BATCH_CAST_PACK_USD)} each, up to ${HEADLESS_BATCH_CAST_MAX_CHARACTERS})`
      : '',
  ]
    .filter(Boolean)
    .join(', plus ');
  const refusal =
    boundUsd > maxUsd
      ? `The batch's worst case is ${dollars(boundUsd)} (${pieces}), over its ${dollars(maxUsd)} maxUsd. Nothing was asked or spent: ask for fewer pieces or a higher maxUsd.`
      : options.windowRemainingUsd !== null && boundUsd > options.windowRemainingUsd
        ? `The batch's worst case is ${dollars(boundUsd)} (${pieces}), but only ${dollars(options.windowRemainingUsd)} of the brand's per 24 h Organic headless window remains. Nothing was asked or spent: ask for fewer pieces, or again once earlier runs leave the window.`
        : null;
  return {
    items: items.length,
    reels,
    stillSets,
    capUsd,
    copyUsd,
    castPackUsd,
    boundUsd,
    expectedUsd: cents(sum('expectedUsd') + captioned * HEADLESS_BATCH_COPY_USD.expectedUsd),
    maxUsd,
    windowRemainingUsd: options.windowRemainingUsd,
    castApprovalNeeded: options.castApprovalNeeded,
    refusal,
  };
}

// --- The cast a headless piece waits on (A5: shared with the Frontend's cast card) ------------

export const headlessCastDraftSchema = z.object({
  elementId: z.string(),
  revision: z.number().int(),
  kind: z.string(),
  summary: z.string(),
});
export type HeadlessCastDraft = z.infer<typeof headlessCastDraftSchema>;

/** `creative.headlessCast` on a draft: the people and places its job parked on, or approved. */
export const headlessCastSchema = z.object({
  state: z.enum(['needs_cast_approval', 'approved']),
  jobId: z.string(),
  drafts: z.array(headlessCastDraftSchema),
  at: z.string(),
  approved: z
    .object({
      characterElementIds: z.array(z.string()),
      sceneElementIds: z.array(z.string()),
    })
    .optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
});
export type HeadlessCast = z.infer<typeof headlessCastSchema>;

/** POST: a brand user approves the drafted cast once; every waiting piece resumes with it. */
export const HEADLESS_CAST_APPROVE_ROUTE = '/api/headless/cast/approve';

export const headlessCastApproveRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    draftElementIds: z.array(z.string().uuid()).min(1).max(8),
    /** Release this batch's waiting pieces; absent, every batch of the brand that waits on a cast. */
    batchId: z.string().uuid().optional(),
  })
  .strict();
export type HeadlessCastApproveRequest = z.infer<typeof headlessCastApproveRequestSchema>;

export const headlessCastApproveResponseSchema = z
  .object({
    approved: z.array(
      z.object({ elementId: z.string(), revision: z.number().int(), kind: z.string() }).strict(),
    ),
    resumedJobIds: z.array(z.string()),
    /** Pieces that were waiting on this cast and are now queued with it. */
    releasedItems: z.number().int().nonnegative(),
  })
  .strict();
export type HeadlessCastApproveResponse = z.infer<typeof headlessCastApproveResponseSchema>;

// --- Status: the tool result, the frame and the route ------------------------------------------

/** GET: the same status the tool and the frame carry. */
export const HEADLESS_BATCH_STATUS_ROUTE = '/api/headless/batch';

/**
 * ?brandId&batchId; or ?brandId&sessionId for the session's newest batch; or ?brandId&planId for a
 * bulk plan's batch (made after its run ends, so no chat turn carries its frame).
 */
export const headlessBatchStatusQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    batchId: z.string().uuid().optional(),
    sessionId: z.string().min(1).max(200).optional(),
    planId: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((query) => Boolean(query.batchId || query.sessionId || query.planId), {
    message: 'a batchId, a sessionId or a planId',
  });
export type HeadlessBatchStatusQuery = z.infer<typeof headlessBatchStatusQuerySchema>;

export const headlessBatchItemStateSchema = z.enum([
  'queued',
  'running',
  'needs_cast_approval',
  'ready',
  'failed',
]);
export type HeadlessBatchItemState = z.infer<typeof headlessBatchItemStateSchema>;

export const headlessBatchItemSchema = z
  .object({
    index: z.number().int().nonnegative(),
    format: headlessBatchFormatSchema,
    draftId: z.string().uuid(),
    /** The job making it now (its re-direct once there is one); null while it waits on the cast. */
    jobId: z.string().uuid().nullable(),
    state: headlessBatchItemStateSchema,
    /** Why it failed, or what it waits on. */
    reason: z.string().max(400).nullable(),
    /** The caps it holds against the window: a cap per pass, not metered spend. */
    holdUsd: usd,
    redirected: z.boolean(),
    /** The finished reel, or a still set's first slide; a headless ref signed on view. */
    cover: chatMediaItemSchema.nullable(),
    /** Every output on the draft: 1 for a reel, the slide count for a still set. */
    outputCount: z.number().int().nonnegative(),
  })
  .strict();
export type HeadlessBatchItem = z.infer<typeof headlessBatchItemSchema>;

export const headlessBatchCountsSchema = z
  .object(
    Object.fromEntries(
      headlessBatchItemStateSchema.options.map((state) => [state, z.number().int().nonnegative()]),
    ) as Record<HeadlessBatchItemState, z.ZodNumber>,
  )
  .strict();
export type HeadlessBatchCounts = z.infer<typeof headlessBatchCountsSchema>;

export const headlessBatchStatusSchema = z
  .object({
    batchId: z.string().uuid(),
    brandId: z.string().uuid(),
    createdAt: z.string(),
    capUsd: usd,
    expectedUsd: usd,
    maxUsd: usd,
    /** Σ item holds: first passes plus re-directs. */
    holdUsd: usd,
    items: z.array(headlessBatchItemSchema).min(1).max(HEADLESS_BATCH_MAX_ITEMS),
    counts: headlessBatchCountsSchema,
    cast: z
      .object({
        /** The brand had no approved cast when the batch was made. */
        needed: z.boolean(),
        /** The people and places waiting on a brand user (approve with HEADLESS_CAST_APPROVE_ROUTE). */
        drafts: z.array(headlessCastDraftSchema),
        approved: z.boolean(),
      })
      .strict(),
    /** Every piece is ready or failed for good. */
    done: z.boolean(),
  })
  .strict();
export type HeadlessBatchStatus = z.infer<typeof headlessBatchStatusSchema>;

/** Persisted (keyed `headless_batch:<batchId>`): a reloaded card shows the latest status. */
export const uiHeadlessBatchFrameSchema = z.object({
  type: z.literal('ui.headless_batch'),
  data: headlessBatchStatusSchema,
});
export type UiHeadlessBatchFrame = z.infer<typeof uiHeadlessBatchFrameSchema>;
