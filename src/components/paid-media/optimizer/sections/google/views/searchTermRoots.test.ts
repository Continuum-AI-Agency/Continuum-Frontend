import { describe, expect, it } from 'bun:test';
import { GoogleSignalsReadSchema } from '@continuum/contracts';
import { CARDS, searchTermsFixture } from './__fixtures__/googleViews';
import {
  groupByRoot,
  isPmaxTerm,
  jainaTermsPrompt,
  termKey,
  termsInCards,
  termWords,
} from './searchTermRoots';

const terms =
  GoogleSignalsReadSchema.parse(searchTermsFixture()).signals?.google?.search_terms ?? [];
const [firstTerm] = terms;
if (!firstTerm) throw new Error('fixture');

describe('termWords', () => {
  it('drops accents, punctuation, stopwords and a plural "s"', () => {
    expect(termWords('Clases de Yoga cerca de mí')).toEqual(['clase', 'yoga']);
    expect(termWords('gimnasios en Polanco!')).toEqual(['gimnasio', 'polanco']);
    expect(termWords('fitness class')).toEqual(['fitness', 'class']);
  });
});

describe('groupByRoot', () => {
  it('puts each term under the word most terms share, groups by spend', () => {
    const groups = groupByRoot(terms);
    expect(groups.map((group) => group.root)).toEqual(['gimnasio', 'clase', 'precio']);
    expect(groups[0]?.terms.map((term) => term.term)).toEqual([
      'gimnasio cdmx',
      'gimnasios en polanco',
      'gimnasio 24 horas',
    ]);
    expect(groups[0]?.spend).toBeCloseTo(2250.8);
    expect(groups[1]?.conversions).toBe(1);
  });

  it('keeps a term of stopwords only as its own root, and an empty list empty', () => {
    expect(groupByRoot([{ ...firstTerm, term: 'de la' }]).map((group) => group.root)).toEqual([
      'de la',
    ]);
    expect(groupByRoot([])).toEqual([]);
  });
});

describe('terms and cards', () => {
  it('marks the terms a pending G05 card already proposes', () => {
    const covered = termsInCards(CARDS);
    expect(covered.get('gimnasio 24 horas')).toBe('negatives');
    expect(covered.get('precio membresia gym')).toBe('promote');
    expect(covered.size).toBe(2);
  });

  it('keys a term by where it was searched, and knows a PMax term', () => {
    expect(termKey(firstTerm)).toBe('111:9001:gimnasio cdmx');
    expect(terms.filter(isPmaxTerm).map((term) => term.term)).toEqual([
      'clases de yoga cerca de mi',
      'precio membresia gym',
    ]);
  });
});

describe('jainaTermsPrompt', () => {
  it('names the terms once each and the window, and counts past 30', () => {
    const window = { since: '2026-09-28', until: '2026-10-27' };
    expect(jainaTermsPrompt(['a', 'b', 'a'], window)).toContain(
      'from 2026-09-28 to 2026-10-27: "a", "b". Which should become negative keywords',
    );
    const many = Array.from({ length: 33 }, (_, i) => `t${i}`);
    expect(jainaTermsPrompt(many, window)).toContain('"t29" and 3 more.');
  });
});
