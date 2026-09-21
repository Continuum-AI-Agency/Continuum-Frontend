/**
 * The Frontend half of a cited optimizer card: the boundary parse, and what it lets through.
 *
 * The two directions are not symmetric, and that asymmetry IS the feature. A payload that does
 * not type is dropped (the schema is the digit gate). A payload that types but whose size and
 * count disagree is kept, because the renderer has a fallback that names the bug and dropping
 * it here would render as Jaina having cited nothing at all.
 */

import { describe, expect, it } from 'bun:test';
import { JAINA_UI_DATA_PART, type JainaUIMessage } from '@continuum/contracts';

import { optimizerCitationsOf, toJainaChatMessage } from './uiMessageProjection';

type Part = Record<string, unknown>;

const uiMessage = (parts: Part[]): JainaUIMessage =>
  ({ id: 'msg_cite', role: 'assistant', parts }) as unknown as JainaUIMessage;

const citationPart = (data: Record<string, unknown>): Part => ({
  type: JAINA_UI_DATA_PART.optimizerCard,
  id: 'run:optimizer-card:1',
  data,
});

const wellFormed = {
  read_id: 'read_2026_09_20',
  candidate_ids: ['dead_tail:acct'],
  size: 'card',
};

describe('a cited card reaches the transcript', () => {
  it('projects the part onto the message, ids and size intact', () => {
    const message = uiMessage([citationPart(wellFormed)]);

    expect(optimizerCitationsOf(message)).toEqual([
      { read_id: 'read_2026_09_20', candidate_ids: ['dead_tail:acct'], size: 'card' },
    ]);
    expect(toJainaChatMessage(message, { isStreaming: false }).optimizerCitations).toHaveLength(1);
  });

  it('keeps every citation in the turn, in the order they were emitted', () => {
    const message = uiMessage([
      citationPart(wellFormed),
      citationPart({ ...wellFormed, candidate_ids: ['budget_drift:acct'], size: 'chip' }),
    ]);

    expect(optimizerCitationsOf(message).map((card) => card.size)).toEqual(['card', 'chip']);
  });

  it('leaves a turn that cited nothing without the field at all', () => {
    expect(
      toJainaChatMessage(uiMessage([{ type: 'text', text: 'no citation here' }]), {
        isStreaming: false,
      }).optimizerCitations,
    ).toBeUndefined();
  });
});

describe('the digit gate holds at the Frontend boundary too', () => {
  it('drops a part that grew a numeric field', () => {
    // `.strict()` is the whole reason a card cannot carry a figure. A payload that found
    // somewhere to put one must not reach a renderer that would draw it.
    expect(
      optimizerCitationsOf(uiMessage([citationPart({ ...wellFormed, impact_per_day: 102 })])),
    ).toEqual([]);
  });

  it('drops a strip of four', () => {
    expect(
      optimizerCitationsOf(
        uiMessage([
          citationPart({ ...wellFormed, size: 'strip', candidate_ids: ['a', 'b', 'c', 'd'] }),
        ]),
      ),
    ).toEqual([]);
  });

  it('drops a part with no candidate at all', () => {
    expect(
      optimizerCitationsOf(uiMessage([citationPart({ ...wellFormed, candidate_ids: [] })])),
    ).toEqual([]);
  });

  it('drops a size the schema does not know', () => {
    expect(
      optimizerCitationsOf(uiMessage([citationPart({ ...wellFormed, size: 'banner' })])),
    ).toEqual([]);
  });
});

describe('a malformed citation is passed ON, not swallowed', () => {
  it('keeps a strip that names one candidate so the renderer can say so', () => {
    // Dropping it here renders as the emitter having done nothing — the failure mode the
    // Backend's own forwardableEvents.ts documents. `OptimizerCardBlock` names the bug instead.
    expect(
      optimizerCitationsOf(uiMessage([citationPart({ ...wellFormed, size: 'strip' })])),
    ).toEqual([{ read_id: 'read_2026_09_20', candidate_ids: ['dead_tail:acct'], size: 'strip' }]);
  });

  it('keeps a card that names two candidates', () => {
    expect(
      optimizerCitationsOf(
        uiMessage([citationPart({ ...wellFormed, candidate_ids: ['a:1', 'b:2'] })]),
      ),
    ).toHaveLength(1);
  });
});

// An unresolvable citation renders CITATION_CLEARED_NOTE — "this one cleared" — which tells
// the reader the finding was FIXED. When the real cause is an RLS denial or a function that
// is not deployed, that is not a missing answer, it is a wrong one. So the reason has to
// survive the throw rather than collapsing into one sentence.
describe('what a failed cited read says about itself', () => {
  it('names the code, the message and the details it was given', async () => {
    const { fetchCitedReadForTest } = await import('./optimizerCitedRead');
    const failing = {
      rpc: async () => ({
        data: null,
        error: { code: '42501', message: 'permission denied for function', details: 'RLS' },
      }),
    };
    let caught: unknown = null;
    try {
      await fetchCitedReadForTest(failing as never, 'b1', 'act_1');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain('42501');
    expect(message).toContain('permission denied for function');
    expect((caught as Error).cause).toBeTruthy();
  });

  it('refuses a row whose whole shape it cannot read, instead of calling it cleared', async () => {
    const { fetchCitedReadForTest } = await import('./optimizerCitedRead');
    const wrongShape = { rpc: async () => ({ data: { id: 42 }, error: null }) };
    await expect(fetchCitedReadForTest(wrongShape as never, 'b1', 'act_1')).rejects.toThrow();
  });
});
