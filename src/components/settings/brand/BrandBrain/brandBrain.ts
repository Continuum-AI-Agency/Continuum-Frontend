import {
  BRAND_BIBLE_SECTIONS,
  type BrandColorToken,
  type BrandFontToken,
  type BrandMdTokens,
  type BrandVoiceToken,
  parseBrandMd,
  serializeBrandMd,
} from '@continuum/contracts';

// The Brand Brain edits brand.md one short slice at a time. A slice is either a
// front-matter token (what getBrandDna lays over every generation prompt) or a line /
// section of the prose body (what the brand-book agent and the readiness scorer read).
// Where both carry the same fact the setter writes both, so the raw document never
// says one thing in YAML and another in prose.

export type BrainDoc = { tokens: BrandMdTokens; body: string };

// Null when the document has no valid front matter — the Brain cannot edit what it
// cannot parse, so the editor falls back to the raw view.
export function readBrainDoc(brandMd: string): BrainDoc | null {
  const { tokens, body } = parseBrandMd(brandMd);
  return tokens ? { tokens, body } : null;
}

export function writeBrainDoc(doc: BrainDoc): string {
  return serializeBrandMd(doc);
}

const SECTION_ORDER = BRAND_BIBLE_SECTIONS.map((section) => section.title);

function titleOf(id: string): string {
  const section = BRAND_BIBLE_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`BRAND_BIBLE_SECTIONS has no "${id}" section`);
  return section.title;
}

export const SECTION_TITLES = {
  positioning: titleOf('positioning'),
  pillars: titleOf('brand_pillars'),
  voice: titleOf('voice'),
  audience: titleOf('audience'),
  promise: titleOf('promise'),
  visual: titleOf('visual_identity'),
} as const;

const isHeading = (line: string) => line.startsWith('## ');

function sectionBounds(lines: string[], heading: string): [number, number] | null {
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && isHeading(line));
  return [start, next === -1 ? lines.length : next];
}

// The text under `heading`, up to the next `## `. The one blank line that separates it
// from the next section is not part of it, so a trailing newline the user typed survives.
export function sectionText(body: string, heading: string): string {
  const lines = body.split('\n');
  const bounds = sectionBounds(lines, heading);
  if (!bounds) return '';
  const [start, end] = bounds;
  const content = lines.slice(start + 1, end);
  if (end < lines.length && content.at(-1) === '') content.pop();
  return content.join('\n');
}

// Replace a section's text; empty text removes the section (the Brand Book omits empty
// sections too). A missing section is inserted in registry order.
export function withSectionText(body: string, heading: string, text: string): string {
  const lines = body.split('\n');
  const bounds = sectionBounds(lines, heading);
  const empty = text.trim().length === 0;
  if (bounds) {
    const [start, end] = bounds;
    const replacement = empty
      ? []
      : [heading, ...text.split('\n'), ...(end < lines.length ? [''] : [])];
    return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join('\n');
  }
  if (empty) return body;
  const rank = SECTION_ORDER.indexOf(heading);
  const before = lines.findIndex(
    (line) => isHeading(line) && SECTION_ORDER.indexOf(line.trimEnd()) > rank,
  );
  if (before === -1) return [...lines, '', heading, ...text.split('\n')].join('\n');
  return [...lines.slice(0, before), heading, ...text.split('\n'), '', ...lines.slice(before)].join(
    '\n',
  );
}

// `Prefix: value` lines inside one section — how the Brand Book writes Tone, Do, Banned
// words and the rest of the Voice section.
function lineValue(section: string, prefix: string): string {
  const line = section.split('\n').find((candidate) => candidate.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function withLineValue(section: string, prefix: string, value: string): string {
  const oneLine = value.replace(/\s*\n\s*/g, ' ').trim();
  const lines = section.length > 0 ? section.split('\n') : [];
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index === -1) return oneLine ? [...lines, `${prefix}${oneLine}`].join('\n') : section;
  if (!oneLine) return lines.filter((_, i) => i !== index).join('\n');
  return lines.map((line, i) => (i === index ? `${prefix}${oneLine}` : line)).join('\n');
}

function withBodyLine(doc: BrainDoc, heading: string, prefix: string, value: string): BrainDoc {
  const section = withLineValue(sectionText(doc.body, heading), prefix, value);
  return { ...doc, body: withSectionText(doc.body, heading, section) };
}

const splitList = (value: string, separator: string) =>
  value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);

export const cleanList = (items: readonly string[]) =>
  items.map((item) => item.trim()).filter(Boolean);

function withVoice(doc: BrainDoc, patch: Partial<BrandVoiceToken>): BrainDoc {
  const voice: BrandVoiceToken = {
    power_verbs: [],
    banned_words: [],
    ...(doc.tokens.voice ?? {}),
    ...patch,
  };
  return { ...doc, tokens: { ...doc.tokens, voice } };
}

const VOICE = SECTION_TITLES.voice;

export type TextSlice = {
  get: (doc: BrainDoc) => string;
  set: (doc: BrainDoc, value: string) => BrainDoc;
};
export type ListSlice = {
  get: (doc: BrainDoc) => string[];
  set: (doc: BrainDoc, items: readonly string[]) => BrainDoc;
};

const proseSection = (heading: string): TextSlice => ({
  get: (doc) => sectionText(doc.body, heading),
  set: (doc, value) => ({ ...doc, body: withSectionText(doc.body, heading, value) }),
});

// `;` separates the items on the line, so one inside an item becomes a comma.
const voiceList = (prefix: string): ListSlice => ({
  get: (doc) => splitList(lineValue(sectionText(doc.body, VOICE), prefix), ';'),
  set: (doc, items) =>
    withBodyLine(
      doc,
      VOICE,
      prefix,
      cleanList(items)
        .map((item) => item.replaceAll(';', ','))
        .join('; '),
    ),
});

const voiceText = (key: 'tone' | 'style', prefix: string): TextSlice => ({
  get: (doc) => doc.tokens.voice?.[key] ?? '',
  set: (doc, value) =>
    withBodyLine(withVoice(doc, { [key]: value.trim() ? value : undefined }), VOICE, prefix, value),
});

export const positioning = proseSection(SECTION_TITLES.positioning);
export const promise = proseSection(SECTION_TITLES.promise);

// One pillar per `- ` bullet.
export const pillars: ListSlice = {
  get: (doc) =>
    sectionText(doc.body, SECTION_TITLES.pillars)
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean),
  set: (doc, items) => ({
    ...doc,
    body: withSectionText(
      doc.body,
      SECTION_TITLES.pillars,
      cleanList(items)
        .map((item) => `- ${item}`)
        .join('\n'),
    ),
  }),
};

export const tone = voiceText('tone', 'Tone: ');
export const style = voiceText('style', 'Style: ');
export const dos = voiceList('Do: ');
export const donts = voiceList("Don't: ");
export const avoidThemes = voiceList('Avoid themes: ');

// The one banned-word list generation enforces (getBrandDna → withBannedWords).
export const bannedWords: ListSlice = {
  get: (doc) => doc.tokens.voice?.banned_words ?? [],
  set: (doc, items) => {
    const words = cleanList(items);
    return withBodyLine(
      withVoice(doc, { banned_words: words }),
      VOICE,
      'Banned words: ',
      words.join(', '),
    );
  },
};

export const audience: TextSlice = {
  get: (doc) =>
    doc.tokens.audience?.primary_summary ?? sectionText(doc.body, SECTION_TITLES.audience),
  set: (doc, value) => ({
    tokens: {
      ...doc.tokens,
      audience: {
        anchors: [],
        ...(doc.tokens.audience ?? {}),
        primary_summary: value.trim() ? value : undefined,
      },
    },
    body: withSectionText(doc.body, SECTION_TITLES.audience, value),
  }),
};

export function withColors(doc: BrainDoc, colors: BrandColorToken[]): BrainDoc {
  const next = { ...doc, tokens: { ...doc.tokens, colors } };
  const palette = colors.map((color) => color.value).join(', ');
  return withBodyLine(next, SECTION_TITLES.visual, 'Palette: ', palette);
}

export function withFonts(doc: BrainDoc, typography: BrandFontToken[]): BrainDoc {
  const next = { ...doc, tokens: { ...doc.tokens, typography } };
  const families = cleanList(typography.map((font) => font.family)).join(' / ');
  return withBodyLine(next, SECTION_TITLES.visual, 'Typography: ', families);
}
