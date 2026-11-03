import { describe, expect, it } from 'bun:test';
import {
  GoogleSignalsReadSchema,
  type PlatformCard,
  PlatformCardSchema,
  termsLensTakeaway,
  termsLensTakeawayQuiet,
} from '@continuum/contracts';
import {
  easyFitTermsRead,
  PINK_COMPETITOR_CARD,
  PINK_COMPETITOR_CARD_ES,
  PINK_INTENT_CARD,
  PINK_INTENT_CARD_ES,
  pinkTermsRead,
  vivoTermsRead,
} from '../../../google/views/__fixtures__/lensReads';
import {
  buildTermsModel,
  mentionsPhrase,
  NO_INTENT_CARD,
  normalizeTerm,
  squarify,
  type TermsModel,
  termListsOf,
  termsOfSelection,
} from './termsModel';

const CARDS_UNREAD = "the Optimizer's cards couldn't be read";
const CARDS = [PINK_INTENT_CARD, PINK_COMPETITOR_CARD].map((card) =>
  PlatformCardSchema.parse(card),
);

function modelOf(raw: unknown, cards: PlatformCard[] | null = []) {
  const read = GoogleSignalsReadSchema.parse(raw);
  return buildTermsModel(read, termListsOf(read.signals?.google?.profile, cards, CARDS_UNREAD));
}

function readModel(model: TermsModel) {
  if (model.kind !== 'read') throw new Error(`expected a read model, got ${model.kind}`);
  return model;
}

const round = (value: number) => Math.round(value * 100) / 100;

describe('the matching the detectors use', () => {
  it('reads terms lower case without accents or punctuation', () => {
    expect(normalizeTerm('Clases de Natación, cerca de MÍ!')).toBe(
      'clases de natacion cerca de mi',
    );
  });

  it('finds a phrase as whole words, or glued when it has five letters or more', () => {
    expect(mentionsPhrase('vivo 47 naciones unidas', 'vivo 47')).toBe(true);
    expect(mentionsPhrase('vivo47 valle real', 'vivo 47')).toBe(true);
    expect(mentionsPhrase('vivosa gym', 'vivo')).toBe(false);
    expect(mentionsPhrase('smart fit precios', 'smart fit')).toBe(true);
    expect(mentionsPhrase('fit gym', '')).toBe(false);
  });
});

describe('buildTermsModel', () => {
  it('Vivo 47: 54% of the term spend buys the brand, the bucket it leads with', () => {
    const model = readModel(modelOf(vivoTermsRead()));
    expect(round(model.total)).toBe(24718.49);
    expect(round(model.buckets.brand.spend)).toBe(13352.96);
    expect(Math.round(model.buckets.brand.share * 100)).toBe(54);
    expect(model.buckets.brand.over).toBe(true);
    expect(model.headline).toBe('brand');
    expect(model.flagged).toEqual(['brand']);
    expect(round(model.buckets.rest.spend)).toBe(11365.53);
    // The profile names no competitor: a known zero, not a missing figure.
    expect(model.buckets.competitor).toMatchObject({ spend: 0, unknown: null, over: false });
    // No intent card: wrong intent says why instead of reading 0.
    expect(model.buckets.wrong_intent.unknown).toBe(NO_INTENT_CARD);
  });

  it('Vivo 47: the brand splits into roots, the smaller one folded into its bucket tile', () => {
    const model = readModel(modelOf(vivoTermsRead()));
    expect(model.buckets.brand.groups.map((group) => group.label)).toEqual(['vivo', 'vivo47']);
    expect(model.tiles.map((tile) => [tile.label, tile.bucket])).toEqual([
      ['vivo', 'brand'],
      ['other', 'rest'],
      ['Brand · 1 more', 'brand'],
    ]);
    const folded = termsOfSelection(model, { bucket: 'brand', groupKey: null, folded: true });
    expect(folded.map((term) => term.term)).toEqual(['vivo47']);
    const brand = termsOfSelection(model, { bucket: 'brand', groupKey: null, folded: false });
    expect(brand.map((term) => term.term)[0]).toBe('vivo 47');
    expect(brand).toHaveLength(5);
  });

  it('Pink: 21% ($805) has no intent to buy and $160 goes to competitors, neither converting', () => {
    const model = readModel(modelOf(pinkTermsRead(), CARDS));
    expect(round(model.buckets.wrong_intent.spend)).toBe(805.29);
    expect(Math.round(model.buckets.wrong_intent.share * 100)).toBe(21);
    expect(model.buckets.wrong_intent.conversions).toBe(0);
    expect(round(model.buckets.competitor.spend)).toBe(160.67);
    expect(model.buckets.competitor.conversions).toBe(0);
    expect(model.buckets.competitor.groups.map((group) => group.label)).toEqual([
      'coursera',
      'udemy',
      'platzi',
    ]);
    expect(model.buckets.wrong_intent.groups.map((group) => group.label)).toEqual([
      'Free and downloads',
      'Students and homework',
      'Generic course browsing',
      'Support and how-to',
      'Jobs and salaries',
    ]);
    expect(model.headline).toBe('wrong_intent');
    expect(model.flagged).toEqual(['wrong_intent', 'competitor']);
    // The brand is known and bought nothing: no brand bucket to flag.
    expect(model.buckets.brand).toMatchObject({ spend: 0, unknown: null, over: false });
  });

  it('Pink with the cards in Spanish (decision 3): the same buckets, the themes as the cards name them', () => {
    const spanish = [PINK_INTENT_CARD_ES, PINK_COMPETITOR_CARD_ES].map((card) =>
      PlatformCardSchema.parse(card),
    );
    const english = readModel(modelOf(pinkTermsRead(), CARDS));
    const model = readModel(modelOf(pinkTermsRead(), spanish));
    for (const bucket of ['brand', 'competitor', 'wrong_intent', 'rest'] as const) {
      expect(model.buckets[bucket].spend).toBe(english.buckets[bucket].spend);
      expect(model.buckets[bucket].conversions).toBe(english.buckets[bucket].conversions);
    }
    expect(model.flagged).toEqual(['wrong_intent', 'competitor']);
    expect(model.buckets.wrong_intent.groups.map((group) => group.label)).toEqual([
      'Gratis y descargas',
      'Estudiantes y tareas',
      'Búsquedas genéricas de cursos',
      'Soporte y tutoriales',
      'Empleos y sueldos',
    ]);
    expect(model.buckets.competitor.groups.map((group) => group.label)).toEqual([
      'coursera',
      'udemy',
      'platzi',
    ]);
  });

  it('Pink without the intent card: the off-intent terms read as rest, and the bucket says why', () => {
    const model = readModel(modelOf(pinkTermsRead(), []));
    expect(model.buckets.wrong_intent).toMatchObject({ spend: 0, unknown: NO_INTENT_CARD });
    expect(round(model.buckets.rest.spend)).toBe(3672.29);
    // The competitor list rides in the profile, so competitors are still told apart.
    expect(round(model.buckets.competitor.spend)).toBe(160.67);
    expect(model.headline).toBe('competitor');
  });

  it("names the cards read that failed, never a zero, when the card list couldn't be read", () => {
    const model = readModel(modelOf(pinkTermsRead(), null));
    expect(model.buckets.wrong_intent.unknown).toBe(CARDS_UNREAD);
  });

  it('Easy Fit: "smart fit" is a competitor search, $248 with no conversion', () => {
    const model = readModel(modelOf(easyFitTermsRead()));
    expect(model.buckets.competitor.spend).toBe(248);
    expect(model.buckets.competitor.conversions).toBe(0);
    expect(model.buckets.competitor.groups.map((group) => group.terms[0]?.term)).toEqual([
      'smart fit',
    ]);
    expect(model.buckets.brand.spend).toBe(2117);
    expect(model.flagged).toEqual(['brand', 'competitor']);
  });

  it('without the profile, brand and competitor say the profile was not read', () => {
    const raw = vivoTermsRead();
    if (raw.signals?.google) delete raw.signals.google.profile;
    const model = readModel(modelOf(raw));
    expect(model.buckets.brand.unknown).toBe("the account profile wasn't read with the terms");
    expect(model.buckets.competitor.unknown).toBe("the account profile wasn't read with the terms");
    expect(model.headline).toBeNull();
    expect(model.buckets.rest.share).toBe(1);
  });

  it('unread and empty reads say what they are', () => {
    expect(modelOf({ ...vivoTermsRead(), signals: null, rejected: ['window: invalid'] })).toEqual({
      kind: 'unread',
      reason: 'The Google read came back incomplete: window: invalid',
    });
    const noTerms = vivoTermsRead();
    if (noTerms.signals?.google) delete noTerms.signals.google.search_terms;
    expect(modelOf(noTerms)).toEqual({
      kind: 'unread',
      reason: 'Search terms were not read for this account',
    });
    const idle = vivoTermsRead();
    for (const term of idle.signals?.google?.search_terms ?? []) term.totals.spend = 0;
    expect(modelOf(idle).kind).toBe('empty');
  });
});

describe('squarify', () => {
  it('fills the box with areas proportional to the values', () => {
    const items = [
      { value: 6 },
      { value: 6 },
      { value: 4 },
      { value: 3 },
      { value: 2 },
      { value: 2 },
      { value: 1 },
    ];
    const rects = squarify(items, 600, 400);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    expect(rects).toHaveLength(items.length);
    for (const rect of rects) {
      expect((rect.w * rect.h) / (600 * 400)).toBeCloseTo(rect.value / total, 6);
      expect(rect.x).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.y).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.x + rect.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(rect.y + rect.h).toBeLessThanOrEqual(400 + 1e-6);
    }
    expect(squarify([{ value: 0 }], 100, 100)).toEqual([]);
  });
});

describe('termsLensTakeaway', () => {
  it("leads with the flagged bucket's share and money, in the account's language", () => {
    expect(
      termsLensTakeaway({ bucket: 'brand', share: '54%', money: '$13,353 MXN', converted: true }),
    ).toBe('La marca se lleva el 54% del gasto en términos ($13,353 MXN).');
    expect(
      termsLensTakeaway(
        { bucket: 'wrong_intent', share: '21%', money: '$805 MXN', converted: false },
        { bucket: 'competitor', share: '4%', money: '$161 MXN', converted: false },
      ),
    ).toBe(
      'El 21% del gasto en términos ($805 MXN) fue a búsquedas sin intención de compra, sin una sola conversión; la competencia, $161 MXN sin conversiones.',
    );
    expect(termsLensTakeawayQuiet('$2,835 MXN')).toContain('De $2,835 MXN en términos');
  });
});
