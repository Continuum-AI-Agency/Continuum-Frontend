/**
 * The turn the Scale canvas sends when a person taps "Implement these changes" on a proposal
 * Jaina made in her answer (a preview with `origin: 'proposal'`, ./jaina-live-change).
 *
 * A proposal has no approval yet, so implementing it is a NEW turn that must open the gated
 * tools' approval cards. A generic "implement what you proposed" left the model to guess which
 * ids and figures were meant, and it asked "shall I generate the approval cards?" instead of
 * calling the tools (measured on beta, 2026-11-02: run_41916ae4…, one read tool, no gated call).
 * So the turn carries the changes of THAT preview — entity, id, action, daily figure — and the
 * order to open one card per change without asking.
 *
 * Both sides import this file: the Frontend builds the turn from the preview it shows, and the
 * Backend recognises the header and plans the turn as an operation (a DO, not an analysis), the
 * way it does for any ask to make a named change.
 */

import { formatMoney } from '../optimization/money';
import type { ChangeProjection, ProjectionEntity } from './jaina-change-projection';
import type { LiveChangePreviewPayload } from './jaina-live-change';

/** First line of every implement turn; the Backend recognises the turn by it. */
export const IMPLEMENT_PROPOSAL_TURN_HEADER = 'Implement this proposal now.' as const;

export const isImplementProposalTurn = (query: string): boolean =>
  query.trimStart().startsWith(IMPLEMENT_PROPOSAL_TURN_HEADER);

const LEVEL_WORDS = { campaign: 'campaign', adset: 'ad set', ad: 'ad' } as const;

const dailyOf = (spend: number | null, days: number): number | null =>
  spend === null ? null : spend / days;

const stepOf = (
  entity: ProjectionEntity,
  projection: ChangeProjection,
  index: number,
): string | null => {
  const subject = `${LEVEL_WORDS[entity.level]} «${entity.name}» (id ${entity.id})`;
  if (entity.action === 'pause') return `${index}. Pause ${subject}.`;
  if (entity.action === 'unchanged') return null;
  const days = projection.window.days;
  const now = dailyOf(entity.before.spend, days);
  const target = dailyOf(entity.after.spend, days);
  if (target === null) return null;
  const verb = entity.action === 'increase' ? 'Raise' : 'Lower';
  const from = now === null ? '' : `, from ${formatMoney(now, projection.currency)} a day`;
  return `${index}. ${verb} the daily budget of ${subject} to ${formatMoney(target, projection.currency)} a day${from} (${entity.changeLabel}).`;
};

/**
 * The implement turn for a Meta proposal, or null when there is nothing the gated tools can
 * apply: a Google proposal (no gated write tool), a preview with no projection, or one whose
 * entities all stay as they are.
 */
export function buildImplementProposalTurn(preview: LiveChangePreviewPayload): string | null {
  const projection = preview.projection;
  if (!projection || preview.platform === 'google' || projection.platform === 'google') {
    return null;
  }
  const steps: string[] = [];
  for (const entity of projection.entities) {
    const step = stepOf(entity, projection, steps.length + 1);
    if (step) steps.push(step);
  }
  if (steps.length === 0) return null;
  return [
    IMPLEMENT_PROPOSAL_TURN_HEADER,
    'Call the matching gated Meta tool for each change below, with the exact ids, so each one reaches me as an approval card. Do not ask whether to proceed, do not propose again and do not read more data: the card is how I confirm, and nothing applies without it.',
    ...steps,
    'Answer in the language of this conversation.',
  ].join('\n');
}
