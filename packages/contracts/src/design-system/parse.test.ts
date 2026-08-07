// Parser tests against the real CBA Board export shape.
//
// The fixtures below are verbatim excerpts from `~/Downloads/CBA Board Design System`
// rather than invented ones, because the whole claim this module makes is "the real
// format parses deterministically" — a fixture I designed to parse would prove only
// that I can write a regex that matches my own string.

import { describe, expect, it } from 'bun:test';
import {
  inferTokenKind,
  parseAdherenceConfig,
  parseCssFontSources,
  parseCssTokens,
  parseDesignSystemExport,
  parseDsCardHeader,
  parseDtcgTokens,
  parseSkillFrontmatter,
} from './parse';
import { computeRigorTier, countImperativeRules } from './rigor';
import { projectSectionsToBrandTokens, sectionForToken } from './sections';
import { literalHexTokens, resolveTokens } from './tokens';

const CBA_CSS = `
:root {
  --bone:        #F8F4EC;   /* primary background, warm paper */
  --ink:         #231F20;
  --cba-orange:      #FFAA1C;
  --accent:      var(--cba-orange);
  --ink-a10:     rgba(35,31,32, 0.08);
  --font-sans:   'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono:   'JetBrains Mono', ui-monospace, monospace;
  --t-h1:        64px;
  --lh-tight:    1.04;   /* @kind font */
  --s-4:    16px;
  --r-pill: 9999px;
  --bd-hair:   1px solid var(--line);
  --shadow-1:  0 1px 0 var(--ink-a10);
  --ease-out:  cubic-bezier(0.22, 0.61, 0.36, 1); /* @kind other */
  --dur-fast:  120ms; /* @kind other */
}
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400&family=JetBrains+Mono:wght@400&display=swap');
`;

describe('parseCssTokens', () => {
  const tokens = parseCssTokens(CBA_CSS, 'colors_and_type.css');
  const byName = new Map(tokens.map((t) => [t.name, t]));

  it('reads every declared custom property', () => {
    expect(tokens.length).toBe(15);
  });

  it('infers kinds from value syntax', () => {
    expect(byName.get('--bone')?.kind).toBe('color');
    expect(byName.get('--ink-a10')?.kind).toBe('color');
    expect(byName.get('--font-sans')?.kind).toBe('font');
    expect(byName.get('--t-h1')?.kind).toBe('dimension');
    expect(byName.get('--r-pill')?.kind).toBe('dimension');
    expect(byName.get('--bd-hair')?.kind).toBe('border');
    expect(byName.get('--shadow-1')?.kind).toBe('shadow');
  });

  it('honours @kind annotations over syntax', () => {
    // 1.04 is syntactically a bare number; the source says it is a font value.
    expect(byName.get('--lh-tight')?.kind).toBe('font');
    // cubic-bezier() would infer as motion; the source annotated it "other".
    expect(byName.get('--ease-out')?.kind).toBe('other');
  });

  it('strips the annotation comment from the stored value', () => {
    expect(byName.get('--lh-tight')?.value).toBe('1.04');
    expect(byName.get('--dur-fast')?.value).toBe('120ms');
  });
});

describe('resolveTokens', () => {
  const resolved = resolveTokens(parseCssTokens(CBA_CSS, 'x.css'));
  const byName = new Map(resolved.map((t) => [t.name, t]));

  it('flattens whole-value var() aliases', () => {
    expect(byName.get('--accent')?.value).toBe('var(--cba-orange)');
    expect(byName.get('--accent')?.resolvedValue).toBe('#FFAA1C');
  });

  it('leaves composite values alone', () => {
    // A border shorthand is not a colour; flattening it would put a hex in a field
    // that means "1px solid <colour>".
    expect(byName.get('--bd-hair')?.resolvedValue).toBe('1px solid var(--line)');
  });

  it('returns null for an alias with no target', () => {
    const orphan = resolveTokens([
      {
        name: '--x',
        value: 'var(--missing)',
        kind: 'color',
        resolvedValue: null,
        definedIn: null,
        description: null,
      },
    ]);
    expect(orphan[0].resolvedValue).toBeNull();
  });

  it('does not loop on a cyclic alias', () => {
    const cyclic = resolveTokens([
      {
        name: '--a',
        value: 'var(--b)',
        kind: 'color',
        resolvedValue: null,
        definedIn: null,
        description: null,
      },
      {
        name: '--b',
        value: 'var(--a)',
        kind: 'color',
        resolvedValue: null,
        definedIn: null,
        description: null,
      },
    ]);
    expect(cyclic[0].resolvedValue).toBeNull();
  });

  it('surfaces aliased colours as literal hexes', () => {
    const hexes = literalHexTokens(resolved).map((t) => t.name);
    expect(hexes).toContain('--accent');
    expect(hexes).toContain('--bone');
    // rgba() is a colour but not a literal hex the palette gate can compare.
    expect(hexes).not.toContain('--ink-a10');
  });
});

describe('parseCssFontSources', () => {
  it('reads families out of a Google Fonts import', () => {
    const families = [...parseCssFontSources(CBA_CSS).keys()];
    expect(families).toContain('Poppins');
    expect(families).toContain('JetBrains Mono');
  });
});

describe('sectionForToken', () => {
  const byName = new Map(parseCssTokens(CBA_CSS, 'x.css').map((t) => [t.name, t]));
  const sectionOf = (name: string) => sectionForToken(byName.get(name)!);

  it('routes by name where name and kind disagree', () => {
    // --t-h1 is a px dimension but it is a type-scale step, and typography is where
    // a person would look for it.
    expect(sectionOf('--t-h1')).toBe('typography');
    expect(sectionOf('--lh-tight')).toBe('typography');
    expect(sectionOf('--s-4')).toBe('spacing');
    expect(sectionOf('--r-pill')).toBe('radii');
    expect(sectionOf('--ease-out')).toBe('motion');
    expect(sectionOf('--dur-fast')).toBe('motion');
  });

  it('falls back to kind', () => {
    expect(sectionOf('--bone')).toBe('palette');
    expect(sectionOf('--font-sans')).toBe('typography');
    expect(sectionOf('--shadow-1')).toBe('shadows');
  });
});

describe('parseDsCardHeader', () => {
  it('reads the @dsCard comment', () => {
    const header = parseDsCardHeader(
      '<!doctype html>\n<!-- @dsCard group="Colors" name="Color · Accent (CBA Orange)" subtitle="Real #FFAA1C from cbaboard.org logo" viewport="720x240" -->\n<html>',
    );
    expect(header).toEqual({
      group: 'Colors',
      name: 'Color · Accent (CBA Orange)',
      subtitle: 'Real #FFAA1C from cbaboard.org logo',
      viewport: '720x240',
    });
  });

  it('returns null when absent', () => {
    expect(parseDsCardHeader('<!doctype html><html></html>')).toBeNull();
  });
});

describe('parseAdherenceConfig', () => {
  const CBA_ADHERENCE = {
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Raw hex color — use a design-system color token via var().',
        },
        {
          selector: 'Literal[value=/\\b\\d+px\\b/]',
          message: 'Raw px value — use a design-system spacing token via var().',
        },
      ],
    },
    'x-omelette': {
      tokens: ['--accent', '--bone', '--ink'],
      fontFamilies: ['JetBrains Mono', 'Poppins'],
    },
  };

  it('recognizes the executable predicates', () => {
    const adherence = parseAdherenceConfig(CBA_ADHERENCE);
    expect(adherence.forbidRawHex).toBe(true);
    expect(adherence.forbidRawPx).toBe(true);
    expect(adherence.fontAllowlist).toEqual(['JetBrains Mono', 'Poppins']);
    expect(adherence.tokenAllowlist).toHaveLength(3);
  });

  it('degrades to empty rather than throwing on junk', () => {
    expect(parseAdherenceConfig(null).forbidRawHex).toBe(false);
    expect(parseAdherenceConfig('nonsense').fontAllowlist).toEqual([]);
  });
});

describe('parseSkillFrontmatter', () => {
  it('reads name and description', () => {
    const meta = parseSkillFrontmatter(
      '---\nname: cba-board-design\ndescription: Use this skill to generate well-branded interfaces.\nuser-invocable: true\n---\n\nRead the README.',
    );
    expect(meta.name).toBe('cba-board-design');
    expect(meta.description).toContain('well-branded');
  });
});

describe('parseDtcgTokens', () => {
  it('round-trips what renderDtcgTokens emits', () => {
    const tokens = parseDtcgTokens({
      $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
      brand: {
        $description: 'CBA brand identity tokens exported by Continuum.',
        color: {
          accent: {
            $type: 'color',
            $description: 'CBA Orange',
            $value: { colorSpace: 'srgb', components: [1, 0.667, 0.11], hex: '#ffaa1c' },
          },
        },
        typeface: { display: { $type: 'fontFamily', $value: 'Poppins' } },
      },
    });
    const byName = new Map(tokens.map((t) => [t.name, t]));
    expect(byName.get('brand-color-accent')?.value).toBe('#ffaa1c');
    expect(byName.get('brand-color-accent')?.kind).toBe('color');
    expect(byName.get('brand-color-accent')?.description).toBe('CBA Orange');
    expect(byName.get('brand-typeface-display')?.kind).toBe('font');
  });

  it('composes a hex from components when no hex is supplied', () => {
    const tokens = parseDtcgTokens({ c: { $type: 'color', $value: { components: [1, 0, 0] } } });
    expect(tokens[0].value).toBe('#ff0000');
  });

  it('walks arbitrary nesting, not just our own layout', () => {
    const tokens = parseDtcgTokens({ a: { b: { c: { $type: 'color', $value: '#123456' } } } });
    expect(tokens[0].name).toBe('a-b-c');
  });
});

describe('parseDesignSystemExport', () => {
  const files = new Map<string, string>([
    ['colors_and_type.css', CBA_CSS],
    [
      '_ds_manifest.json',
      JSON.stringify({
        namespace: 'CBABoardDesignSystem_019e1c',
        globalCssPaths: ['colors_and_type.css'],
        brandFonts: [{ family: 'Poppins', tokens: ['--font-sans'] }],
        tokens: [
          { name: '--t-h1', value: '64px', kind: 'spacing', definedIn: 'colors_and_type.css' },
        ],
        cards: [
          {
            path: 'preview/colors-accent.html',
            group: 'Colors',
            name: 'Color · Accent',
            viewport: '720x240',
          },
          {
            path: 'ui_kits/linkedin/index.html',
            group: 'UI Kit — Linkedin',
            name: 'LinkedIn · Feed',
          },
        ],
      }),
    ],
    [
      '_adherence.oxlintrc.json',
      JSON.stringify({
        rules: {
          'no-restricted-syntax': [
            'warn',
            { message: 'Raw hex color — use a design-system color token via var().' },
          ],
        },
        'x-omelette': { fontFamilies: ['Poppins', 'JetBrains Mono'], tokens: ['--accent'] },
      }),
    ],
    ['preview/colors-accent.html', '<!-- @dsCard group="Colors" name="Color · Accent" -->'],
    [
      'ui_kits/linkedin/index.html',
      '<!-- @dsCard group="UI Kit — Linkedin" name="LinkedIn · Feed" -->',
    ],
    ['ui_kits/email/index.html', '<!-- @dsCard group="UI Kit — Email" name="Mailing" -->'],
    ['README.md', '# CBA Board\n\nNunca usar gradientes.'],
    ['SKILL.md', '---\nname: cba-board-design\n---\n'],
  ]);
  const parsed = parseDesignSystemExport(files);

  it('merges manifest tokens over CSS tokens', () => {
    const h1 = parsed.tokens.find((t) => t.name === '--t-h1');
    // Manifest says "spacing", which normalizes to dimension — and it wins.
    expect(h1?.kind).toBe('dimension');
    expect(h1?.definedIn).toBe('colors_and_type.css');
  });

  it('keeps CSS tokens the manifest omits', () => {
    expect(parsed.tokens.find((t) => t.name === '--bone')).toBeDefined();
    expect(parsed.tokens.length).toBeGreaterThan(1);
  });

  it('collects fonts from manifest, CSS import, and the allowlist', () => {
    const families = parsed.fonts.map((f) => f.family).sort();
    expect(families).toContain('Poppins');
    expect(families).toContain('JetBrains Mono');
  });

  it('parses the adherence config', () => {
    expect(parsed.adherence.forbidRawHex).toBe(true);
    expect(parsed.adherence.fontAllowlist).toContain('Poppins');
  });

  it('groups cards onto semantic sections', () => {
    const palette = parsed.sections.find((s) => s.section === 'palette');
    const components = parsed.sections.find((s) => s.section === 'components');
    expect(palette?.exemplars.map((e) => e.path)).toContain('preview/colors-accent.html');
    expect(components?.exemplars.map((e) => e.path)).toContain('ui_kits/linkedin/index.html');
  });

  it('picks up renderable files the manifest never listed', () => {
    const components = parsed.sections.find((s) => s.section === 'components');
    expect(components?.exemplars.map((e) => e.path)).toContain('ui_kits/email/index.html');
  });

  it('tags ui_kit exemplars with their channel', () => {
    const components = parsed.sections.find((s) => s.section === 'components');
    const linkedin = components?.exemplars.find((e) => e.path.includes('linkedin'));
    expect(linkedin?.channel).toBe('linkedin');
    expect(linkedin?.kind).toBe('ui_kit');
  });

  it('marks deterministic sections as declared with full confidence', () => {
    for (const section of parsed.sections) {
      expect(section.provenance).toBe('declared');
      expect(section.confidence).toBe(1);
    }
  });

  it('restates the lint config as hard rules', () => {
    const palette = parsed.sections.find((s) => s.section === 'palette');
    const typography = parsed.sections.find((s) => s.section === 'typography');
    expect(palette?.rules.some((r) => r.strength === 'hard')).toBe(true);
    expect(typography?.rules[0]?.value).toBe('Poppins');
  });

  it('flags prose files for the LLM pass', () => {
    expect(parsed.prosePaths).toContain('README.md');
    expect(parsed.prosePaths).toContain('SKILL.md');
  });

  it('never emits an empty section', () => {
    for (const section of parsed.sections) {
      expect(
        section.exemplars.length + (section.content.tokens as string[]).length,
      ).toBeGreaterThan(0);
    }
  });

  it('warns rather than throws on a missing manifest', () => {
    const bare = parseDesignSystemExport(new Map([['a.css', ':root{--x:#fff;}']]));
    expect(bare.warnings.some((w) => w.includes('No _ds_manifest.json'))).toBe(true);
    expect(bare.tokens).toHaveLength(1);
  });

  it('warns when nothing token-shaped is present', () => {
    const empty = parseDesignSystemExport(new Map([['notes.md', 'hello']]));
    expect(empty.warnings.some((w) => w.includes('may not be a design system'))).toBe(true);
  });
});

describe('rigor', () => {
  it('counts imperatives in Spanish as well as English', () => {
    // The CBA system is written in Spanish. An English-only matcher would score it
    // `loose` and then apply almost none of it.
    expect(countImperativeRules('Nunca usar gradientes. Siempre sentence case.')).toBe(2);
    expect(countImperativeRules('Never use gradients. Always sentence case.')).toBe(2);
  });

  it('does not match inside longer words', () => {
    expect(countImperativeRules('nevertheless, nosotros')).toBe(0);
  });

  it('requires an adherence config for strict', () => {
    const rich = {
      tokenCount: 84,
      imperativeRuleCount: 23,
      hasAdherenceConfig: false,
      declaredSectionCount: 6,
      exemplarCount: 20,
    };
    expect(computeRigorTier(rich)).toBe('guided');
    expect(computeRigorTier({ ...rich, hasAdherenceConfig: true })).toBe('strict');
  });

  it('reaches guided on either tokens or rules alone', () => {
    const base = { hasAdherenceConfig: false, declaredSectionCount: 0, exemplarCount: 0 };
    expect(computeRigorTier({ ...base, tokenCount: 12, imperativeRuleCount: 0 })).toBe('guided');
    expect(computeRigorTier({ ...base, tokenCount: 0, imperativeRuleCount: 4 })).toBe('guided');
    expect(computeRigorTier({ ...base, tokenCount: 3, imperativeRuleCount: 1 })).toBe('loose');
  });
});

describe('projectSectionsToBrandTokens', () => {
  it('narrows a system down to the primitive every generator already reads', () => {
    const tokens = resolveTokens(parseCssTokens(CBA_CSS, 'x.css'));
    const projected = projectSectionsToBrandTokens({
      brandName: 'CBA Board',
      tokens,
      fontFamilies: ['Poppins', 'JetBrains Mono'],
    });
    expect(projected.brand_name).toBe('CBA Board');
    // Roles come from token names, not source order.
    expect(projected.colors.find((c) => c.role === 'accent')?.value).toBe('#ffaa1c');
    expect(projected.typography[0]).toEqual({ family: 'Poppins', role: 'display' });
    expect(projected.typography[1]).toEqual({ family: 'JetBrains Mono', role: 'body' });
  });

  it('assigns each role at most once', () => {
    const projected = projectSectionsToBrandTokens({
      brandName: 'X',
      tokens: resolveTokens([
        {
          name: '--accent',
          value: '#111111',
          kind: 'color',
          resolvedValue: null,
          definedIn: null,
          description: null,
        },
        {
          name: '--accent-deep',
          value: '#222222',
          kind: 'color',
          resolvedValue: null,
          definedIn: null,
          description: null,
        },
      ]),
      fontFamilies: [],
    });
    expect(projected.colors.filter((c) => c.role === 'accent')).toHaveLength(1);
  });
});

describe('inferTokenKind', () => {
  it('classifies the shapes a real system uses', () => {
    expect(inferTokenKind('#F8F4EC')).toBe('color');
    expect(inferTokenKind('rgba(35,31,32, 0.60)')).toBe('color');
    expect(inferTokenKind('16px')).toBe('dimension');
    expect(inferTokenKind('-0.02em')).toBe('dimension');
    expect(inferTokenKind('240ms')).toBe('motion');
    expect(inferTokenKind('cubic-bezier(0.4, 0, 0.2, 1)')).toBe('motion');
    expect(inferTokenKind('none')).toBe('shadow');
    expect(inferTokenKind('1px solid var(--line)')).toBe('border');
    expect(inferTokenKind("'Poppins', system-ui, sans-serif")).toBe('font');
  });
});
