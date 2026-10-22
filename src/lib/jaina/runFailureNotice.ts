// What the transcript says when a Jaina turn ends in an error, and whether Try again can help.
//
// Try again RESUMES the run: it replays the run's durable log from the start. That recovers a
// dropped connection. It cannot recover a run whose log itself is broken (the SDK rejected one of
// its chunks) or a run that is over (cancelled) — replaying it ends in the same error, so offering
// the button there is a loop. Those runs are over, and the honest next step is to ask again.

import { UIMessageStreamError } from 'ai';
import { loadFailureMessage } from '@/lib/api/loadFailure';

export type JainaRunFailureNotice = {
  text: string;
  /** True when resuming the run can still recover the answer. */
  canResume: boolean;
};

/** The terminal frame's message for a cancelled run (Backend `server.ts` emitTerminalFailure). */
const RUN_CANCELLED = /^run cancelled\.?$/i;

export const INTERRUPTED_RUN_TEXT =
  'This run was interrupted before Jaina finished. Ask again to get a fresh answer.';
export const CANCELLED_RUN_TEXT =
  'This run was stopped before Jaina finished. Ask again to get a fresh answer.';

export function jainaRunFailureNotice(error: unknown): JainaRunFailureNotice {
  if (UIMessageStreamError.isInstance(error)) {
    return { text: INTERRUPTED_RUN_TEXT, canResume: false };
  }
  if (error instanceof Error && RUN_CANCELLED.test(error.message.trim())) {
    return { text: CANCELLED_RUN_TEXT, canResume: false };
  }
  return { text: loadFailureMessage("Jaina's answer", error), canResume: true };
}
