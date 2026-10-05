import { describe, expect, it } from 'bun:test';
import {
  CONCEPT_GUIDANCE,
  conceptLengthRule,
  HEADLESS_CONCEPTS,
  headlessConcept,
  headlessConceptSchema,
} from './concepts';
import { headlessGrammarSchema } from './index';

describe('the headless concept catalog', () => {
  it('has exactly one valid entry per grammar the contract names', () => {
    for (const concept of HEADLESS_CONCEPTS) headlessConceptSchema.parse(concept);
    expect(HEADLESS_CONCEPTS.map((concept) => concept.id).sort()).toEqual(
      [...headlessGrammarSchema.options].sort(),
    );
    expect(() => headlessConcept('nope' as never)).toThrow('concept_not_found:nope');
  });

  it('refuses a proven concept without an exemplar, and two people without an interviewer beat', () => {
    const base = headlessConcept('offer-direct');
    expect(headlessConceptSchema.safeParse({ ...base, status: 'proven' }).success).toBe(false);
    expect(
      headlessConceptSchema.safeParse({ ...base, casting: { people: 2, interviewer: 'x' } })
        .success,
    ).toBe(false);
    // A standing interviewer belongs only to a two-person concept.
    const standing = '21e72718-ee30-4f60-a493-0d1125d89336';
    expect(
      headlessConceptSchema.safeParse({
        ...base,
        casting: { people: 1, interviewerElementId: standing },
      }).success,
    ).toBe(false);
    const street = headlessConcept('street-interview');
    expect(
      headlessConceptSchema.safeParse({
        ...street,
        casting: { ...street.casting, interviewerElementId: standing },
      }).success,
    ).toBe(true);
    expect(headlessConcept('street-interview').beats[0]!.speaker).toBe('interviewer');
    expect(conceptLengthRule(headlessConcept('car-storytime'))).toBe('12–20 s in 6 beats');
  });

  it('carries every learned rule once, by a distinct id', () => {
    const ids = CONCEPT_GUIDANCE.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'headroom',
        'camera-not-phone',
        'no-printed-props',
        'end-card-after-last-word',
        'prices-in-brand-currency',
        'relaxed-cta',
        'display-word-from-its-line',
        'headline-on-hook',
        'one-person-per-shot',
      ]),
    );
  });
});
