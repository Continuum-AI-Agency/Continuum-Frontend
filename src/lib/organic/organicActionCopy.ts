// The words every organic card uses for its actions and its failures, in ONE place.
// Chat cards, planner cards and the AI Studio handoff each used to word the same action
// their own way ("Calendar", "View post", "Open draft", "Open in Planner"), and failures
// printed whatever error string the Backend happened to send.

export const ORGANIC_ACTION_LABELS = {
  /** Re-run a FAILED generation job in place. */
  retry: 'Retry',
  /** A finished job whose draft row is gone: mint a new draft and re-run the job. */
  recreateDraft: 'Recreate draft',
  /** Select this draft in the planner. */
  openInCalendar: 'Open in Calendar',
  /** The planner itself, for a card with no draft left to select. */
  openCalendar: 'Open Calendar',
  openInAiStudio: 'Open in AI Studio',
  enrich: 'Enrich',
  generateMedia: 'Generate media',
} as const;

const DRAFT_MISSING =
  'Its draft no longer exists. It was deleted from the calendar or never saved.';
const PERSIST_FAILED = 'The post was written but could not be saved to your calendar.';
const STALLED = 'The writer stopped responding before the post was finished.';
const MEDIA_FAILED = 'The copy is saved. Only the media failed to render.';

// Backend error codes -> a sentence a marketer can act on. Unknown codes fall back to the
// message the Backend sent, which is still better than a code.
const FAILURE_CODE_COPY: Record<string, string> = {
  persist_failed: PERSIST_FAILED,
  draft_persist_failed: PERSIST_FAILED,
  draft_deleted: 'This post was deleted from your calendar, so its draft no longer exists.',
  draft_missing: DRAFT_MISSING,
  draft_not_found: DRAFT_MISSING,
  enqueue_lost: 'The request never reached the generation queue.',
  enqueue_failed: 'The request could not be added to the generation queue.',
  placement_timeout: 'Writing this post took too long and was stopped.',
  model_stall: STALLED,
  drain_timeout: STALLED,
  stream_stalled: STALLED,
  generation_failed: 'The post could not be written.',
  preview_approval_required: 'The preview needs a fresh approval before media can be made.',
  preview_changed: 'The preview changed after you approved it. Enrich again, then generate media.',
};

const GENERIC_FAILURE = 'Something went wrong while making this post.';

export type OrganicFailurePhase = 'failed' | 'media_failed' | 'draft_missing';

/**
 * The one plain-language sentence for a failed card. A missing draft outranks any stale
 * error code it still carries; a known code outranks the raw message.
 */
export function describeOrganicFailure(input: {
  phase: OrganicFailurePhase;
  code?: string | null;
  message?: string | null;
}): string {
  if (input.phase === 'draft_missing') return DRAFT_MISSING;
  const byCode = input.code ? FAILURE_CODE_COPY[input.code] : undefined;
  if (byCode) return byCode;
  if (input.phase === 'media_failed') return MEDIA_FAILED;
  const message = input.message?.trim();
  return message ? message : GENERIC_FAILURE;
}

/** "Draft 7f95…": enough to match a row in the logs, short enough for a card. */
export function shortDraftId(draftId: string): string {
  return `Draft ${draftId.slice(0, 4)}…`;
}

export const PAST_DATE_NOTICE = 'This date has passed; pick a new time';

/** A card whose draft never reached the server: it is not a real post until Recreate saves it. */
export const SAVE_FAILED_NOTICE = 'This post failed to save.';

/** The toast for a scheduled post the persist floor moved off a moment that had passed. */
export function describeFlooredSchedule(
  title: string,
  scheduledIso: string,
): { title: string; description: string } {
  const movedTo = new Date(scheduledIso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return {
    title: 'That time has passed',
    description: `“${title.trim() || 'This post'}” was scheduled for ${movedTo} instead, so it does not publish right away. Pick a new time if that is not what you want.`,
  };
}

/**
 * A draft that has not gone out yet and whose moment is behind the clock. Published,
 * in-flight and slot-only cards are excluded: nothing about them can be rescheduled.
 */
export function isUnpublishedPastDue(input: {
  status: string;
  scheduledAt: string | null | undefined;
  nowMs?: number;
}): boolean {
  if (input.status === 'published' || input.status === 'streaming') return false;
  if (input.status === 'placeholder') return false;
  if (!input.scheduledAt) return false;
  const at = Date.parse(input.scheduledAt);
  return Number.isFinite(at) && at < (input.nowMs ?? Date.now());
}
