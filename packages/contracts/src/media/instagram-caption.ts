/**
 * Single source of truth for assembling a social caption from a draft's caption text
 * + hashtag tiers, with the destination platform's hard limits enforced. Both the
 * Frontend (publish-utils) and the Backend (publisher) import this so the caption that
 * renders in the editor is byte-identical to the one published — no drift between two
 * hand-rolled builders.
 *
 * The filename is historical: Instagram was the only publishable platform when this
 * landed, so its limits became the defaults. The builder body was always platform-
 * neutral — only the DEFAULTS were Instagram's. `buildPlatformCaption` /
 * `clampPlatformCaption` are the platform-aware entry points; every caller that knows
 * its destination should use those. The `INSTAGRAM_*` exports and the two generic
 * builders stay for callers that genuinely mean Instagram.
 *
 * Limits (Instagram Content Publishing API): caption ≤ 2200 chars, ≤ 30 hashtags.
 * The hashtag cap counts the tag ARRAY, never a regex over the caption body, so a
 * legitimate `#word` written in prose is never stripped.
 */
import { captionLimits, type PublishPlatform } from '../organic/publishing';

export const INSTAGRAM_CAPTION_MAX_LENGTH = 2200;
export const INSTAGRAM_HASHTAG_MAX = 30;

export type HashtagTiers = {
  high?: string[] | null;
  medium?: string[] | null;
  low?: string[] | null;
};

export type BuildInstagramCaptionOptions = {
  maxLength?: number;
  maxHashtags?: number;
};

function normalizeHashtags(input: HashtagTiers | string[] | null | undefined): string[] {
  if (!input) return [];
  const raw = Array.isArray(input)
    ? input
    : [...(input.high ?? []), ...(input.medium ?? []), ...(input.low ?? [])];

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const tag = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/**
 * Clamp an already-assembled caption to `maxLength`, trimming back to the last
 * word boundary when the cut would land mid-token (so we never leave a dangling
 * half-hashtag). The final safety net before the publish call.
 */
export function clampInstagramCaption(
  full: string | null | undefined,
  maxLength: number = INSTAGRAM_CAPTION_MAX_LENGTH,
): string {
  const text = full ?? '';
  if (text.length <= maxLength) return text;

  let sliced = text.slice(0, maxLength);
  const nextChar = text.charAt(maxLength);
  if (nextChar && /\S/.test(nextChar)) {
    const lastBreak = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf('\n'));
    if (lastBreak > 0) sliced = sliced.slice(0, lastBreak);
  }
  return sliced.trimEnd();
}

/**
 * The assembled caption plus what assembly did to it: which tags survived the tag cap and
 * the length clamp, and where the clamp cut. The publish plan shows these to the user, so
 * a dropped tag or a cut sentence is a visible notice instead of a silent loss.
 */
export interface CaptionAssembly {
  /** Exactly what is sent. */
  text: string;
  /** The body as typed, trimmed. */
  body: string;
  keptHashtags: string[];
  droppedHashtags: string[];
  truncated: boolean;
  /** Offset in the assembled caption where the clamp cut, or null when nothing was cut. */
  truncatedAt: number | null;
  limit: number;
  hashtagLimit: number;
}

export function assembleCaption(
  caption: string | null | undefined,
  hashtags?: HashtagTiers | string[] | null,
  opts: BuildInstagramCaptionOptions = {},
): CaptionAssembly {
  const limit = opts.maxLength ?? INSTAGRAM_CAPTION_MAX_LENGTH;
  const hashtagLimit = opts.maxHashtags ?? INSTAGRAM_HASHTAG_MAX;

  const body = (caption ?? '').trim();
  const tags = normalizeHashtags(hashtags);
  const capped = tags.slice(0, hashtagLimit);
  const tagBlock = capped.join(' ');

  const full = body && tagBlock ? `${body}\n\n${tagBlock}` : body || tagBlock;
  const text = clampInstagramCaption(full, limit);
  const truncated = text.length < full.trimEnd().length;

  // A tag is kept only when the clamp left all of it standing.
  const keptHashtags: string[] = [];
  let offset = body && tagBlock ? body.length + 2 : 0;
  for (const tag of capped) {
    if (offset + tag.length <= text.length) keptHashtags.push(tag);
    offset += tag.length + 1;
  }
  const droppedHashtags = tags.filter((tag) => !keptHashtags.includes(tag));

  return {
    text,
    body,
    keptHashtags,
    droppedHashtags,
    truncated,
    truncatedAt: truncated ? text.length : null,
    limit,
    hashtagLimit,
  };
}

/**
 * Assemble a publishable caption: `caption` body + `\n\n` + up to `maxHashtags`
 * hashtags (deduped, `#`-prefixed), then clamp the whole to `maxLength`.
 */
export function buildInstagramCaption(
  caption: string | null | undefined,
  hashtags?: HashtagTiers | string[] | null,
  opts: BuildInstagramCaptionOptions = {},
): string {
  return assembleCaption(caption, hashtags, opts).text;
}

/**
 * Assemble a publishable caption for a specific platform. Identical assembly to
 * `buildInstagramCaption`; the only difference is that the limits come from the
 * platform's capability block instead of Instagram's defaults — so a 2,600-char
 * LinkedIn caption survives instead of being silently cut at 2200.
 */
export function buildPlatformCaption(
  platform: PublishPlatform,
  caption: string | null | undefined,
  hashtags?: HashtagTiers | string[] | null,
): string {
  return buildInstagramCaption(caption, hashtags, captionLimits(platform));
}

/** `assembleCaption` against the destination platform's limits. */
export function assemblePlatformCaption(
  platform: PublishPlatform,
  caption: string | null | undefined,
  hashtags?: HashtagTiers | string[] | null,
): CaptionAssembly {
  return assembleCaption(caption, hashtags, captionLimits(platform));
}

/**
 * The length of the caption `platform` would be sent — body + `\n\n` + the tags under its tag
 * cap — before any clamp. The one number every caption check compares to `maxLength`: the
 * editor counter, the write paths, the verdict and the publish gate. Measuring the body alone
 * let a caption save and show "fits" that approve then refused once its hashtags were added.
 */
export function platformCaptionLength(
  platform: PublishPlatform,
  caption: string | null | undefined,
  hashtags?: HashtagTiers | string[] | null,
): number {
  const { maxHashtags } = captionLimits(platform);
  return assembleCaption(caption, hashtags, {
    maxLength: Number.POSITIVE_INFINITY,
    maxHashtags,
  }).text.trimEnd().length;
}

/** The final pre-publish clamp, against the destination platform's own maximum. */
export function clampPlatformCaption(
  platform: PublishPlatform,
  full: string | null | undefined,
): string {
  return clampInstagramCaption(full, captionLimits(platform).maxLength);
}
