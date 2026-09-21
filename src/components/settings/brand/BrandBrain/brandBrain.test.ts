import { describe, expect, it } from 'bun:test';
import {
  assembleBrandMd,
  type BrandReportResult,
  brandReportResultSchema,
  extractBrandTokens,
  parseBrandMd,
} from '@continuum/contracts';
import { canSaveBrandMd } from '../BrandMdEditor';
import {
  audience,
  avoidThemes,
  type BrainDoc,
  bannedWords,
  dos,
  pillars,
  positioning,
  readBrainDoc,
  SECTION_TITLES,
  sectionText,
  tone,
  withColors,
  withFonts,
  withSectionText,
  writeBrainDoc,
} from './brandBrain';

// A generated brand.md, exactly as the onboarding pipeline assembles one.
const result: BrandReportResult = brandReportResultSchema.parse({
  brand_profile: {
    id: 'brand-mocky',
    brand_name: 'Mocky',
    website_url: 'https://mocky.example',
    brand_voice: { tone: 'confident, not boastful', banned_words: ['leverage'] },
    target_audience: null,
  },
  structured: {
    connected_accounts: [],
    website: {
      website_url: 'https://mocky.example',
      palette: { primary: '#111111', secondary: '#eeeeee', accent: '#22aa55' },
      typography: { primary: 'Inter', secondary: 'Georgia' },
    },
    documents: {},
    target_audience: { summary: 'Ops leaders who own weekly reporting.', segments: [] },
    business: null,
    strategy: {
      positioning: {
        target_customer: 'RevOps leads',
        market_category: 'reporting software',
        key_differentiator: 'a board brief in 10 minutes',
        reason_to_believe: 'deterministic pipeline math',
      },
      personality: { traits: ['plainspoken', 'exact', 'dry'], descriptors: [] },
      promise: { headline: 'Ship the report, not the meeting.' },
      message_pillars: [
        {
          pillar: 'forecast accuracy',
          description: 'CRM truth, board narrative.',
          proof_points: [],
        },
        { pillar: 'operator trust', description: 'Built by ops people.', proof_points: [] },
      ],
      taglines: { primary: 'Monday, handled.', alternates: [] },
    },
    guidelines: {
      voice_rules: { dos: ['Name the segment'], donts: ["Use 'synergy'"] },
      tonal_rules: [],
      messaging_guardrails: {
        required_themes: [],
        avoid_themes: ['AI magic'],
        banned_words: ['leverage'],
        preferred_terms: [],
      },
      content_pillars: [],
    },
  },
  understanding: {
    positioning_thesis: 'For ops leaders, Mocky drafts the board brief in 10 minutes.',
    hypothesis_icp: 'Head of RevOps',
    brand_pillars: ['forecast accuracy'],
    tonal_signal: 'crisp operator confidence',
    notable_evidence: [],
  },
  audits: {},
  readiness: null,
  first_impression: null,
  prompt_version: 1,
  citations: {},
});

const generated = assembleBrandMd({ tokens: extractBrandTokens(result), result });

function fixture(): BrainDoc {
  const doc = readBrainDoc(generated);
  if (!doc) throw new Error('fixture brand.md did not parse');
  return doc;
}

// Save what the editor would save, then read it back the way the Backend does.
function saved(doc: BrainDoc) {
  const markdown = writeBrainDoc(doc);
  expect(canSaveBrandMd(markdown)).toBe(true);
  const parsed = parseBrandMd(markdown);
  if (!parsed.tokens) throw new Error('saved brand.md lost its front matter');
  return { markdown, tokens: parsed.tokens, body: parsed.body };
}

describe('readBrainDoc', () => {
  it('reads a generated brand.md', () => {
    expect(fixture().tokens.brand_name).toBe('Mocky');
  });

  it('refuses a document without usable front matter', () => {
    expect(readBrainDoc('# Prose only')).toBeNull();
    expect(readBrainDoc('---\nschema_version: 2\nbrand_name: X\n---\n# Body')).toBeNull();
  });
});

describe('sections of the body', () => {
  it('reads each generated section by its registry title', () => {
    const doc = fixture();
    expect(positioning.get(doc)).toContain('Mocky drafts the board brief');
    expect(pillars.get(doc)).toEqual([
      'forecast accuracy: CRM truth, board narrative.',
      'operator trust: Built by ops people.',
    ]);
  });

  it('replaces one section and leaves its neighbours byte-identical', () => {
    const doc = fixture();
    const body = withSectionText(doc.body, SECTION_TITLES.positioning, 'For ops, by ops.');
    expect(sectionText(body, SECTION_TITLES.positioning)).toBe('For ops, by ops.');
    for (const heading of [SECTION_TITLES.pillars, SECTION_TITLES.voice, SECTION_TITLES.promise]) {
      expect(sectionText(body, heading)).toBe(sectionText(doc.body, heading));
    }
  });

  it('keeps a trailing newline the user is typing', () => {
    const body = withSectionText(fixture().body, SECTION_TITLES.positioning, 'Line one\n');
    expect(sectionText(body, SECTION_TITLES.positioning)).toBe('Line one\n');
  });

  it('drops an emptied section and re-inserts it in registry order', () => {
    const doc = fixture();
    const without = withSectionText(doc.body, SECTION_TITLES.promise, '');
    expect(without).not.toContain(SECTION_TITLES.promise);
    const back = withSectionText(without, SECTION_TITLES.promise, 'Back again.');
    const order = [SECTION_TITLES.audience, SECTION_TITLES.promise, SECTION_TITLES.visual].map(
      (heading) => back.indexOf(heading),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(sectionText(back, SECTION_TITLES.promise)).toBe('Back again.');
  });

  it('writes pillars as bullets', () => {
    const next = saved(pillars.set(fixture(), ['speed', '', ' trust ']));
    expect(sectionText(next.body, SECTION_TITLES.pillars)).toBe('- speed\n- trust');
  });
});

describe('Never say', () => {
  it('adds a banned word to the token generation reads and to the prose line', () => {
    const doc = fixture();
    const next = saved(bannedWords.set(doc, [...bannedWords.get(doc), 'zzyzx']));
    expect(next.tokens.voice?.banned_words).toEqual(['leverage', 'zzyzx']);
    expect(sectionText(next.body, SECTION_TITLES.voice)).toContain('Banned words: leverage, zzyzx');
  });

  it('removes a word from both places', () => {
    const next = saved(bannedWords.set(fixture(), []));
    expect(next.tokens.voice?.banned_words).toEqual([]);
    expect(sectionText(next.body, SECTION_TITLES.voice)).not.toContain('Banned words:');
  });

  it('edits the avoid-themes line, turning an in-item semicolon into a comma', () => {
    const doc = fixture();
    expect(avoidThemes.get(doc)).toEqual(['AI magic']);
    const next = avoidThemes.set(doc, ['AI magic', 'hype; buzz']);
    expect(avoidThemes.get(next)).toEqual(['AI magic', 'hype, buzz']);
  });
});

describe('voice', () => {
  it('writes tone to the token and the prose line, and clearing it removes both', () => {
    const edited = saved(tone.set(fixture(), 'dry and exact'));
    expect(edited.tokens.voice?.tone).toBe('dry and exact');
    expect(sectionText(edited.body, SECTION_TITLES.voice)).toContain('Tone: dry and exact');

    const cleared = saved(tone.set(fixture(), ''));
    expect(cleared.tokens.voice?.tone).toBeUndefined();
    expect(sectionText(cleared.body, SECTION_TITLES.voice)).not.toContain('Tone:');
    // The banned-word list is untouched by a tone edit.
    expect(cleared.tokens.voice?.banned_words).toEqual(['leverage']);
  });

  it('flattens a multi-line value on the prose line', () => {
    const next = tone.set(fixture(), 'dry\nand exact');
    expect(sectionText(next.body, SECTION_TITLES.voice)).toContain('Tone: dry and exact');
  });

  it('edits the Do line', () => {
    const next = dos.set(fixture(), ['Name the segment', 'Show the number']);
    expect(dos.get(next)).toEqual(['Name the segment', 'Show the number']);
  });
});

describe('audience and visual identity', () => {
  it('writes the audience summary to the token and the section', () => {
    const next = saved(audience.set(fixture(), 'Finance leads.'));
    expect(next.tokens.audience?.primary_summary).toBe('Finance leads.');
    expect(sectionText(next.body, SECTION_TITLES.audience)).toBe('Finance leads.');
  });

  it('writes colors and fonts to the tokens and their prose lines', () => {
    const doc = fixture();
    const colors = withColors(doc, [{ value: '#ff0000', role: 'primary' }]);
    const next = saved(withFonts(colors, [{ family: 'Söhne', role: 'display' }]));
    expect(next.tokens.colors).toEqual([{ value: '#ff0000', role: 'primary' }]);
    expect(next.tokens.typography).toEqual([{ family: 'Söhne', role: 'display' }]);
    const visual = sectionText(next.body, SECTION_TITLES.visual);
    expect(visual).toContain('Palette: #ff0000');
    expect(visual).toContain('Typography: Söhne');
  });
});

describe('round trip', () => {
  it('setting every slice to its own value keeps the tokens', () => {
    let doc = fixture();
    for (const slice of [positioning, tone, audience]) doc = slice.set(doc, slice.get(doc));
    for (const slice of [pillars, dos, avoidThemes, bannedWords])
      doc = slice.set(doc, slice.get(doc));
    expect(saved(doc).tokens).toEqual(fixture().tokens);
  });
});
