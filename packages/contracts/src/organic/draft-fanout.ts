/**
 * Sibling-draft fan-out: publishing "the same post" to several platforms.
 *
 * The organic stack is one-platform-per-draft-row, and stays that way. Fan-out mints
 * one sibling row per additional platform, each publishing through the UNCHANGED
 * single-platform path. Before fan-out there is one row, so everything is shared by
 * construction; after it, each platform is deliberately an independent post that can be
 * tailored on its own.
 *
 * Both sides import from here: the Backend `fanOutDraftPlatforms` validates the request
 * and emits the response, the Frontend multi-select renders it.
 */
import { z } from 'zod';
import { publishPlatformSchema } from './publishing';

/**
 * Separator between a source draft's `client_key` and the sibling's platform.
 *
 * Doubled so it cannot collide with the UUID / placement-id shapes every other writer
 * mints, and so `parseSiblingClientKey` can split a key back apart unambiguously.
 */
export const SIBLING_CLIENT_KEY_SEPARATOR = '::';

/**
 * The sibling's per-brand identity, derived rather than random.
 *
 * `organic_calendar_drafts` carries `UNIQUE (brand_id, client_key)`, so a deterministic
 * key makes fan-out idempotent for free: re-approving, retrying, or double-clicking
 * converges on the same row instead of minting duplicates. The source row keeps its bare
 * key, so the Frontend autosave (which keys on it) keeps converging on the source.
 *
 * THE single definition — both the Backend writer and the Frontend reader call it.
 */
export function deriveSiblingClientKey(sourceClientKey: string, platform: string): string {
  return `${sourceClientKey}${SIBLING_CLIENT_KEY_SEPARATOR}${platform}`;
}

/**
 * Inverse of {@link deriveSiblingClientKey}. Returns `null` for a bare (source) key.
 *
 * Splits on the LAST separator and validates the suffix against the platform enum, so a
 * source key that itself contains `::` still round-trips.
 */
export function parseSiblingClientKey(
  clientKey: string,
): { sourceClientKey: string; platform: PublishPlatformLiteral } | null {
  const at = clientKey.lastIndexOf(SIBLING_CLIENT_KEY_SEPARATOR);
  if (at <= 0) return null;

  const suffix = clientKey.slice(at + SIBLING_CLIENT_KEY_SEPARATOR.length);
  const parsed = publishPlatformSchema.safeParse(suffix);
  if (!parsed.success) return null;

  return { sourceClientKey: clientKey.slice(0, at), platform: parsed.data };
}

type PublishPlatformLiteral = z.infer<typeof publishPlatformSchema>;

/**
 * Explicit per-platform account ids. Fan-out never guesses an account: an Instagram
 * account id stamped on a LinkedIn row would publish to the wrong place, and the failure
 * would surface as a provider error long after the row was written.
 *
 * `partialRecord`, not `record`: a `z.record` keyed by an enum is EXHAUSTIVE in Zod 4 —
 * it would demand an account id for every platform, including ones the caller did not
 * select.
 */
export const draftFanOutAccountsSchema = z.partialRecord(publishPlatformSchema, z.string().min(1));
export type DraftFanOutAccounts = z.infer<typeof draftFanOutAccountsSchema>;

export const draftFanOutRequestSchema = z.object({
  /**
   * The full selected set, INCLUDING the source draft's own platform — it is the state
   * of the multi-select, not a delta. Platforms absent from it have their sibling
   * removed, which is what makes deselection expressible.
   */
  platforms: z
    .array(publishPlatformSchema)
    .min(1)
    .max(3)
    .refine((values) => new Set(values).size === values.length, {
      message: 'platforms must be unique',
    }),
  accounts: draftFanOutAccountsSchema.optional(),
});
export type DraftFanOutRequest = z.infer<typeof draftFanOutRequestSchema>;

export const draftFanOutMemberSchema = z.object({
  id: z.string(),
  platform: publishPlatformSchema,
  clientKey: z.string(),
  platformAccountId: z.string(),
  status: z.string(),
  /** True for the source row, which is never re-created. */
  isSource: z.boolean(),
  /** True only when THIS call minted the row — false when it already existed. */
  created: z.boolean(),
});
export type DraftFanOutMember = z.infer<typeof draftFanOutMemberSchema>;

export const draftFanOutRemovedSchema = z.object({
  id: z.string(),
  platform: publishPlatformSchema,
});
export type DraftFanOutRemoved = z.infer<typeof draftFanOutRemovedSchema>;

/**
 * A deselected sibling that was NOT deleted. Deleting a published row would orphan a
 * live post, so publishing wins over deselection and the caller is told.
 */
export const draftFanOutRetainedSchema = z.object({
  id: z.string(),
  platform: publishPlatformSchema,
  reason: z.literal('published'),
});
export type DraftFanOutRetained = z.infer<typeof draftFanOutRetainedSchema>;

export const draftFanOutResponseSchema = z.object({
  sourceId: z.string(),
  sourcePlatform: publishPlatformSchema,
  groupId: z.string().uuid(),
  members: z.array(draftFanOutMemberSchema),
  removed: z.array(draftFanOutRemovedSchema),
  retained: z.array(draftFanOutRetainedSchema),
});
export type DraftFanOutResponse = z.infer<typeof draftFanOutResponseSchema>;
