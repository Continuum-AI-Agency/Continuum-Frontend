import { describe, expect, it } from 'bun:test';
import { type DesignSystemSnapshot, designSystemSnapshotSchema } from './manifest';
import {
  type DesignSystemFontEmbed,
  renderDesignSystemBlock,
  renderDesignSystemStylesheet,
} from './render';

const snapshot = (over: Partial<DesignSystemSnapshot> = {}): DesignSystemSnapshot =>
  designSystemSnapshotSchema.parse({
    brandName: 'CBA Board',
    sourceKind: 'ds_export',
    rigor: {
      tier: 'guided',
      evidence: {
        tokenCount: 20,
        imperativeRuleCount: 5,
        hasAdherenceConfig: false,
        declaredSectionCount: 2,
        exemplarCount: 0,
      },
      override: null,
    },
    tokens: [
      { name: '--accent', value: '#FFAA1C', kind: 'color', resolvedValue: '#FFAA1C' },
      { name: '--ink', value: '#231F20', kind: 'color', resolvedValue: '#231F20' },
    ],
    fonts: [{ family: 'Poppins' }],
    adherence: { forbidRawHex: true, forbidRawPx: false, fontAllowlist: ['Poppins'] },
    sections: [
      {
        section: 'palette',
        title: 'Palette',
        rules: [{ statement: 'Nunca gradientes.', strength: 'hard' }],
      },
      {
        section: 'typography',
        title: 'Typography',
        rules: [{ statement: 'Titulares siempre en Poppins.', strength: 'preferred' }],
      },
      {
        section: 'radii',
        title: 'Radii',
        rules: [{ statement: 'Radios pequeños o cero.', strength: 'hard' }],
      },
    ],
    ...over,
  });

describe('renderDesignSystemBlock', () => {
  it('states the palette and typefaces when nothing else will', () => {
    const { block } = renderDesignSystemBlock(snapshot());

    expect(block).toContain('Palette (use ONLY these): --accent (#FFAA1C), --ink (#231F20)');
    expect(block).toContain('Typefaces: Poppins.');
  });

  it('drops the token lines when a brand book already carries them', () => {
    const { block } = renderDesignSystemBlock(snapshot(), undefined, {
      brandBlockCarriesTokens: true,
    });

    // The whole point: `brand_tokens` is written from this system at ingest, so the
    // brand book is already saying this. Two "use ONLY these" at two scopes is an
    // instruction a model cannot satisfy.
    expect(block).not.toContain('use ONLY these');
    expect(block).not.toContain('#FFAA1C');
    expect(block).not.toContain('Typefaces:');
  });

  it('keeps every RULE when the token lines are dropped — that is what it adds', () => {
    const { block, renderedSections } = renderDesignSystemBlock(snapshot(), undefined, {
      brandBlockCarriesTokens: true,
    });

    expect(block).toContain('- MUST: Nunca gradientes.');
    expect(block).toContain('- Prefer: Titulares siempre en Poppins.');
    expect(block).toContain('- MUST: Radios pequeños o cero.');
    expect(renderedSections).toEqual(['palette', 'typography', 'radii']);
  });

  it('omits a section that had nothing but its token line', () => {
    const bare = designSystemSnapshotSchema.parse({
      ...snapshot(),
      sections: [{ section: 'palette', title: 'Palette', rules: [] }],
    });

    expect(renderDesignSystemBlock(bare).block).toContain('use ONLY these');
    expect(renderDesignSystemBlock(bare, undefined, { brandBlockCarriesTokens: true }).block).toBe(
      '',
    );
  });

  it('defaults to the whole block, so a caller that has not thought about it loses nothing', () => {
    expect(renderDesignSystemBlock(snapshot(), undefined, {}).block).toBe(
      renderDesignSystemBlock(snapshot()).block,
    );
  });

  it('still returns nothing for an empty selection', () => {
    expect(renderDesignSystemBlock(snapshot(), [], { brandBlockCarriesTokens: true }).block).toBe(
      '',
    );
  });

  it('compiles one requested section without leaking another section’s tokens or rules', () => {
    const typography = renderDesignSystemBlock(snapshot(), ['typography']);
    expect(typography.renderedSections).toEqual(['typography']);
    expect(typography.block).toContain('Typefaces: Poppins.');
    expect(typography.block).not.toContain('Palette');
    expect(typography.block).not.toContain('#FFAA1C');
    expect(typography.block).not.toContain('Radios pequeños');

    const palette = renderDesignSystemBlock(snapshot(), ['palette']);
    expect(palette.renderedSections).toEqual(['palette']);
    expect(palette.block).toContain('#FFAA1C');
    expect(palette.block).not.toContain('Typefaces:');
    expect(palette.block).not.toContain('Titulares siempre');
  });
});

describe('renderDesignSystemStylesheet', () => {
  const font = (family: string, source: string | null = null) => ({ family, tokens: [], source });
  const poppins: DesignSystemFontEmbed = {
    family: 'Poppins',
    weight: 600,
    format: 'woff2',
    base64: 'd09GMgABAAAAAA',
  };

  it('embeds a @font-face per entry, with the format hint the type calls for', () => {
    const css = renderDesignSystemStylesheet(
      snapshot({ fonts: [font('Poppins'), font('Georgia')] }),
      {
        includeFontImport: false,
        embedFonts: [
          poppins,
          { family: 'Georgia', style: 'italic', format: 'otf', base64: 'T1RUTwAKAIAAAw' },
        ],
      },
    );

    expect(css).toContain("font-family: 'Poppins';");
    expect(css).toContain('font-weight: 600;');
    expect(css).toContain("src: url('data:font/woff2;base64,d09GMgABAAAAAA') format('woff2');");
    expect(css).toContain("font-family: 'Georgia';");
    expect(css).toContain('font-style: italic;');
    expect(css).toContain("src: url('data:font/otf;base64,T1RUTwAKAIAAAw') format('opentype');");
    // A data URI is not a fetch, which is the whole reason this works in the sandbox.
    expect(css).toContain('font-display: swap;');
    expect(css.match(/@font-face/g)).toHaveLength(2);
    // The tokens still carry, under their original names.
    expect(css).toContain('  --accent: #FFAA1C;');
  });

  it('maps every format to its own hint', () => {
    const hints = (['woff2', 'woff', 'otf', 'ttf'] as const).map(
      (format) =>
        renderDesignSystemStylesheet(snapshot(), {
          includeFontImport: false,
          embedFonts: [{ family: 'Poppins', format, base64: 'AAAA' }],
        }).match(/format\('([a-z0-9]+)'\)/)?.[1],
    );

    expect(hints).toEqual(['woff2', 'woff', 'opentype', 'truetype']);
  });

  it('suppresses the remote @import for an embedded family and keeps it for the rest', () => {
    const two = snapshot({ fonts: [font('Poppins'), font('Space Grotesk')] });

    const both = renderDesignSystemStylesheet(two, { embedFonts: [poppins] });
    expect(both).toContain('@import url(');
    expect(both).toContain('family=Space+Grotesk');
    expect(both).not.toContain('family=Poppins');

    const all = renderDesignSystemStylesheet(two, {
      embedFonts: [poppins, { family: 'Space Grotesk', format: 'woff2', base64: 'AAAA' }],
    });
    expect(all).not.toContain('@import');
    expect(all.match(/@font-face/g)).toHaveLength(2);
  });

  it('drops a declared Google Fonts URL only once no family still needs it', () => {
    const declared = snapshot({
      fonts: [font('Poppins', 'https://fonts.googleapis.com/css2?family=Poppins')],
    });

    expect(renderDesignSystemStylesheet(declared)).toContain('@import');
    expect(renderDesignSystemStylesheet(declared, { embedFonts: [poppins] })).not.toContain(
      '@import',
    );
  });

  it('is byte-identical to the old output when no fonts are embedded', () => {
    // The existing callers — hyperframes grounding, the DS export — must not move.
    const base = snapshot();
    const oldSandboxed = ':root {\n  --accent: #FFAA1C;\n  --ink: #231F20;\n}';

    expect(renderDesignSystemStylesheet(base, { includeFontImport: false })).toBe(oldSandboxed);
    expect(renderDesignSystemStylesheet(base, { includeFontImport: false, embedFonts: [] })).toBe(
      oldSandboxed,
    );
    expect(renderDesignSystemStylesheet(base)).toBe(
      `@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');\n${oldSandboxed}`,
    );
  });

  it('rejects a payload that could close the declaration instead of emitting it', () => {
    const hostile = [
      "AAAA') format('woff2'); } body { display: none; } @font-face { src: url('",
      'AAAA;background:url(https://evil.example/x)',
      'AA\nAA',
      '',
    ];

    for (const base64 of hostile) {
      const css = renderDesignSystemStylesheet(snapshot(), {
        includeFontImport: false,
        embedFonts: [{ family: 'Poppins', format: 'woff2', base64 }],
      });
      expect(css).not.toContain('@font-face');
      expect(css).toBe(':root {\n  --accent: #FFAA1C;\n  --ink: #231F20;\n}');
    }
  });

  it('rejects a family name carrying CSS delimiters', () => {
    const css = renderDesignSystemStylesheet(snapshot(), {
      includeFontImport: false,
      embedFonts: [
        { family: "Poppins'; } body { display:none } @x{", format: 'woff2', base64: 'AAAA' },
      ],
    });

    expect(css).not.toContain('@font-face');
    expect(css).not.toContain('display:none');
  });

  it('leaves a rejected embed’s family on the remote @import rather than on nothing', () => {
    // A rejected embed is one that does not exist — falling back to the import beats
    // falling back to a system stack, which is the bug this option exists to fix.
    const css = renderDesignSystemStylesheet(snapshot(), {
      embedFonts: [{ family: 'Poppins', format: 'woff2', base64: 'not valid!' }],
    });

    expect(css).toContain('family=Poppins');
    expect(css).not.toContain('@font-face');
  });

  it('returns nothing when there are no tokens to state, embeds or not', () => {
    const bare = designSystemSnapshotSchema.parse({ ...snapshot(), tokens: [] });

    expect(renderDesignSystemStylesheet(bare)).toBe('');
    expect(renderDesignSystemStylesheet(bare, { embedFonts: [poppins] })).toBe('');
  });
});
