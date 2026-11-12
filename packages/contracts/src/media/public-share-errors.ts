import { z } from 'zod';

/** Optional localized-guidance facts. Legacy code/message/error fields retain their existing values. */
export const publicShareFailureReasonSchema = z.enum([
  'share_passcode_invalid',
  'reviewer_identity_required',
  'share_field_edit_not_allowed',
  'share_field_value_invalid',
]);
export type PublicShareFailureReason = z.infer<typeof publicShareFailureReasonSchema>;
