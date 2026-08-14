// Deterministic extraction. No model calls anywhere in this file.
//
// This is the reason design systems are worth treating as a first-class primitive
// rather than as one more document to embed: a `:root` block, a manifest, and a lint
// config are code, and reading code does not require inference. For the CBA export
// that is 84 tokens, 20 cards, the font allowlist, and the adherence rules — the
// overwhelming majority of the payload — recovered exactly, every time, for free.
//
// Only prose (`README.md`) needs a model, and that pass lives elsewhere. Keeping the
// split at a file boundary is deliberate: it makes "what did we KNOW vs what did we
// GUESS" a property of where the code lives, which is what `provenance: 'declared'`
// vs `'inferred'` is claiming downstream.
//
// Isomorphic on purpose (no node: imports, no DOM) so it runs unchanged in the
// backend, in the Deno edge function, and in a Frontend preview.

import { z } from 'zod';
import {
  DESIGN_SECTION_LABELS,
  type DesignRule,
  type DesignSection,
  type DesignSystemSection,
  sectionForSourceGroup,
  sectionForToken,
} from './sections';
import {
  type DesignAdherence,
  type DesignSystemFont,
  type DesignToken,
  type DesignTokenKind,
  EMPTY_ADHERENCE,
  resolveTokens,
} from './tokens';

/* -------------------------------------------------------------------------- */
/*  Source file bag                                                            */
/* -------------------------------------------------------------------------- */

/** An unpacked archive: path (POSIX, archive-relative) → text. Binaries excluded. */
export type DesignSourceFiles = ReadonlyMap<string, string>;

export interface ParsedDesignSystem {
  tokens: DesignToken[];
  fonts: DesignSystemFont[];
  adherence: DesignAdherence;
  sections: DesignSystemSection[];
  /** Archive-relative paths of renderable/binary artifacts worth uploading. */
  exemplarPaths: string[];
  /** Prose files the LLM pass should read, in priority order. */
  prosePaths: string[];
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/*  CSS custom properties                                                      */
/* -------------------------------------------------------------------------- */

// Matches `--name: value;` plus anything trailing on the same line. Values may
// contain parens and commas (rgba(), cubic-bezier(), font stacks), so the terminator
// is the semicolon rather than any structural guess — but the exporter writes its
// `@kind` annotation AFTER the semicolon (`--lh-tight: 1.04;  /* @kind font */`),
// so the trailing remainder is captured too and searched for it.
const DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);([^\n]*)/gi;
// `/* @kind font */` — the Claude exporter's own annotation for values whose kind
// cannot be read off the syntax (a unitless 1.45 is a line-height, not a dimension).
const KIND_ANNOTATION_RE = /\/\*\s*@kind\s+([a-z]+)\s*\*\//i;

/** Kind from the value's own syntax, which is right far more often than a name is. */
export function inferTokenKind(value: string): DesignTokenKind {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return 'color';
  if (/^(rgb|hsl|oklch|lab)a?\(/i.test(trimmed)) return 'color';
  if (/^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch)$/i.test(trimmed)) return 'dimension';
  if (/^-?\d+(\.\d+)?(em|px)$/i.test(trimmed)) return 'dimension';
  if (/^(cubic-bezier|steps|linear)\(/i.test(trimmed)) return 'motion';
  if (/^\d+(\.\d+)?m?s$/i.test(trimmed)) return 'motion';
  // A shadow's signature is two or more leading LENGTHS (offset-x, offset-y, blur,
  // spread) before the colour. Bare `0` counts — `0 1px 0 var(--ink-a10)` is the most
  // common hairline shadow there is, and requiring a unit on every offset misses it.
  // A border (`1px solid …`) has only one leading length, so the two do not collide.
  if (/^(?:-?\d+(?:\.\d+)?(?:px|rem|em)?\s+){2,}/.test(trimmed) || /^none$/i.test(trimmed))
    return 'shadow';
  if (/^\d+(\.\d+)?px\s+(solid|dashed|dotted)/i.test(trimmed)) return 'border';
  if (/,/.test(trimmed) && /['"]?[A-Za-z][A-Za-z0-9 ]*['"]?\s*,/.test(trimmed)) return 'font';
  return 'other';
}

/**
 * Read every custom property declared in a stylesheet.
 *
 * Scans the whole file rather than only `:root` — design systems routinely declare
 * theme overrides under `[data-theme]` or `.dark`, and a `:root`-only reader would
 * silently drop half a themed system. Later declarations win, matching the cascade.
 */
export function parseCssTokens(css: string, definedIn: string): DesignToken[] {
  const byName = new Map<string, DesignToken>();
  for (const match of css.matchAll(DECL_RE)) {
    const name = match[1];
    const raw = match[2];
    const annotated = KIND_ANNOTATION_RE.exec(raw) ?? KIND_ANNOTATION_RE.exec(match[3] ?? '');
    const value = raw.replace(KIND_ANNOTATION_RE, '').trim();
    if (value.length === 0) continue;
    const annotatedKind = annotated
      ? (['color', 'font', 'dimension', 'shadow', 'border', 'motion', 'other'].find(
          (kind) => kind === annotated[1].toLowerCase(),
        ) as DesignTokenKind | undefined)
      : undefined;
    byName.set(name, {
      name,
      value,
      kind: annotatedKind ?? inferTokenKind(value),
      resolvedValue: null,
      definedIn,
      description: null,
    });
  }
  return [...byName.values()];
}

/** Font families named in a stylesheet's own `@import`/`@font-face`, deduped. */
export function parseCssFontSources(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of css.matchAll(/@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const url = match[1];
    for (const family of match[1].matchAll(/family=([^&:]+)/g)) {
      out.set(decodeURIComponent(family[1].replace(/\+/g, ' ')), url);
    }
  }
  for (const match of css.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^;'"}]+)/gi)) {
    out.set(match[1].trim(), 'local @font-face');
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Claude design-system export                                                */
/* -------------------------------------------------------------------------- */

const dsManifestTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  kind: z.string().optional(),
  definedIn: z.string().optional(),
});

const dsManifestCardSchema = z.object({
  path: z.string(),
  group: z.string().optional(),
  name: z.string().optional(),
  subtitle: z.string().optional(),
  viewport: z.string().optional(),
});

const dsManifestSchema = z.object({
  namespace: z.string().optional(),
  tokens: z.array(dsManifestTokenSchema).optional(),
  cards: z.array(dsManifestCardSchema).optional(),
  globalCssPaths: z.array(z.string()).optional(),
  brandFonts: z
    .array(z.object({ family: z.string(), tokens: z.array(z.string()).optional() }))
    .optional(),
});

const adherenceConfigSchema = z.object({
  rules: z.record(z.string(), z.unknown()).optional(),
  'x-omelette': z
    .object({
      tokens: z.array(z.string()).optional(),
      fontFamilies: z.array(z.string()).optional(),
      tokenKinds: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

/**
 * Normalize the adherence lint config.
 *
 * The source encodes its rules as oxlint `no-restricted-syntax` selectors — regexes
 * over AST literals. Rather than carry those verbatim (they are only executable by
 * oxlint, against JSX, which is not what we generate), the meaningful predicates are
 * recognized and re-expressed as booleans this codebase can actually run against
 * generated HTML. Anything unrecognized is dropped rather than half-honoured.
 */
export function parseAdherenceConfig(raw: unknown): DesignAdherence {
  const parsed = adherenceConfigSchema.safeParse(raw);
  if (!parsed.success) return EMPTY_ADHERENCE;
  const serialized = JSON.stringify(parsed.data.rules ?? {});
  const omelette = parsed.data['x-omelette'];
  return {
    forbidRawHex: /Raw hex color|#\[0-9a-fA-F\]/.test(serialized),
    forbidRawPx: /Raw px value|\\\\d\+px/.test(serialized),
    fontAllowlist: omelette?.fontFamilies ?? [],
    tokenAllowlist: omelette?.tokens ?? [],
  };
}

/** `<!-- @dsCard group="…" name="…" subtitle="…" viewport="…" -->` in a preview file. */
export function parseDsCardHeader(html: string): {
  group?: string;
  name?: string;
  subtitle?: string;
  viewport?: string;
} | null {
  const comment = /<!--\s*@dsCard\s+([^>]*?)-->/i.exec(html);
  if (!comment) return null;
  const attrs: Record<string, string> = {};
  for (const match of comment[1].matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

/** YAML-ish frontmatter of a `SKILL.md`. Only the scalar keys we use. */
export function parseSkillFrontmatter(markdown: string): { name?: string; description?: string } {
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!fence) return {};
  const out: Record<string, string> = {};
  for (const line of fence[1].split(/\r?\n/)) {
    const match = /^(\w[\w-]*)\s*:\s*(.+)$/.exec(line.trim());
    if (match) out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const TEXT_EXTENSIONS = /\.(css|json|md|html?|jsx?|tsx?|txt|svg)$/i;
const SKIP_PATHS = /(^|\/)(_ds_bundle\.js|\.thumbnail|\.DS_Store|node_modules\/)/;
const EXEMPLAR_PATHS = /^(preview|ui_kits|slides|assets)\//i;

export const isSkippedDesignPath = (path: string): boolean => SKIP_PATHS.test(path);
export const isDesignTextFile = (path: string): boolean =>
  TEXT_EXTENSIONS.test(path) && !SKIP_PATHS.test(path);

/**
 * Parse an unpacked Claude design-system export.
 *
 * The manifest is preferred for tokens because it carries curated `kind` annotations
 * the raw CSS cannot express, but the CSS is parsed regardless and merged UNDER it:
 * a system can declare tokens the manifest omits (theme blocks especially), and a
 * manifest-only reader would silently lose them. Where both have a token, the
 * manifest wins — it is the exporter's considered view of its own system.
 */
export function parseDesignSystemExport(files: DesignSourceFiles): ParsedDesignSystem {
  const warnings: string[] = [];
  const tokensByName = new Map<string, DesignToken>();

  // --- CSS first, so the manifest can overwrite ---
  const manifestRaw = files.get('_ds_manifest.json');
  const manifest = manifestRaw
    ? dsManifestSchema.safeParse(safeJson(manifestRaw))
    : ({ success: false } as const);

  const cssPaths =
    manifest.success && manifest.data.globalCssPaths?.length
      ? manifest.data.globalCssPaths
      : [...files.keys()].filter((path) => path.endsWith('.css'));

  const fontSources = new Map<string, string>();
  for (const cssPath of cssPaths) {
    const css = files.get(cssPath);
    if (!css) {
      warnings.push(`Stylesheet ${cssPath} is listed in the manifest but absent from the archive.`);
      continue;
    }
    for (const token of parseCssTokens(css, cssPath)) tokensByName.set(token.name, token);
    for (const [family, url] of parseCssFontSources(css)) fontSources.set(family, url);
  }

  // --- Manifest tokens win ---
  if (manifest.success) {
    for (const token of manifest.data.tokens ?? []) {
      const existing = tokensByName.get(token.name);
      const kind =
        normalizeManifestKind(token.kind) ?? existing?.kind ?? inferTokenKind(token.value);
      tokensByName.set(token.name, {
        name: token.name,
        value: token.value,
        kind,
        resolvedValue: null,
        definedIn: token.definedIn ?? existing?.definedIn ?? null,
        description: existing?.description ?? null,
      });
    }
  } else if (!manifestRaw) {
    warnings.push('No _ds_manifest.json — tokens were read from stylesheets only.');
  } else {
    warnings.push('_ds_manifest.json was present but unreadable; fell back to stylesheets.');
  }

  const tokens = resolveTokens([...tokensByName.values()]);

  // --- Adherence ---
  const adherenceRaw = files.get('_adherence.oxlintrc.json');
  const adherence = adherenceRaw ? parseAdherenceConfig(safeJson(adherenceRaw)) : EMPTY_ADHERENCE;

  // --- Fonts ---
  const declaredFonts = new Map<string, DesignSystemFont>();
  for (const font of manifest.success ? (manifest.data.brandFonts ?? []) : []) {
    declaredFonts.set(font.family, {
      family: font.family,
      tokens: font.tokens ?? [],
      source: fontSources.get(font.family) ?? null,
    });
  }
  for (const [family, url] of fontSources) {
    if (!declaredFonts.has(family)) {
      declaredFonts.set(family, { family, tokens: [], source: url });
    }
  }
  // The allowlist is the strongest statement about which families are permitted, so
  // a family named there but nowhere else is still a real font, not an omission.
  for (const family of adherence.fontAllowlist) {
    if (!declaredFonts.has(family)) {
      declaredFonts.set(family, { family, tokens: [], source: fontSources.get(family) ?? null });
    }
  }

  // --- Cards → exemplars, grouped onto sections ---
  const exemplarsBySection = new Map<DesignSection, DesignSystemSection['exemplars']>();
  const cards = manifest.success ? (manifest.data.cards ?? []) : [];
  const seenCardPaths = new Set<string>();
  for (const card of cards) {
    seenCardPaths.add(card.path);
    const header = parseDsCardHeader(files.get(card.path) ?? '');
    const group = card.group ?? header?.group ?? '';
    const section = sectionForSourceGroup(group) ?? 'components';
    const list = exemplarsBySection.get(section) ?? [];
    list.push({
      name: card.name ?? header?.name ?? card.path,
      path: card.path,
      mediaType: card.path.endsWith('.html') ? 'text/html' : 'application/octet-stream',
      kind: kindForCardPath(card.path),
      channel: channelForPath(card.path),
      viewport: card.viewport ?? header?.viewport ?? null,
      subtitle: card.subtitle ?? header?.subtitle ?? null,
      sha256: null,
    });
    exemplarsBySection.set(section, list);
  }

  // Renderable files the manifest did not list still ship — an export whose manifest
  // lags its folder is common, and dropping those would silently lose UI kits.
  const exemplarPaths = [...files.keys()].filter(
    (path) => EXEMPLAR_PATHS.test(path) && !isSkippedDesignPath(path),
  );
  for (const path of exemplarPaths) {
    if (seenCardPaths.has(path) || !/\.html?$/i.test(path)) continue;
    const header = parseDsCardHeader(files.get(path) ?? '');
    const section = sectionForSourceGroup(header?.group ?? '') ?? 'components';
    const list = exemplarsBySection.get(section) ?? [];
    list.push({
      name: header?.name ?? path,
      path,
      mediaType: 'text/html',
      kind: kindForCardPath(path),
      channel: channelForPath(path),
      viewport: header?.viewport ?? null,
      subtitle: header?.subtitle ?? null,
      sha256: null,
    });
    exemplarsBySection.set(section, list);
  }

  const sections = buildDeterministicSections({ tokens, adherence, exemplarsBySection });

  if (tokens.length === 0) {
    warnings.push('No design tokens were found — this archive may not be a design system.');
  }

  const prosePaths = ['README.md', 'SKILL.md'].filter((path) => files.has(path));
  for (const path of files.keys()) {
    if (/\/README\.md$/i.test(path) && !prosePaths.includes(path)) prosePaths.push(path);
  }

  return {
    tokens,
    fonts: [...declaredFonts.values()],
    adherence,
    sections,
    exemplarPaths,
    prosePaths,
    warnings,
  };
}

/**
 * Build the sections a set of tokens justifies.
 *
 * Only sections with actual evidence are emitted. An empty `motion` card on a system
 * that never mentioned motion is worse than no card: it invites someone to switch on
 * enforcement of nothing, and it inflates the token-count-adjacent signals the rigor
 * tier reads. Prose extraction adds the rest later, and marks them `inferred`.
 *
 * Exported because tokens do not only arrive from the export parse. A DTCG file and a
 * brand guideline both produce their tokens AFTER this function has already run over an
 * empty set, and a system carrying tokens but no sections renders an empty block —
 * `renderDesignSystemBlock` returns early on zero sections — so it is stored and
 * reaches no generator at all. Those callers rebuild with `provenance: 'inferred'`,
 * which is the honest label for a value read out of a page rather than out of code.
 */
export function buildTokenSections(args: {
  tokens: readonly DesignToken[];
  adherence: DesignAdherence;
  exemplarsBySection?: ReadonlyMap<DesignSection, DesignSystemSection['exemplars']>;
  provenance?: DesignSystemSection['provenance'];
  confidence?: number;
}): DesignSystemSection[] {
  return buildDeterministicSections({
    tokens: args.tokens,
    adherence: args.adherence,
    exemplarsBySection: args.exemplarsBySection ?? new Map(),
    provenance: args.provenance ?? 'declared',
    confidence: args.confidence ?? 1,
  });
}

function buildDeterministicSections(args: {
  tokens: readonly DesignToken[];
  adherence: DesignAdherence;
  exemplarsBySection: ReadonlyMap<DesignSection, DesignSystemSection['exemplars']>;
  provenance?: DesignSystemSection['provenance'];
  confidence?: number;
}): DesignSystemSection[] {
  const bySection = new Map<DesignSection, DesignToken[]>();
  for (const token of args.tokens) {
    const section = sectionForToken(token);
    const list = bySection.get(section) ?? [];
    list.push(token);
    bySection.set(section, list);
  }

  const sections: DesignSystemSection[] = [];
  const touched = new Set<DesignSection>([...bySection.keys(), ...args.exemplarsBySection.keys()]);

  for (const section of touched) {
    const sectionTokens = bySection.get(section) ?? [];
    const exemplars = args.exemplarsBySection.get(section) ?? [];
    if (sectionTokens.length === 0 && exemplars.length === 0) continue;

    sections.push({
      section,
      title: DESIGN_SECTION_LABELS[section],
      summary: summarizeTokens(section, sectionTokens, exemplars.length),
      content: { tokens: sectionTokens.map((token) => token.name) },
      rules: deterministicRules(section, sectionTokens, args.adherence),
      exemplars,
      // Every value here came out of a manifest, a stylesheet, or a lint config —
      // unless the caller says otherwise, which is how a guideline's observed palette
      // gets sections without claiming to have been declared in code.
      provenance: args.provenance ?? 'declared',
      confidence: args.confidence ?? 1,
      enabled: true,
      editedAt: null,
    });
  }
  return sections.sort((left, right) => left.section.localeCompare(right.section));
}

function summarizeTokens(
  section: DesignSection,
  tokens: readonly DesignToken[],
  exemplarCount: number,
): string {
  const parts: string[] = [];
  if (tokens.length > 0) parts.push(`${tokens.length} ${section} tokens`);
  if (exemplarCount > 0)
    parts.push(`${exemplarCount} reference ${exemplarCount === 1 ? 'piece' : 'pieces'}`);
  return parts.join(', ');
}

/**
 * Rules a machine can state without reading prose.
 *
 * Kept narrow on purpose. These are restatements of the lint config, which is the one
 * place the system already committed to a constraint in executable form; inferring
 * "the brand avoids shadows" from a short shadow scale would be a guess wearing the
 * `declared` label.
 */
function deterministicRules(
  section: DesignSection,
  tokens: readonly DesignToken[],
  adherence: DesignAdherence,
): DesignRule[] {
  const rules: DesignRule[] = [];
  if (section === 'palette' && adherence.forbidRawHex && tokens.length > 0) {
    rules.push({
      statement:
        'Use only the declared palette tokens. A raw hex outside the token set is a violation of this system.',
      strength: 'hard',
      target: null,
      value: null,
      sourceRef: '_adherence.oxlintrc.json',
    });
  }
  if (section === 'spacing' && adherence.forbidRawPx && tokens.length > 0) {
    rules.push({
      statement:
        'Use only the declared spacing scale. A raw px value outside the scale is a violation of this system.',
      strength: 'hard',
      target: null,
      value: null,
      sourceRef: '_adherence.oxlintrc.json',
    });
  }
  if (section === 'typography' && adherence.fontAllowlist.length > 0) {
    rules.push({
      statement: `Set type only in ${adherence.fontAllowlist.join(' or ')}. No other family is part of this system.`,
      strength: 'hard',
      target: null,
      value: adherence.fontAllowlist[0],
      sourceRef: '_adherence.oxlintrc.json',
    });
  }
  return rules;
}

/* -------------------------------------------------------------------------- */
/*  DTCG                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Read a W3C design-tokens file — the inverse of `renderDtcgTokens` in
 * onboarding/brand-system.ts, which is what closes the export→import round trip.
 *
 * Walks the tree generically rather than expecting the `brand.color.*` layout we
 * happen to emit, because the whole point of supporting DTCG is ingesting files
 * Figma and Style Dictionary produced, and those nest however the author chose.
 */
export function parseDtcgTokens(raw: unknown, definedIn = 'tokens.tokens.json'): DesignToken[] {
  const out: DesignToken[] = [];
  const walk = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if ('$value' in record) {
      const value = stringifyDtcgValue(record.$value);
      if (value) {
        out.push({
          name: path.join('-'),
          value,
          kind: dtcgKind(typeof record.$type === 'string' ? record.$type : undefined, value),
          resolvedValue: null,
          definedIn,
          description: typeof record.$description === 'string' ? record.$description : null,
        });
      }
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith('$')) continue;
      walk(child, [...path, key]);
    }
  };
  walk(raw, []);
  return resolveTokens(out);
}

function stringifyDtcgValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.filter((part) => typeof part === 'string').join(', ');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // DTCG colours carry both a components array and, usually, a hex. The hex is what
    // every consumer here wants, so prefer it and only compose from components if absent.
    if (typeof record.hex === 'string') return record.hex;
    if (Array.isArray(record.components)) {
      const parts = record.components.filter((part): part is number => typeof part === 'number');
      if (parts.length >= 3) {
        const hex = parts
          .slice(0, 3)
          .map((part) =>
            Math.round(Math.max(0, Math.min(1, part)) * 255)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
        return `#${hex}`;
      }
    }
  }
  return null;
}

function dtcgKind(type: string | undefined, value: string): DesignTokenKind {
  switch (type) {
    case 'color':
      return 'color';
    case 'fontFamily':
      return 'font';
    case 'dimension':
      return 'dimension';
    case 'shadow':
      return 'shadow';
    case 'border':
      return 'border';
    case 'duration':
    case 'cubicBezier':
      return 'motion';
    default:
      return inferTokenKind(value);
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeManifestKind(kind: string | undefined): DesignTokenKind | null {
  switch (kind) {
    case 'color':
      return 'color';
    case 'font':
      return 'font';
    case 'spacing':
    case 'dimension':
      return 'dimension';
    case 'shadow':
      return 'shadow';
    case 'border':
      return 'border';
    case 'motion':
      return 'motion';
    case 'other':
      return 'other';
    default:
      return null;
  }
}

function kindForCardPath(path: string): DesignSystemSection['exemplars'][number]['kind'] {
  if (path.startsWith('preview/')) return 'preview_card';
  if (path.startsWith('ui_kits/')) return 'ui_kit';
  if (path.startsWith('slides/')) return 'slide';
  if (path.startsWith('assets/')) return 'asset';
  return 'preview_card';
}

/** `ui_kits/linkedin/index.html` → `linkedin`. Null for non-channel artifacts. */
function channelForPath(path: string): string | null {
  const match = /^ui_kits\/([^/]+)\//i.exec(path);
  return match ? match[1] : null;
}
