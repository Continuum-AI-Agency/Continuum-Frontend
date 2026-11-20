import type { PublicShareFailureReason } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';

const reasons = {
  share_passcode_invalid: 'sharePasscodeInvalid',
  reviewer_identity_required: 'shareIdentityRequired',
  share_field_edit_not_allowed: 'shareFieldEditDenied',
  share_field_value_invalid: 'shareFieldValueInvalid',
} as const satisfies Record<PublicShareFailureReason, string>;

/** Compatibility for the exact first-party messages returned before reasonCode existed. */
const legacyReasons: Readonly<Record<string, PublicShareFailureReason>> = {
  'The passcode is incorrect': 'share_passcode_invalid',
  'Reviewer identity is required': 'reviewer_identity_required',
  'This link does not take field edits.': 'share_field_edit_not_allowed',
  'This field cannot be edited here.': 'share_field_edit_not_allowed',
  'That value does not fit this field.': 'share_field_value_invalid',
};

export function publicFailureCode(payload: {
  reasonCode?: unknown;
  code?: unknown;
  error?: unknown;
  message?: unknown;
}): string | undefined {
  if (typeof payload.reasonCode === 'string') return payload.reasonCode;
  for (const value of [payload.error, payload.message]) {
    if (typeof value === 'string' && Object.hasOwn(legacyReasons, value))
      return legacyReasons[value];
  }
  if (typeof payload.code === 'string') return payload.code;
  return typeof payload.error === 'string' ? payload.error : undefined;
}

export function publicErrorMessage(
  code: unknown,
  translate: ReturnType<typeof useTranslations<'public'>>,
  status?: number,
): string {
  if (typeof code === 'string' && Object.hasOwn(reasons, code))
    return translate(reasons[code as PublicShareFailureReason]);
  if (
    code === 'share_forbidden' ||
    code === 'asset_not_shared' ||
    code === 'asset_not_found' ||
    code === 'file_not_found' ||
    status === 404
  )
    return translate('shareAccessUnavailable');
  if (code === 'invalid_request' || status === 400 || status === 422)
    return translate('checkPublicForm');
  if (code === 'version_conflict' || code === 'review_status_conflict' || status === 409)
    return translate('shareVersionConflict');
  if (code === 'service_unavailable' || (status && status >= 500))
    return translate('publicServiceUnavailable');
  return translate('publicRequestFailed');
}
