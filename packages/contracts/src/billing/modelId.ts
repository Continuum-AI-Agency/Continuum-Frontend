import { z } from 'zod';

/**
 * Billing model ids — the keys `billing_private.canvas_credit_costs` is priced on.
 *
 * There are three id spaces in play and they do not agree:
 *
 *   canvas / UI id     'nano-banana-2'                   (model picker, persisted nodes)
 *   backend wire id    'gemini-3.1-flash-image-preview'  (zod enums, provider calls)
 *   billing id         'nano-banana-2@2k'                (this file, cost table)
 *
 * A cost row keyed on the wrong space silently falls through to the `'*'` wildcard,
 * which is priced fail-expensive — so a drifted id overcharges rather than leaks. Both
 * inbound spaces are accepted here and collapse to one billing id; anything unrecognised
 * throws rather than guessing, because an unpriced model must never reach a provider.
 *
 * Resolution is folded INTO the id rather than carried as a separate column: the cost
 * table is already keyed `(action_code, model_id)` and prefers an exact row over `'*'`,
 * so per-resolution pricing needs no schema change — `nano-banana-2@1k` and
 * `nano-banana-2@4k` are simply two rows.
 */

export const CANVAS_CREDIT_ACTION_CODES = [
  'canvas_image_generate',
  'canvas_image_edit',
  'canvas_image_reformat',
  'canvas_video_generate',
  'canvas_video_extend',
  'canvas_omni_generate',
  'canvas_hyperframes',
  // Reserved, not yet emitted. Organic generation runs through the same services but is
  // covered by the Organic Agent entitlement and stays off the meter until that feature
  // settles. Reserved now because widening a shipped enum later ripples across both
  // projects, and reserving costs nothing. See UNMETERED_GENERATION_SITES.
  'organic_image_generate',
  'organic_reel_scene',
  'jaina_health_report',
  /** @deprecated MVP umbrella. Retained for the seeded cost row and the existing bench. */
  'canvas_generation',
] as const;

export const canvasCreditActionCodeSchema = z.enum(CANVAS_CREDIT_ACTION_CODES);
export type CanvasCreditActionCode = (typeof CANVAS_CREDIT_ACTION_CODES)[number];

/** Billing size tiers. Lowercased on purpose — one casing, one cost row. */
export const IMAGE_BILLING_TIERS = ['512px', '1k', '2k', '4k'] as const;
export const VIDEO_BILLING_TIERS = ['720p', '1080p', '2k', '4k'] as const;

export type ImageBillingTier = (typeof IMAGE_BILLING_TIERS)[number];
export type VideoBillingTier = (typeof VIDEO_BILLING_TIERS)[number];

export class UnknownBillingModelError extends Error {
  constructor(readonly modelId: string) {
    super(`No billing model id for '${modelId}'. Add it to BILLING_MODEL_ALIASES.`);
    this.name = 'UnknownBillingModelError';
  }
}

export class UnsupportedBillingTierError extends Error {
  constructor(
    readonly billingModel: string,
    readonly tier: string,
  ) {
    super(`Billing model '${billingModel}' does not support tier '${tier}'.`);
    this.name = 'UnsupportedBillingTierError';
  }
}

/**
 * Every id that may arrive from the canvas or the backend, mapped to its billing base.
 * Keys are lowercased at lookup, so casing variants need no separate entry.
 */
const BILLING_MODEL_ALIASES: Readonly<Record<string, string>> = {
  // ---- images ----
  'nano-banana': 'nano-banana',
  'gemini-2.5-flash-image': 'nano-banana',
  'nano-banana-2': 'nano-banana-2',
  'gemini-3.1-flash-image-preview': 'nano-banana-2',
  'gemini-3.1-flash-image': 'nano-banana-2',
  'nano-banana-pro': 'nano-banana-pro',
  'gemini-3-pro-image-preview': 'nano-banana-pro',
  'gemini-3-pro-image': 'nano-banana-pro',
  'gpt-image-2': 'gpt-image-2',
  'openai/gpt-image-2/edit': 'gpt-image-2',
  'flux-2-pro': 'flux-2-pro',
  'fal-ai/flux-2-pro/edit': 'flux-2-pro',
  'flux-2-max': 'flux-2-max',
  'fal-ai/flux-2-max/edit': 'flux-2-max',

  // ---- video ----
  'veo-3.1': 'veo-3.1',
  'veo-3-1': 'veo-3.1',
  'veo-3.1-generate-preview': 'veo-3.1',
  'veo-3.1-fast': 'veo-3.1-fast',
  'veo-3-1-fast': 'veo-3.1-fast',
  'veo-3.1-fast-generate-preview': 'veo-3.1-fast',
  'veo-3.1-lite': 'veo-3.1-lite',
  'veo-3-1-lite': 'veo-3.1-lite',
  'veo-3.1-lite-generate-preview': 'veo-3.1-lite',
  'kling-omni': 'kling-omni',
  'fal-ai/kling-video/o3/standard/image-to-video': 'kling-omni',
  'pixverse-v6': 'pixverse-v6',
  'fal-ai/pixverse/v6/image-to-video': 'pixverse-v6',
  'seedance-2.0': 'seedance-2.0',
  'bytedance/seedance-2.0/image-to-video': 'seedance-2.0',
  'gemini-omni-flash': 'gemini-omni-flash',
  'gemini-omni-flash-preview': 'gemini-omni-flash',
};

/**
 * Which tiers each billing model is actually priced at.
 *
 * An empty list means the model takes no size parameter — `nano-banana` renders 1024
 * whatever it is asked for, and the fal-hosted models size by aspect ratio alone. Pricing
 * those per-resolution would be charging for a control the user does not have.
 */
const BILLING_MODEL_TIERS: Readonly<Record<string, readonly string[]>> = {
  'nano-banana': [],
  'nano-banana-2': IMAGE_BILLING_TIERS,
  'nano-banana-pro': ['1k', '2k', '4k'],
  'gpt-image-2': [],
  'flux-2-pro': [],
  'flux-2-max': [],

  'veo-3.1': VIDEO_BILLING_TIERS,
  'veo-3.1-fast': VIDEO_BILLING_TIERS,
  'veo-3.1-lite': ['720p', '1080p'],
  'kling-omni': [],
  'pixverse-v6': [],
  'seedance-2.0': [],
  'gemini-omni-flash': [],
};

/**
 * Canonicalize a tier. `4K`/`4k` and `2K`/`2k` are both in flight across the codebase;
 * two spellings of one tier is two cost rows and two chances for a rule to miss.
 */
export function canonicalizeBillingTier(tier: string): string {
  return tier.trim().toLowerCase();
}

/** The billing base id, without any tier suffix. Throws on an unmapped id. */
export function toBillingModelBase(modelId: string): string {
  const base = BILLING_MODEL_ALIASES[modelId.trim().toLowerCase()];
  if (!base) throw new UnknownBillingModelError(modelId);
  return base;
}

/** True when this model is priced per resolution. */
export function supportsBillingTier(modelId: string): boolean {
  return BILLING_MODEL_TIERS[toBillingModelBase(modelId)].length > 0;
}

export type BillingModelInput = {
  /** Canvas id or backend wire id — either space is accepted. */
  modelId: string;
  /** Resolution / size. Ignored for models that take no size parameter. */
  tier?: string | null;
};

/**
 * The cost-table key for a generation.
 *
 * Throws rather than falling back for an unknown model, so a newly added model fails
 * loudly at the reserve instead of quietly billing the wildcard rate. A tier that the
 * model does not price also throws — silently dropping it would bill 4K at 1K rates.
 */
export function toBillingModelId({ modelId, tier }: BillingModelInput): string {
  const base = toBillingModelBase(modelId);
  const tiers = BILLING_MODEL_TIERS[base];

  if (tiers.length === 0) return base;

  if (tier == null || tier === '') {
    throw new UnsupportedBillingTierError(base, '(none supplied)');
  }

  const canonical = canonicalizeBillingTier(tier);
  if (!tiers.includes(canonical)) {
    throw new UnsupportedBillingTierError(base, tier);
  }

  return `${base}@${canonical}`;
}

/** Every billing model id that must have a cost row. Drives the coverage assertion. */
export function allBillingModelIds(): readonly string[] {
  const ids = new Set<string>();
  for (const [base, tiers] of Object.entries(BILLING_MODEL_TIERS)) {
    if (tiers.length === 0) ids.add(base);
    else for (const tier of tiers) ids.add(`${base}@${tier}`);
  }
  return [...ids].sort();
}

/**
 * Generation call sites deliberately left off the meter.
 *
 * A named list rather than an absence: an omitted call site is indistinguishable from a
 * forgotten one. The seam test asserts every generation construction is either behind the
 * credits helper or named here, so adding a new organic generator fails loudly, and
 * switching metering on is deleting an entry.
 */
export const UNMETERED_GENERATION_SITES = [
  'App/organic/creation/calendarGenerator.ts',
  'App/organic/creation/tools/draftImageTool.ts',
  'App/organic/creative/tools/generatePostImage.ts',
  'App/organic/creative/tools/generateHyperframeCover.ts',
  'App/organic/creative/reel/sceneGenerator.ts',
] as const;
