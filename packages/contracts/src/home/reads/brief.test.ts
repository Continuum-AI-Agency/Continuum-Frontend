import { describe, expect, it } from 'bun:test';
import {
  HOME_BRIEF_BASIS,
  homeBriefCitation,
  homeBriefDataSchema,
  homeBriefLocaleOf,
  homeBriefReadSchema,
} from './brief';

const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

const source = {
  kind: 'brand_profiles.reporting_cache',
  ref: 'act_521903353286118',
  since: '2026-11-01',
  until: '2026-11-02',
};

const goalSentence = {
  id: 'goal' as const,
  text: 'Compras: 16[1] en lo que va del mes.',
  figures: [
    {
      n: 1,
      label: 'Compras en lo que va del mes',
      value: 16,
      unit: 'count' as const,
      currency: null,
      display: '16',
      field: 'purchases',
      source,
    },
  ],
};

const opportunitySentence = {
  id: 'opportunity' as const,
  text: 'La mayor oportunidad: «gym cerca de mí», 9.16 MXN[2] al día recuperables.',
  figures: [
    {
      n: 2,
      label: 'Recuperable por día',
      value: 9.16,
      unit: 'currency' as const,
      currency: 'MXN',
      display: '9.16 MXN',
      field: 'impact_per_day',
      source: {
        kind: 'optimizer.account_daily_reads',
        ref: '5251780631|platform_signal:8c5a8858',
        since: '2026-11-03',
        until: '2026-11-03',
      },
    },
  ],
};

const brief = {
  basis: HOME_BRIEF_BASIS,
  locale: 'es' as const,
  objective: { id: 'purchases', label: 'Compras', metric: 'purchases' as const },
  sentences: [goalSentence, opportunitySentence],
};

describe('homeBriefCitation', () => {
  it('prints the display followed by its bracketed number', () => {
    expect(homeBriefCitation('9.16 MXN', 2)).toBe('9.16 MXN[2]');
  });
});

describe('homeBriefLocaleOf', () => {
  it('defaults to Spanish, the language accounts are run in', () => {
    expect(homeBriefLocaleOf(undefined)).toBe('es');
    expect(homeBriefLocaleOf('fr')).toBe('es');
  });

  it('accepts English', () => {
    expect(homeBriefLocaleOf('en')).toBe('en');
  });
});

describe('homeBriefDataSchema', () => {
  it('accepts a brief whose every figure is cited in its sentence, numbered 1..n', () => {
    expect(homeBriefDataSchema.safeParse(brief).success).toBe(true);
  });

  it('refuses a figure whose display is not printed with its marker', () => {
    const drifted = {
      ...brief,
      sentences: [
        { ...goalSentence, text: 'Compras: 17[1] en lo que va del mes.' },
        opportunitySentence,
      ],
    };
    expect(homeBriefDataSchema.safeParse(drifted).success).toBe(false);
  });

  it('refuses numbering that is not global and consecutive from 1', () => {
    const restarted = {
      ...brief,
      sentences: [
        goalSentence,
        {
          ...opportunitySentence,
          text: 'La mayor oportunidad: «gym cerca de mí», 9.16 MXN[1] al día recuperables.',
          figures: [{ ...opportunitySentence.figures[0], n: 1 }],
        },
      ],
    };
    expect(homeBriefDataSchema.safeParse(restarted).success).toBe(false);
  });

  it('refuses a sentence with no figure: a sentence without an honest figure is omitted', () => {
    const bare = { ...brief, sentences: [{ ...goalSentence, figures: [] }] };
    expect(homeBriefDataSchema.safeParse(bare).success).toBe(false);
  });

  it('refuses a money figure without a currency, and a count figure with one', () => {
    const moneyless = {
      ...brief,
      sentences: [
        goalSentence,
        {
          ...opportunitySentence,
          figures: [{ ...opportunitySentence.figures[0], currency: null }],
        },
      ],
    };
    const countWithCurrency = {
      ...brief,
      sentences: [{ ...goalSentence, figures: [{ ...goalSentence.figures[0], currency: 'MXN' }] }],
    };
    expect(homeBriefDataSchema.safeParse(moneyless).success).toBe(false);
    expect(homeBriefDataSchema.safeParse(countWithCurrency).success).toBe(false);
  });

  it('refuses the same sentence kind twice', () => {
    const second = {
      ...opportunitySentence,
      id: 'goal' as const,
    };
    expect(
      homeBriefDataSchema.safeParse({ ...brief, sentences: [goalSentence, second] }).success,
    ).toBe(false);
  });
});

describe('homeBriefReadSchema', () => {
  it('wraps the brief in the Home read envelope', () => {
    const ready = {
      state: 'ready',
      brandId: BRAND,
      generatedAt: '2026-11-03T20:00:00.000Z',
      data: brief,
    };
    expect(homeBriefReadSchema.safeParse(ready).success).toBe(true);
    const missing = {
      state: 'missing',
      brandId: BRAND,
      generatedAt: '2026-11-03T20:00:00.000Z',
      missing: { reason: 'no_data', detail: 'Nothing stored to brief from.' },
    };
    expect(homeBriefReadSchema.safeParse(missing).success).toBe(true);
  });
});
