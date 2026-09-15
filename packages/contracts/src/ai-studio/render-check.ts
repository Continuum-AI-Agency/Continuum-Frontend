import { apiRenderFitReportSchema } from './api-render-fit';
import { type ApiRenderJudge, apiRenderJudgeSchema } from './api-render-judge';

/**
 * What measured a finished frame, in the words Slack and the UI both say.
 *
 * `unknown` is the judge failing to RUN and `unchecked` is a template with nothing to place —
 * neither is a pass, and only a pass may reach a client's room.
 */
export type RenderCheck = 'pass' | 'fail' | 'unknown' | 'pending' | 'unchecked';

export const RENDER_CHECK_WORDS = {
  placementPassed: 'Checked: placement passed',
  judgePassed: 'Checked: the judge passed',
  judgeFlagged: 'Checked: the judge flagged',
  judgeCouldNotRun: 'Not checked: the judge could not run',
  pending: 'Waiting on the judge',
  unchecked: 'Not checked: no media placement to measure',
} as const;

function read(row: { fit: unknown; judge: unknown }): {
  check: RenderCheck;
  judge: ApiRenderJudge | null;
} {
  const judge = apiRenderJudgeSchema
    .nullable()
    .catch(null)
    .parse(row.judge ?? null);
  if (judge) return { check: judge.state, judge };
  const fit = apiRenderFitReportSchema
    .nullable()
    .catch(null)
    .parse(row.fit ?? null);
  if (!fit) return { check: 'unchecked', judge: null };
  return { check: fit.escalate ? 'pending' : 'pass', judge: null };
}

export const renderCheckOf = (row: { fit: unknown; judge: unknown }): RenderCheck =>
  read(row).check;

export function renderCheckWords(row: { fit: unknown; judge: unknown }): string {
  const { check, judge } = read(row);
  if (!judge) {
    if (check === 'pass') return RENDER_CHECK_WORDS.placementPassed;
    return check === 'pending' ? RENDER_CHECK_WORDS.pending : RENDER_CHECK_WORDS.unchecked;
  }
  // The formats that decided the top-level state — every one on a pass, the offenders otherwise.
  const named = (judge.frames ?? [])
    .filter((frame) => frame.state === judge.state)
    .map((frame) => frame.ratio ?? frame.fileName)
    .join(' · ');
  if (judge.state === 'pass') return `${RENDER_CHECK_WORDS.judgePassed} ${named || 'this frame'}`;
  if (judge.state === 'fail') return `${RENDER_CHECK_WORDS.judgeFlagged} ${named || 'this frame'}`;
  return named
    ? `${RENDER_CHECK_WORDS.judgeCouldNotRun} on ${named}`
    : RENDER_CHECK_WORDS.judgeCouldNotRun;
}
