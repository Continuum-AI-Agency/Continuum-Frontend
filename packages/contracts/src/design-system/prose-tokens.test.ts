import { describe, expect, it } from 'bun:test';
import { fontFamiliesFromProseTokens, parseTokensFromProse } from './prose-tokens';

const GUIDELINE = `
Manual de marca — CBA Board

## Paleta
Naranjo CBA — #FFAA1C
Tinta principal: #231F20
Papel hueso #F8F4EC

El naranjo (#FFAA1C) nunca se usa como fondo de una pieza completa.

## Tipografía
Tipografía: Poppins
Font-family: JetBrains Mono
`;

describe('parseTokensFromProse', () => {
  it('reads literal hexes out of prose and names them from their label', () => {
    const tokens = parseTokensFromProse(GUIDELINE, 'manual.pdf');
    const colors = tokens.filter((token) => token.kind === 'color');

    expect(colors.map((token) => token.value)).toEqual(['#FFAA1C', '#231F20', '#F8F4EC']);
    expect(colors[0].name).toBe('--naranjo-cba');
    expect(colors[1].name).toBe('--tinta-principal');
    expect(colors[0].resolvedValue).toBe('#FFAA1C');
    expect(colors[0].definedIn).toBe('manual.pdf');
  });

  it('deduplicates by value, so one colour captioned twice is one token', () => {
    const tokens = parseTokensFromProse(GUIDELINE, 'manual.pdf');
    const orange = tokens.filter((token) => token.value === '#FFAA1C');
    expect(orange).toHaveLength(1);
  });

  it('reads declared font families in either language', () => {
    const tokens = parseTokensFromProse(GUIDELINE, 'manual.pdf');
    expect(fontFamiliesFromProseTokens(tokens)).toEqual(['Poppins', 'JetBrains Mono']);
    expect(tokens.find((token) => token.kind === 'font')?.name).toBe('--font-poppins');
  });

  it('falls back to a positional name when nothing labels the colour', () => {
    const tokens = parseTokensFromProse('#ABCDEF', 'tokens.txt');
    expect(tokens[0].name).toBe('--color-1');
  });

  it('returns nothing for prose that declares nothing', () => {
    expect(parseTokensFromProse('We prefer generous whitespace.', 'x.pdf')).toEqual([]);
  });

  it('caps a deck that repeats hexes on every page', () => {
    const many = Array.from({ length: 200 }, (_, index) => {
      const hex = (0x100000 + index).toString(16).padStart(6, '0');
      return `Swatch ${index} #${hex}`;
    }).join('\n');
    expect(parseTokensFromProse(many, 'deck.pdf')).toHaveLength(60);
  });
});
