import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../../messages/scale/en.json';
import es from '../../../messages/scale/es.json';
import pt from '../../../messages/scale/pt-BR.json';
import { countryList, countryName, localizedNodeOptions } from './nodeOptionPresentation';
import {
  AD_FORMATS,
  AGE_RANGES,
  CALL_TO_ACTIONS,
  DEVICE_PLATFORMS,
  FACEBOOK_POSITIONS,
  INSTAGRAM_POSITIONS,
  LOCATIONS,
  OBJECTIVES,
  OPTIMIZATION_GOALS,
  PUBLISHER_PLATFORMS,
  SPECIAL_CATEGORIES,
} from './nodeOptions';

const sources = [
  AD_FORMATS,
  AGE_RANGES,
  CALL_TO_ACTIONS,
  DEVICE_PLATFORMS,
  FACEBOOK_POSITIONS,
  INSTAGRAM_POSITIONS,
  LOCATIONS,
  OBJECTIVES,
  OPTIMIZATION_GOALS,
  PUBLISHER_PLATFORMS,
  SPECIAL_CATEGORIES,
];

describe('campaign option presentation', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: { scale: messages },
      namespace: 'scale',
    });
    it(`${locale}: localizes views without changing stored values, bounds or creative CTA copy`, () => {
      const before = JSON.stringify(sources);
      const objectives = localizedNodeOptions(OBJECTIVES, t, locale);
      expect(objectives[0].label).toBe(
        { en: 'Awareness', 'pt-BR': 'Reconhecimento', es: 'Reconocimiento' }[locale],
      );
      for (const source of sources) {
        const view = localizedNodeOptions(source, t, locale, source === LOCATIONS);
        expect(view.map(({ label: _, description: __, ...identity }) => identity)).toEqual(
          source.map(({ label: _, description: __, ...identity }) => identity),
        );
      }
      expect(localizedNodeOptions(AGE_RANGES, t, locale)[0]).toMatchObject({
        min: 18,
        max: 24,
        label: '18-24',
      });
      expect(CALL_TO_ACTIONS[0]).toMatchObject({
        value: 'LEARN_MORE',
        label: 'Learn More',
      });
      expect(JSON.stringify(sources)).toBe(before);
      expect(localizedNodeOptions(OBJECTIVES, t, locale)).toBe(objectives);
      expect(Object.isFrozen(objectives)).toBe(true);
    });
  }
  it('uses ISO identities for country names and preserves unknown inputs', () => {
    const codes = ['BR', 'MX'];
    expect(countryName('BR', 'pt-BR')).toBe('Brasil');
    expect(countryName('MX', 'es')).toBe('México');
    expect(countryList(codes, 'es')).toContain('Brasil');
    expect(countryName('ZZ', 'pt-BR')).toBe('ZZ');
    expect(countryName('not-a-code', 'es')).toBe('not-a-code');
    expect(codes).toEqual(['BR', 'MX']);
  });
});
