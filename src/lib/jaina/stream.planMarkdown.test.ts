import { describe, expect, it } from 'bun:test';
import {
  createInitialJainaStreamState,
  type ParsedJainaStreamEvent,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from './stream';

/**
 * Byte-for-byte the shape `renderObjectivePlanMarkdown` emits
 * (Continuum-Backend/App/agents-ts/Jaina/src/agents/orchestrator.ts:1233), which the
 * runtime sends as a single `response.plan.delta` at plan-init — measured landing at
 * 0.7s of a turn. Both FE parsers used to reject it (JSON.parse throws; the key/value
 * parser bails on `!includes('=')`), so the plan silently never rendered.
 */
const PLAN_MARKDOWN = `Plan: Campaign performance review
Intent: analysis | Date: last_7d | Scope ceiling: campaign

1. [account] Pull account-level spend and ROAS for the period
   Establish the baseline before drilling into campaigns.
   Why: Campaign numbers are meaningless without the account trend.
   Stop when: Spend, ROAS and CTR are known for last_7d.

2. [campaign] Rank campaigns by spend and flag decliners depends on obj_account
   Why: The user asked which campaigns changed.
   Stop when: Top and bottom campaigns are identified with numbers.

`;

const planDeltaLine = (delta: string) =>
  JSON.stringify({ type: 'response.plan.delta', data: { delta } });

const fold = (wire: string[]) =>
  wire
    .map((line) => parseJainaStreamEvent(line))
    .filter((event): event is ParsedJainaStreamEvent => event !== null)
    .reduce(reduceJainaStreamEvent, createInitialJainaStreamState());

describe('response.plan.delta — markdown plan from the backend', () => {
  it('renders a plan rather than dropping it', () => {
    const state = fold([planDeltaLine(PLAN_MARKDOWN)]);
    expect(state.plan).not.toBeNull();
  });

  it('takes the title from the Plan: header', () => {
    const state = fold([planDeltaLine(PLAN_MARKDOWN)]);
    expect(state.plan?.title).toBe('Campaign performance review');
  });

  it('turns each numbered objective into a step, keeping order', () => {
    const state = fold([planDeltaLine(PLAN_MARKDOWN)]);
    expect(state.plan?.steps.map((step) => step.title)).toEqual([
      'Pull account-level spend and ROAS for the period',
      'Rank campaigns by spend and flag decliners',
    ]);
  });

  it('prefers the objective description, matching the JSON parser precedence', () => {
    const state = fold([planDeltaLine(PLAN_MARKDOWN)]);
    expect(state.plan?.steps[0]?.description).toBe(
      'Establish the baseline before drilling into campaigns.',
    );
  });

  it('falls back to the success criteria when an objective has no description line', () => {
    const state = fold([planDeltaLine(PLAN_MARKDOWN)]);
    expect(state.plan?.steps[1]?.description).toBe(
      'Top and bottom campaigns are identified with numbers.',
    );
  });

  it('marks every step pending — the plan has only just been announced', () => {
    const state = fold([planDeltaLine(PLAN_MARKDOWN)]);
    expect(state.plan?.steps.every((step) => step.status === 'pending')).toBe(true);
  });

  it('summarises intent and date window in the description', () => {
    const state = fold([planDeltaLine(PLAN_MARKDOWN)]);
    expect(state.plan?.description).toContain('last_7d');
  });

  it('still parses a JSON plan delta (the shape that already worked)', () => {
    const state = fold([
      planDeltaLine(
        JSON.stringify({
          plan_id: 'plan-json-1',
          chat_title: 'JSON plan',
          objectives: [{ task: 'Do the thing', success_criteria: 'It is done' }],
        }),
      ),
    ]);
    expect(state.plan?.title).toBe('JSON plan');
    expect(state.plan?.steps[0]?.title).toBe('Do the thing');
  });

  it('does not invent a plan from prose that merely looks like text', () => {
    const state = fold([planDeltaLine('Just thinking out loud about the account.')]);
    expect(state.plan).toBeNull();
  });
});
