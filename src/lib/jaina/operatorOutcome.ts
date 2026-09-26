// How an operator action ended, read off the transcript the way a person reads it.
//
// An operator action (Deploy paused, Pause, Unpause) either opens its approval gate or the
// Backend refuses it in words — "Deploy is blocked: the brand has no single Facebook Page". The
// button that asked must learn which, or it sits on "Opening the approval…" forever and the
// reason never reaches the person who clicked.

export type OperatorActionOutcome = { ok: true } | { ok: false; reason: string };

type TranscriptMessage = {
  role: string;
  content?: string;
  pendingToolApprovals?: { toolName: string }[];
};

export const NO_GATE_REASON = 'Jaina did not open an approval for this action.';
export const BUSY_REASON = 'Jaina is still answering. Try again when the answer finishes.';

/**
 * Why an operator action cannot be sent right now, or null when it can. Mid-turn, a second send
 * would interleave with the answer being streamed; with one action already waiting on its turn,
 * a second would race it for the same outcome.
 */
export const operatorDispatchRefusal = (state: {
  isStreaming: boolean;
  actionPending: boolean;
}): string | null => (state.isStreaming || state.actionPending ? BUSY_REASON : null);

/**
 * The outcome of the operator turn whose messages are `sinceDispatch`, or null while it has not
 * answered yet. A gate for `tool` anywhere in the turn is success; an answer without one is a
 * refusal, and its text is the reason.
 */
export function operatorActionOutcome(
  sinceDispatch: TranscriptMessage[],
  tool: string,
): OperatorActionOutcome | null {
  const answers = sinceDispatch.filter((message) => message.role === 'assistant');
  if (answers.length === 0) return null;
  const opened = answers.some((message) =>
    (message.pendingToolApprovals ?? []).some((approval) => approval.toolName === tool),
  );
  if (opened) return { ok: true };
  return { ok: false, reason: refusalReasonOf(answers) };
}

/** Why a turn that opened no gate refused: the last thing the assistant said, never blank. */
export function refusalReasonOf(sinceDispatch: TranscriptMessage[]): string {
  const said = sinceDispatch
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content?.trim() ?? '')
    .filter(Boolean)
    .at(-1);
  return said || NO_GATE_REASON;
}
