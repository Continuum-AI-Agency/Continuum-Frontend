// One click is one send. A starter, a suggestion chip and "Ask again" each send on click, and a
// double click is two clicks before the first send has answered: each became its own
// conversation, or its own queued copy of the prompt — a paid model run per click
// (PP-DT-C-jaina-starter-double-click-sends-twice). The composer was spared only because it
// clears its text on the first submit.

/** Two submissions of the same turn closer together than this are one click, not two asks. */
export const REPEAT_SUBMISSION_WINDOW_MS = 1_500;

export type SubmissionStamp = { key: string; at: number };

/** What makes two submissions the same turn: the text and everything attached to it. */
export function submissionKey(
  query: string,
  attachmentIds: readonly string[],
  references: readonly unknown[],
): string {
  return JSON.stringify([query.trim(), attachmentIds, references]);
}

/**
 * True when `next` repeats a turn that is still being sent, or one sent a moment ago. A send
 * still being set up (its conversation not yet created) cannot be told apart from a click the
 * reader did not see land, so it is never sent twice; after that, only the double-click window
 * holds — the same question asked again later is a new ask.
 */
export function isRepeatSubmission(input: {
  next: SubmissionStamp;
  previous: SubmissionStamp | null;
  inFlightKeys: ReadonlySet<string>;
}): boolean {
  const { next, previous, inFlightKeys } = input;
  if (inFlightKeys.has(next.key)) return true;
  return (
    previous !== null &&
    previous.key === next.key &&
    next.at - previous.at < REPEAT_SUBMISSION_WINDOW_MS
  );
}
