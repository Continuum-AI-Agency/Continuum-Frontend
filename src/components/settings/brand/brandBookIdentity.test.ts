import { describe, expect, it } from 'bun:test';
import {
  type BrandMdTokens,
  type BrandReportResult,
  brandGuidelinesSchema,
} from '@continuum/contracts';

import {
  resolveColorTokens,
  resolveEditedStrategy,
  resolveFontTokens,
  withEditedGuidelines,
} from './brandBookIdentity';

// Only the website palette/typography path is read at runtime; cast minimal
// fixtures rather than assembling a full composite.
const compositeWith = (palette: unknown, typography: unknown): BrandReportResult =>
  ({ structured: { website: { palette, typography } } }) as unknown as BrandReportResult;

const tokensWith = (colors: unknown[], typography: unknown[]): BrandMdTokens =>
  ({ colors, typography }) as unknown as BrandMdTokens;

describe('resolveColorTokens', () => {
  it('promotes the onboarding-scraped website.palette to color tokens, skipping empty slots', () => {
    const composite = compositeWith(
      {
        primary: '#1a73e8',
        secondary: '#5c6370',
        accent: null,
        background: '#f8f8f6',
        text: '#141413',
      },
      null,
    );
    expect(resolveColorTokens(null, composite)).toEqual([
      { value: '#1a73e8', role: 'primary', name: 'Primary' },
      { value: '#5c6370', role: 'secondary', name: 'Secondary' },
      { value: '#f8f8f6', role: 'background', name: 'Background' },
      { value: '#141413', role: 'text', name: 'Text' },
    ]);
  });

  it('prefers canonical brand_tokens.colors when present (no fallback)', () => {
    const tokens = tokensWith([{ value: '#111111', role: 'primary' }], []);
    const composite = compositeWith({ primary: '#999999' }, null);
    expect(resolveColorTokens(tokens, composite)).toEqual([{ value: '#111111', role: 'primary' }]);
  });

  it('returns [] when neither tokens nor a scraped palette exist', () => {
    expect(resolveColorTokens(null, compositeWith(null, null))).toEqual([]);
    expect(resolveColorTokens(null, null)).toEqual([]);
    expect(resolveColorTokens(tokensWith([], []), compositeWith(null, null))).toEqual([]);
  });

  it('an edit that removed every colour shows none, as agents read it, not the scrape', () => {
    const composite = compositeWith({ primary: '#999999' }, { primary: 'Graphik' });
    const cleared = tokensWith([], []);
    expect(resolveColorTokens(cleared, composite, true)).toEqual([]);
    expect(resolveFontTokens(cleared, composite, true)).toEqual([]);
  });
});

describe('resolveFontTokens', () => {
  it('maps website.typography {primary,secondary} to display + body typefaces', () => {
    const composite = compositeWith(null, { primary: 'Graphik', secondary: 'Georgia' });
    expect(resolveFontTokens(null, composite)).toEqual([
      { family: 'Graphik', role: 'display' },
      { family: 'Georgia', role: 'body' },
    ]);
  });

  it('prefers canonical brand_tokens.typography when present', () => {
    const tokens = tokensWith([], [{ family: 'Inter', role: 'display' }]);
    expect(resolveFontTokens(tokens, compositeWith(null, { primary: 'Georgia' }))).toEqual([
      { family: 'Inter', role: 'display' },
    ]);
  });

  it('returns [] when no typography is available', () => {
    expect(resolveFontTokens(null, compositeWith(null, null))).toEqual([]);
    expect(resolveFontTokens(null, null)).toEqual([]);
  });
});

describe('resolveEditedStrategy', () => {
  const doc = (body: string) => `---\nbrand_name: Acme\n---\n${body}`;

  it('reads the edited positioning and pillars the agents use', () => {
    const md = doc(
      '## Positioning\nAcme sells bikes\nto commuters.\n\n## Brand pillars\n- Speed\n- Care\n',
    );
    expect(resolveEditedStrategy(md, true)).toEqual({
      positioning: 'Acme sells bikes to commuters.',
      pillars: ['Speed', 'Care'],
    });
  });

  it('clears a section the user emptied', () => {
    expect(resolveEditedStrategy(doc('## Positioning\n\n## Brand pillars\n'), true)).toEqual({
      positioning: null,
      pillars: [],
    });
  });

  it('leaves the report in charge of a section the edit does not carry', () => {
    expect(resolveEditedStrategy(doc('## Positioning\nAcme sells bikes.\n'), true)).toEqual({
      positioning: 'Acme sells bikes.',
    });
  });

  it('ignores the generated document and prose that is not a Brand Book', () => {
    expect(resolveEditedStrategy(doc('## Positioning\nAcme.\n'), false)).toEqual({});
    expect(resolveEditedStrategy(null, true)).toEqual({});
    expect(resolveEditedStrategy('Just my own notes.', true)).toEqual({});
  });

  it('reads the edited tone, audience and voice rules from the front matter and Voice section', () => {
    const md = [
      '---',
      'brand_name: Acme',
      'voice:',
      '  tone: warm and plain-spoken',
      'audience:',
      '  primary_summary: Commuters in Cali',
      '---',
      '## Voice',
      'Do: say the price; name the street',
      "Don't: promise speed",
      'Avoid themes: car culture',
      '',
    ].join('\n');
    expect(resolveEditedStrategy(md, true)).toEqual({
      tone: 'warm and plain-spoken',
      audience: 'Commuters in Cali',
      dos: ['say the price', 'name the street'],
      donts: ['promise speed'],
      avoidThemes: ['car culture'],
    });
  });
});

describe('withEditedGuidelines', () => {
  const report = brandGuidelinesSchema.parse({
    voice_rules: { dos: ['old do'], donts: ['old dont'] },
    messaging_guardrails: { avoid_themes: ['old theme'], banned_words: ['synergy'] },
  });

  it('puts the edited lists in place and keeps the rest of the report', () => {
    const out = withEditedGuidelines(report, { dos: ['new do'], avoidThemes: [] });
    expect(out?.voice_rules).toEqual({ dos: ['new do'], donts: ['old dont'] });
    expect(out?.messaging_guardrails.avoid_themes).toEqual([]);
    expect(out?.messaging_guardrails.banned_words).toEqual(['synergy']);
  });

  it('returns the report untouched when the edit carries no rules', () => {
    expect(withEditedGuidelines(report, { positioning: 'x' })).toBe(report);
    expect(withEditedGuidelines(null, {})).toBeNull();
  });

  it('gives an edit that adds rules a card even when the report had none', () => {
    expect(withEditedGuidelines(null, { donts: ['hedge'] })?.voice_rules).toEqual({
      dos: [],
      donts: ['hedge'],
    });
  });
});
