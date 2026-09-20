import { describe, expect, it } from 'bun:test';
import { JAINA_UI_DATA_PART } from '../streaming/jaina-ui';
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
    expect(card({ candidate_ids: ['a', 'b', 'c'], size: 'strip' }).candidate_ids).toHaveLength(3);
    expect(() => card({ candidate_ids: ['a', 'b', 'c', 'd'], size: 'strip' })).toThrow();
    expect(() => card({ candidate_ids: [] })).toThrow();
  });

  it('holds each size to its own count', () => {
    expect(citationIsWellFormed(card({ size: 'strip', candidate_ids: ['a', 'b', 'c'] }))).toBe(true);
    expect(citationIsWellFormed(card({ size: 'strip', candidate_ids: ['a'] }))).toBe(false);
    expect(citationIsWellFormed(card({ size: 'chip' }))).toBe(true);
    expect(citationIsWellFormed(card({ size: 'card', candidate_ids: ['a', 'b'] }))).toBe(false);
  });

  it('offers exactly three sizes — more than three cards is the account read, not an answer', () => {
    expect(jainaCardSizeSchema.options).toEqual(['chip', 'card', 'strip']);
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
