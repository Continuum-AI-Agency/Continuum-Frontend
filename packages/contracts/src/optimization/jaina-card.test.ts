import { describe, expect, it } from 'bun:test';
import { JAINA_UI_DATA_PART } from '../streaming/jaina-ui';
import { accountDetectorSchema } from './account-strategy';
import {
  CITATION_CLEARED_NOTE,
  citationIsWellFormed,
  jainaCardSizeSchema,
  jainaOptimizerCardSchema,
} from './jaina-card';

const card = (over: Record<string, unknown> = {}) =>
  jainaOptimizerCardSchema.parse({
    read_id: 'read_2026_09_20',
    candidate_ids: ['dead_tail:acct'],
    size: 'card',
    ...over,
  });

describe('a citation carries an id and cannot carry a figure', () => {
  it('has no field a number could travel in', () => {
    const keys = Object.keys(card());
    expect(keys.sort()).toEqual(['candidate_ids', 'read_id', 'size']);
  });

  it('refuses any extra field, so a figure cannot be smuggled alongside', () => {
    // .strict() is the gate. Without it a model could attach `impact_per_day` and a renderer
    // that trusted it would print a number nobody computed.
    expect(() => card({ impact_per_day: 999 })).toThrow();
    expect(() => card({ value: '…' })).toThrow();
  });

  it('pins the citation to a stored read, never to "now"', () => {
    expect(() => jainaOptimizerCardSchema.parse({ candidate_ids: ['x'], size: 'card' })).toThrow();
    expect(() => card({ read_id: '' })).toThrow();
  });
});

describe('a strip means three, and four is not an answer', () => {
  it('accepts one, two or three ids and refuses a fourth', () => {
    expect(card({ candidate_ids: ['dead_tail:1', 'audience_overlap:2', 'new_vs_returning:3'], size: 'strip' }).candidate_ids).toHaveLength(3);
    expect(() => card({ candidate_ids: ['dead_tail:1', 'audience_overlap:2', 'new_vs_returning:3', 'decision_window:4'], size: 'strip' })).toThrow();
    expect(() => card({ candidate_ids: [] })).toThrow();
  });

  it('holds each size to its own count', () => {
    expect(citationIsWellFormed(card({ size: 'strip', candidate_ids: ['dead_tail:1', 'audience_overlap:2', 'new_vs_returning:3'] }))).toBe(
      true,
    );
    expect(citationIsWellFormed(card({ size: 'strip', candidate_ids: ['dead_tail:1'] }))).toBe(false);
    expect(citationIsWellFormed(card({ size: 'card' }))).toBe(true);
    expect(citationIsWellFormed(card({ size: 'card', candidate_ids: ['dead_tail:1', 'audience_overlap:2'] }))).toBe(false);
  });

  it('offers exactly three sizes — more than three cards is the account read, not an answer', () => {
    // `chip` is gone: its whole definition was positional, and the Frontend flattens a
    // message's parts before rendering, so it could never land inside a sentence.
    expect(jainaCardSizeSchema.options).toEqual(['card', 'strip']);
    expect(() => card({ size: 'chip' })).toThrow();
  });
});

describe('the part is declared where both sides import it from', () => {
  it('rides the same stable-id data-part mechanism as every other Jaina block', () => {
    expect(JAINA_UI_DATA_PART.optimizerCard).toBe('data-jaina-optimizer-card');
  });

  it('tells a reader when the run it cites has moved on', () => {
    // A citation that vanishes takes the answer's evidence with it and leaves prose that
    // now looks invented.
    expect(CITATION_CLEARED_NOTE.length).toBeGreaterThan(0);
    expect(CITATION_CLEARED_NOTE).toContain('cleared');
  });
});

// `.strict()` keeps a NUMBER out of every field, and then `candidate_ids` was a free string
// that the renderer splits on ':' and prints. A figure smuggled into the printed half rode
// the wire intact and rendered on screen under a sentence claiming it came from the stored
// read — which is the one thing a figure-free payload exists to prevent.
describe('the half of an id that gets printed', () => {
  const card = (over: Record<string, unknown>) =>
    jainaOptimizerCardSchema.parse({ read_id: 'r1', candidate_ids: ['dead_tail:acct'], size: 'card', ...over });

  it('refuses prose where a detector belongs', () => {
    expect(() => card({ candidate_ids: ['$4,200/day wasted:acct'] })).toThrow();
    expect(() => card({ candidate_ids: ['CPA is 3.4x target:acct'] })).toThrow();
  });

  it('refuses an id with no detector at all', () => {
    expect(() => card({ candidate_ids: ['acct'] })).toThrow();
    expect(() => card({ candidate_ids: [':acct'] })).toThrow();
  });

  it('still admits a numeric scope, because a Meta object id is one', () => {
    expect(card({ candidate_ids: ['dead_tail:120210000000000'] }).candidate_ids[0]).toContain(
      '120210000000000',
    );
  });

  it('admits every detector in the catalogue', () => {
    for (const detector of accountDetectorSchema.options) {
      expect(card({ candidate_ids: [`${detector}:acct`] }).candidate_ids).toHaveLength(1);
    }
  });
});
