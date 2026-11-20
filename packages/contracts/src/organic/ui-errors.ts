import { z } from 'zod';
import { publishPlatformSchema } from './publishing';

/** Stable UI reasons shared by emitters and localized clients. Existing free-form error fields remain compatible. */
export const previewApprovalErrorCodeSchema = z.enum([
  'preview_approval_required',
  'preview_changed',
]);
export type PreviewApprovalErrorCode = z.infer<typeof previewApprovalErrorCodeSchema>;

export const draftFanOutErrorCodeSchema = z.enum([
  'draft_not_found',
  'already_published',
  'reapproval_required',
  'member_scheduled',
  'last_member',
  'source_platform_not_selected',
  'not_connected',
  'account_not_candidate',
  'unsupported_format',
  'persist_failed',
  'member_not_found',
  'adapt_unavailable',
  'adapt_failed',
  'caption_too_long',
]);
export type DraftFanOutErrorCode = z.infer<typeof draftFanOutErrorCodeSchema>;

export const reelPreflightErrorCodeSchema = z.enum([
  'reel_scenes_missing_enrich_first',
  'preview_approval_required',
  'preview_changed',
]);
export type ReelPreflightErrorCode = z.infer<typeof reelPreflightErrorCodeSchema>;

export const plannerCaptionLimitErrorSchema = z
  .object({
    error: z.literal('caption_too_long'),
    platform: publishPlatformSchema,
    maxLength: z.number().int().positive(),
    length: z.number().int().nonnegative(),
    message: z.string().optional(),
  })
  .passthrough();
export type PlannerCaptionLimitError = z.infer<typeof plannerCaptionLimitErrorSchema>;
