// Brand-configurable ad-naming taxonomy. A brand declares how it names its ads
// (a delimiter plus an ordered list of field labels, e.g. `|` and
// [funnel, format, audience]); paid-media metric rows then carry a structured
// `parsed_name` so the AI can identify an ad by its named components instead of
// re-parsing a raw string. Everything degrades gracefully: with no schema
// configured, `parsed_name` is simply omitted and the raw name is still
// returned. The canonical store is brand_profiles.ad_naming_schemas.

import { z } from 'zod';

// Stored brand schema — mirror of a brand_profiles.ad_naming_schemas row. The
// `id`/`version` are stamped into every parsed name so a consumer knows which
// schema interpreted it.
export const adNamingSchemaConfigSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  platform: z.enum(['meta', 'google', 'all']),
  delimiter: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1),
  version: z.number().int().positive(),
});
export type AdNamingSchemaConfig = z.infer<typeof adNamingSchemaConfigSchema>;

// Parsed result attached to a metric row. `matched` is true only when the ad
// name split into exactly as many segments as the schema declares fields.
export const parsedAdNameSchema = z.object({
  schema_id: z.string().uuid(),
  schema_version: z.number().int(),
  delimiter: z.string(),
  matched: z.boolean(),
  segments: z.array(z.string()),
  fields: z.record(z.string(), z.string().nullable()),
});
export type ParsedAdName = z.infer<typeof parsedAdNameSchema>;

// Pure, never-throws parser. Splits the raw ad name on the schema delimiter,
// trims each segment, and maps the ordered field labels onto the segments
// (missing segments map to null; extra segments stay visible in `segments` but
// are dropped from the label map).
export function parseAdName(name: string, schema: AdNamingSchemaConfig): ParsedAdName {
  const segments = name.split(schema.delimiter).map((segment) => segment.trim());
  const fields: Record<string, string | null> = {};
  schema.fields.forEach((label, index) => {
    const value = segments[index];
    fields[label] = value === undefined || value.length === 0 ? null : value;
  });
  return {
    schema_id: schema.id,
    schema_version: schema.version,
    delimiter: schema.delimiter,
    matched: segments.length === schema.fields.length,
    segments,
    fields,
  };
}

// ---------------------------------------------------------------------------
// formatAdName — the inverse of parseAdName.
// ---------------------------------------------------------------------------

// Outcome of rendering a set of field values into a schema-conformant ad name.
// `missing` and `sanitized` are reporting channels, in `schema.fields` order, so
// a caller can warn the user rather than silently shipping a degraded name.
export type FormatAdNameResult = {
  name: string;
  /** Schema fields with no usable value; rendered as the placeholder instead. */
  missing: string[];
  /** Schema fields whose value carried delimiter characters that were rewritten. */
  sanitized: string[];
};

const DEFAULT_PLACEHOLDER = 'na';
// Ordered preferences; the first entry that is not itself part of the delimiter
// wins, so a `-` delimiter does not get "escaped" back into a `-`.
const DELIMITER_REPLACEMENT_CANDIDATES = ['-', '_', '.', '~'] as const;
const WHITESPACE_REPLACEMENT_CANDIDATES = ['_', '-', '.', '~'] as const;

const isWhitespace = (char: string): boolean => /\s/.test(char);

// How one value is rewritten into a segment that can survive a round trip.
type SegmentEncoding = {
  isDelimiterChar: (char: string) => boolean;
  delimiterReplacement: string;
  whitespaceReplacement: string;
};

// Collapses each run of matching characters down to a single replacement.
// Iterates code points (not UTF-16 units) so a value never gets torn mid-emoji.
function replaceRuns(
  input: string,
  isTarget: (char: string) => boolean,
  replacement: string,
): { output: string; replaced: boolean } {
  let output = '';
  let replaced = false;
  let insideRun = false;
  for (const char of input) {
    if (isTarget(char)) {
      if (!insideRun) {
        output += replacement;
        insideRun = true;
        replaced = true;
      }
      continue;
    }
    insideRun = false;
    output += char;
  }
  return { output, replaced };
}

// Picks the first candidate that is not part of the delimiter, falling back to a
// sweep of printable ASCII so even an adversarial delimiter yields a safe char.
function pickSafeChar(candidates: readonly string[], delimiterChars: ReadonlySet<string>): string {
  for (const candidate of candidates) {
    if (!delimiterChars.has(candidate)) return candidate;
  }
  for (let code = 0x21; code <= 0x7e; code += 1) {
    const char = String.fromCharCode(code);
    if (!delimiterChars.has(char)) return char;
  }
  return '';
}

// Renders one value as a segment that contains no delimiter character and no
// whitespace — the two things that would make `parseAdName` re-split it wrongly.
function normaliseSegment(
  raw: string,
  encoding: SegmentEncoding,
): { value: string; sanitized: boolean } {
  const withoutDelimiter = replaceRuns(
    raw.trim(),
    encoding.isDelimiterChar,
    encoding.delimiterReplacement,
  );
  const collapsed = replaceRuns(
    withoutDelimiter.output,
    isWhitespace,
    encoding.whitespaceReplacement,
  );
  return { value: collapsed.output, sanitized: withoutDelimiter.replaced };
}

// Pure, never-throws formatter — the inverse of `parseAdName`. Emits one segment
// per schema field, in order, joined by the schema delimiter, such that
// `parseAdName(formatAdName(values, schema).name, schema)` always reports
// `matched: true` and returns the normalised values back.
//
// Two rules do the heavy lifting:
//   1. Every *character* of the delimiter is scrubbed from a value, not just the
//      whole delimiter string. A multi-character delimiter like `::` splits on a
//      value ending in `:` the moment it is joined ("a:" + "::" + "b" contains
//      two `::`), so a lone `:` is as dangerous as the full delimiter.
//   2. No segment is ever empty. An empty segment survives the join but makes
//      `parseAdName`'s `matched`/`fields` ambiguous, so missing values render as
//      the placeholder instead.
export function formatAdName(
  values: Readonly<Record<string, string | null | undefined>>,
  schema: AdNamingSchemaConfig,
  options?: { placeholder?: string },
): FormatAdNameResult {
  const delimiterChars = new Set(schema.delimiter);
  const encoding: SegmentEncoding = {
    isDelimiterChar: (char) => delimiterChars.has(char),
    delimiterReplacement: pickSafeChar(DELIMITER_REPLACEMENT_CANDIDATES, delimiterChars),
    whitespaceReplacement: pickSafeChar(WHITESPACE_REPLACEMENT_CANDIDATES, delimiterChars),
  };

  // Degrade the placeholder the same way a value degrades: caller's choice, then
  // the default, then a single character known to be delimiter-safe.
  const placeholder =
    normaliseSegment(options?.placeholder ?? DEFAULT_PLACEHOLDER, encoding).value ||
    normaliseSegment(DEFAULT_PLACEHOLDER, encoding).value ||
    encoding.delimiterReplacement;

  const missing: string[] = [];
  const sanitized: string[] = [];
  const segments = schema.fields.map((label) => {
    const supplied = values[label];
    const normalised = normaliseSegment(typeof supplied === 'string' ? supplied : '', encoding);
    if (normalised.sanitized) sanitized.push(label);
    if (normalised.value.length === 0) {
      missing.push(label);
      return placeholder;
    }
    return normalised.value;
  });

  return { name: segments.join(schema.delimiter), missing, sanitized };
}
