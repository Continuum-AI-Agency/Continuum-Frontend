/**
 * Backend codes as sentences a human can act on.
 *
 * The publishing routes answer `{ error: 'draft_changed' }`, and the node used to render
 * that string verbatim — so the user's feedback for a lost optimistic-concurrency race
 * was the literal text `draft_changed`, with no hint that re-picking the draft fixes it.
 */
const DRAFT_WRITE_MESSAGES: Record<string, string> = {
  draft_not_found: 'That draft no longer exists. Pick another one.',
  draft_changed:
    'This draft changed somewhere else since you picked it. Re-select it to pull in the latest version, then save again.',
  draft_is_not_editable:
    'This draft has already been published, so its content can no longer be edited.',
  draft_format_mismatch:
    'This draft expects a different post format. Switch the node format to match it, or pick another draft.',
  draft_write_failed: 'The planner could not store this change. Try again in a moment.',
  platform_required: 'Choose the platform and account this new draft posts to.',
  day_required: 'Choose the day this new draft belongs on.',
  invalid_target: 'That date is not a day the planner can place a draft on.',
  forbidden: 'You do not have access to this brand.',
  invalid_payload: 'Something in this draft is not valid yet — check the caption and schedule.',
};

/** The `{ error: code }` body the publishing routes send, when there is one. */
function codeFrom(cause: unknown): string | null {
  if (!cause || typeof cause !== 'object') return null;
  const body =
    (cause as { body?: unknown; data?: unknown }).body ?? (cause as { data?: unknown }).data;
  const fromBody = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
  if (typeof fromBody === 'string') return fromBody;
  const message = (cause as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  // `http.request` throws with the status line plus the raw body, so the code is in there.
  const match = Object.keys(DRAFT_WRITE_MESSAGES).find((code) => message.includes(code));
  return match ?? null;
}

export function describeDraftWriteError(cause: unknown): string {
  const code = codeFrom(cause);
  if (code && DRAFT_WRITE_MESSAGES[code]) return DRAFT_WRITE_MESSAGES[code];
  if (cause instanceof Error && cause.message) return cause.message;
  return 'Could not save this draft. Try again.';
}
