import { describe, expect, it } from 'bun:test';
import { type DesignSystemSnapshot, designSystemSnapshotSchema } from './manifest';
import { renderDesignSystemBlock } from './render';

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
