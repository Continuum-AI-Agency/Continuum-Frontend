import { describe, expect, it } from 'bun:test';

import type { DesignSystemSnapshot } from './manifest';
import type { DesignToken } from './tokens';
import {
  designSystemFontFamilies,
  hasAnyBrandShape,
  headlineWeights,
  PRELOADED_TYPE_FACES,
  resolveBrandInk,
  resolveBrandType,
} from './typeResolution';

const embed = (family: string, weight?: number) => ({
  family,
  format: 'ttf' as const,
  base64: 'AAEAAA==',
  ...(weight === undefined ? {} : { weight }),
});

const token = (
  name: string,
  value: string,
  kind: DesignToken['kind'],
  resolvedValue: string | null = value,
): DesignToken => ({ name, value, kind, resolvedValue, definedIn: null, description: null });

const designSystem = (tokens: DesignToken[], fonts: string[] = []): DesignSystemSnapshot => ({
  schemaVersion: 1,
  brandName: 'Test Brand',
  sourceKind: 'ds_export',
  rigor: {
    tier: 'guided',
    evidence: {
      tokenCount: tokens.length,
      imperativeRuleCount: 0,
      hasAdherenceConfig: false,
      declaredSectionCount: 0,
      exemplarCount: 0,
    },
    override: null,
  },
  tokens,
  fonts: fonts.map((family) => ({ family, tokens: [], source: null })),
  adherence: {
    forbidRawHex: false,
    forbidRawPx: false,
    allowedFontFamilies: [],
    spacingScale: [],
    radiusScale: [],
  },
  sections: [],
  conflicts: [],
});

describe('resolveBrandType', () => {
  it('takes the design system first, and says so', () => {
    const resolved = resolveBrandType({
      designSystem: designSystem([token('--font-display', 'Publico, serif', 'font')]),
      brandMd: { colors: [], typography: [{ family: 'Inter', role: 'display' }] },
    });
    expect(resolved).toEqual({ display: 'Publico', body: 'Publico', source: 'design-system' });
  });

  it('falls to brand.md when the design system carries no face', () => {
    expect(
      resolveBrandType({
        designSystem: designSystem([token('--ink', '#0f1f43', 'color')]),
        brandMd: {
          colors: [],
          typography: [
            { family: 'Söhne', role: 'display' },
            { family: 'Tiempos', role: 'body' },
          ],
        },
      }),
    ).toEqual({ display: 'Söhne', body: 'Tiempos', source: 'brand-md' });
  });

  it('falls to the brand kit, mapping primary -> display and secondary -> body', () => {
    expect(
      resolveBrandType({
        brandKit: { typography: { primary: 'Canela', secondary: 'Graphik' } },
      }),
    ).toEqual({ display: 'Canela', body: 'Graphik', source: 'brand-kit' });
  });

  it('falls to the scrape', () => {
    expect(resolveBrandType({ scrape: { typography: { primary: 'Poppins' } } })).toEqual({
      display: 'Poppins',
      body: 'Poppins',
      source: 'scrape',
    });
  });

  it('always answers — a brand with type nowhere gets the preloaded pair, labelled', () => {
    expect(resolveBrandType({})).toEqual({ ...PRELOADED_TYPE_FACES, source: 'fallback' });
    expect(resolveBrandType({ designSystem: designSystem([]), brandKit: {} }).source).toBe(
      'fallback',
    );
  });

  it('steps over a family that cannot be interpolated safely rather than refusing', () => {
    expect(
      resolveBrandType({
        brandMd: { colors: [], typography: [{ family: "Helvetica'; }" }] },
        brandKit: { typography: { primary: 'Canela' } },
      }),
    ).toEqual({ display: 'Canela', body: 'Canela', source: 'brand-kit' });
  });
});

describe('resolveBrandType with bytes resolved (the server lanes)', () => {
  it('walks past a kit face nobody holds bytes for, to the shipped face, and names the skip', () => {
    expect(
      resolveBrandType({ brandKit: { typography: { primary: 'Proxima Nova' } }, fontEmbeds: [] }),
    ).toEqual({
      ...PRELOADED_TYPE_FACES,
      source: 'fallback',
      skipped: [{ source: 'brand-kit', family: 'Proxima Nova' }],
    });
  });

  it('keeps a rung whose face is embedded or shipped', () => {
    expect(
      resolveBrandType({
        brandKit: { typography: { primary: 'Proxima Nova' } },
        scrape: { typography: { primary: 'Poppins', secondary: 'Lora' } },
        fontEmbeds: [embed('Poppins', 700)],
      }),
    ).toEqual({
      display: 'Poppins',
      // The body face has no bytes: it takes the display face rather than Helvetica.
      body: 'Poppins',
      source: 'scrape',
      skipped: [{ source: 'brand-kit', family: 'Proxima Nova' }],
    });
    expect(
      resolveBrandType({ brandMd: { colors: [], typography: [{ family: 'Inter' }] }, fontEmbeds: [] })
        .source,
    ).toBe('brand-md');
  });

  it("reads the brand's own ads as the last brand rung", () => {
    expect(
      resolveBrandType({
        ads: { typography: { primary: 'Oswald', secondary: 'Barlow' } },
        fontEmbeds: [embed('Oswald', 300), embed('Barlow', 400)],
      }),
    ).toEqual({ display: 'Oswald', body: 'Barlow', source: 'ads', skipped: [] });
  });

  it('a declared face wins over the ads; the ads fill only the body it leaves empty', () => {
    // Easy Fit: its brand book declares Montserrat and no secondary face.
    expect(
      resolveBrandType({
        brandMd: { colors: [], typography: [{ family: 'Montserrat', role: 'display' }] },
        ads: { typography: { primary: 'Barlow Condensed', secondary: 'Barlow Condensed' } },
        fontEmbeds: [embed('Barlow Condensed', 300)],
      }),
    ).toEqual({
      display: 'Montserrat',
      body: 'Barlow Condensed',
      source: 'brand-md',
      bodySource: 'ads',
      skipped: [],
    });
    // A rung that names its own body keeps it.
    expect(
      resolveBrandType({
        brandKit: { typography: { primary: 'Inter', secondary: 'Montserrat' } },
        ads: { typography: { primary: 'Oswald', secondary: 'Oswald' } },
        fontEmbeds: [embed('Oswald', 300)],
      }),
    ).toMatchObject({ display: 'Inter', body: 'Montserrat', source: 'brand-kit' });
  });

  it('without resolved bytes the first named face still wins (Studio unchanged)', () => {
    expect(resolveBrandType({ brandKit: { typography: { primary: 'Proxima Nova' } } })).toEqual({
      display: 'Proxima Nova',
      body: 'Proxima Nova',
      source: 'brand-kit',
    });
  });
});

describe('headlineWeights', () => {
  it('defaults to 300/700 and moves each to the nearest weight an embed holds', () => {
    expect(headlineWeights({}, 'Poppins')).toEqual({ light: 300, bold: 700 });
    expect(
      headlineWeights({ fontEmbeds: [embed('Bebas Neue', 400)] }, 'Bebas Neue'),
    ).toEqual({ light: 400, bold: 400 });
    expect(
      headlineWeights({ fontEmbeds: [embed('Oswald', 300), embed('Oswald', 600)] }, 'oswald'),
    ).toEqual({ light: 300, bold: 600 });
  });

  it('a variable embed (no weight) holds every weight', () => {
    expect(headlineWeights({ fontEmbeds: [embed('Inter')] }, 'Inter')).toEqual({
      light: 300,
      bold: 700,
    });
  });
});

describe('designSystemFontFamilies', () => {
  it('prefers a font token over the declared inventory, and takes only the first of a stack', () => {
    expect(
      designSystemFontFamilies(
        designSystem([token('--font-sans', "'Publico', Georgia, serif", 'font')], ['Arial']),
      ),
    ).toEqual(['Publico', 'Arial']);
  });
});

describe('resolveBrandInk', () => {
  const PALETTE = designSystem([
    token('--accent', '#de8218', 'color'),
    token('--ink', '#0f1f43', 'color'),
    token('--bg-1', '#f6f2ea', 'color'),
  ]);

  it('takes the design system default ink by role', () => {
    expect(resolveBrandInk({ designSystem: PALETTE })).toEqual({
      hex: '#0f1f43',
      tokenName: '--ink',
      source: 'design-system',
    });
  });

  it('matches a named token, case- and prefix-insensitively', () => {
    expect(resolveBrandInk({ designSystem: PALETTE }, 'ACCENT')?.hex).toBe('#de8218');
    expect(resolveBrandInk({ designSystem: PALETTE }, '--accent')?.hex).toBe('#de8218');
  });

  it('walks past a design system with no colour to brand.md', () => {
    expect(
      resolveBrandInk({
        designSystem: designSystem([token('--font-sans', 'Publico', 'font')]),
        brandMd: { colors: [{ value: '#123456', role: 'text' }], typography: [] },
      }),
    ).toEqual({ hex: '#123456', tokenName: null, source: 'brand-md' });
  });

  it('reads a kit list and a scrape palette', () => {
    expect(resolveBrandInk({ brandKit: { colors: ['#abcdef'] } })?.source).toBe('brand-kit');
    expect(resolveBrandInk({ scrape: { palette: { text: '#010203' } } })).toEqual({
      hex: '#010203',
      tokenName: null,
      source: 'scrape',
    });
  });

  it('returns null rather than guessing — ink has no fallback rung', () => {
    expect(resolveBrandInk({})).toBeNull();
    expect(resolveBrandInk({ brandKit: { typography: { primary: 'Canela' } } })).toBeNull();
    // A named token nothing carries must not silently become the default ink.
    expect(resolveBrandInk({ designSystem: PALETTE }, 'headline-ink')).toBeNull();
  });

  it('ignores a token whose value never resolved to a literal colour', () => {
    const aliased = designSystem([token('--ink', 'var(--brand-navy)', 'color', null)]);
    expect(resolveBrandInk({ designSystem: aliased }, 'ink')).toBeNull();
  });
});

describe('hasAnyBrandShape', () => {
  it('separates "no colour" from "nothing could be read"', () => {
    expect(hasAnyBrandShape({})).toBe(false);
    expect(hasAnyBrandShape({ brandKit: {} })).toBe(true);
  });
});
