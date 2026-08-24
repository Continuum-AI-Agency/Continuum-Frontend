// Pure text operations behind the `text.*` action ops. No DOM, no canvas, no node
// shape — a string in, a string out — so the runner can call them anywhere and the
// tests need no environment.

/**
 * Escapes every RegExp metacharacter so a user's search term matches literally.
 * Without this, a `find` of `a.c` would match `abc`: the user typed three
 * characters and got a wildcard.
 */
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface FindReplaceConfig {
  readonly find: string;
  readonly replace: string;
  readonly caseSensitive: boolean;
  /** Treat `find` as a RegExp source instead of a literal. */
  readonly regex?: boolean;
  /** Only match at word boundaries. */
  readonly wholeWord?: boolean;
}

/** Replaces every occurrence of `find` with `replace`. */
export function findReplace(input: string, config: FindReplaceConfig): string {
  const { find, replace, caseSensitive, regex = false, wholeWord = false } = config;

  // A global empty-string replace inserts the replacement between every character.
  // Nobody has ever meant that, and an empty `find` is the schema default — so the
  // node would mangle its input the moment it was wired up.
  if (find === '') return input;

  // split/join needs neither escaping nor replacement-pattern handling, so the
  // common path never constructs a RegExp at all.
  if (caseSensitive && !regex && !wholeWord) return input.split(find).join(replace);

  const source = regex ? find : escapeRegExp(find);
  // The non-capturing group keeps `\b` outside an alternation: `\bcat|dog\b` anchors
  // only the first branch, `\b(?:cat|dog)\b` anchors both. `\b` is ASCII-word-based,
  // so "café" and "naïve" break at the accent — a known ceiling, not a bug to chase.
  const pattern = wholeWord ? `\\b(?:${source})\\b` : source;

  let matcher: RegExp;
  try {
    matcher = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch {
    // Stored node config must never brick a run: a half-typed pattern degrades to
    // "no replacement", it does not throw in the middle of a workflow.
    return input;
  }

  // Regex mode hands the replacement string straight to String.replace ON PURPOSE —
  // `$1` back-references are the reason someone reaches for regex mode at all.
  if (regex) return input.replace(matcher, replace);

  // Literal mode is the opposite contract: the replacer FUNCTION is what keeps `$&`,
  // `$1` and `$'` literal. Handing the replacement string straight to String.replace
  // would expand them — the classic footgun that turns a user's "$&" into the match.
  return input.replace(matcher, () => replace);
}

export type SplitTextMode =
  | 'newline'
  | 'comma'
  | 'custom'
  | 'regex'
  | 'paragraph'
  | 'lineCount'
  | 'charCount';

export interface SplitTextConfig {
  readonly mode: SplitTextMode;
  /** The literal separator for `custom`, the pattern source for `regex`. */
  readonly separator?: string;
  /** Whitespace-trim each part. */
  readonly trim?: boolean;
  /** Drop empty parts after trimming. */
  readonly skipEmpty?: boolean;
  /** Chunk size for `lineCount` (lines per part) and `charCount` (chars per part). */
  readonly size?: number;
  /** Cap on the number of parts; the remainder is folded into the LAST part, never dropped. */
  readonly maxParts?: number | null;
}

/**
 * Builds the separator pattern, or null when the config cannot produce a split.
 * Null is a "return the input whole" signal, never an error — see each case.
 */
function splitPattern(mode: SplitTextMode, separator: string | undefined): RegExp | null {
  switch (mode) {
    case 'newline':
      // CRLF and a lone CR are ONE break. Splitting on /\n/ alone leaves a trailing
      // `\r` glued to every part of a Windows paste, which then survives trimming
      // nothing and shows up as a mystery character downstream.
      return /\r\n|\r|\n/g;
    case 'comma':
      return /,/g;
    case 'paragraph':
      return /(?:\r?\n\s*){2,}/g;
    case 'custom':
      // An empty separator would split between every character — the same explosion
      // findReplace's empty-`find` guard refuses, and `separator` defaults to empty.
      return separator ? new RegExp(escapeRegExp(separator), 'g') : null;
    case 'regex':
      try {
        return separator ? new RegExp(separator, 'g') : null;
      } catch {
        // Same doctrine as findReplace: stored node config must never brick a run.
        return null;
      }
    default:
      return null;
  }
}

/**
 * Splits on `pattern` while KEEPING each matched separator, so a `maxParts` fold can
 * restore the tail verbatim. `String.split` throws the separators away, which is why
 * folding a regex split back together is otherwise guesswork.
 */
function splitKeepingSeparators(
  input: string,
  pattern: RegExp,
): { parts: string[]; seps: string[] } {
  const parts: string[] = [];
  const seps: string[] = [];
  let cursor = 0;
  for (const match of input.matchAll(pattern)) {
    const matched = match[0];
    // A zero-width match (`/x*/`) never advances the cursor and would emit one empty
    // part per character. Skipping it is the empty-separator guard, one level down.
    if (matched === '') continue;
    parts.push(input.slice(cursor, match.index));
    seps.push(matched);
    cursor = match.index + matched.length;
  }
  parts.push(input.slice(cursor));
  return { parts, seps };
}

/**
 * Folds every part past `cap` back onto the last kept part, separators included, so
 * the tail is the ORIGINAL substring rather than a re-joined approximation.
 * `String.split(sep, limit)` drops the tail instead — silently losing input is the
 * exact behaviour this exists to avoid.
 *
 * Runs BEFORE trim/skipEmpty: the separators are only meaningful against the raw
 * parts. Trimming may still shave whitespace off the folded tail — that is trim's
 * job, not the cap silently eating text.
 */
function foldTail(parts: string[], seps: string[], cap: number | null | undefined): string[] {
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap < 1) return parts;
  if (parts.length <= cap) return parts;
  const kept = parts.slice(0, cap - 1);
  let tail = parts[cap - 1] ?? '';
  for (let index = cap; index < parts.length; index += 1) {
    tail += (seps[index - 1] ?? '') + parts[index];
  }
  kept.push(tail);
  return kept;
}

const clampSize = (size: number | undefined): number =>
  typeof size === 'number' && Number.isFinite(size) && size >= 1 ? Math.floor(size) : 1;

const chunkJoin = (units: readonly string[], size: number, glue: string): string[] => {
  const out: string[] = [];
  for (let index = 0; index < units.length; index += size) {
    out.push(units.slice(index, index + size).join(glue));
  }
  return out;
};

// A fan-out node with zero branches is a dead run that reports success. One empty
// part is at least a visible, debuggable output.
const atLeastOne = (parts: string[]): string[] => (parts.length > 0 ? parts : ['']);

/** Splits `input` into parts for a downstream fan-out. Always returns at least one part. */
export function splitText(input: string, config: SplitTextConfig): string[] {
  const { mode, separator, size, maxParts } = config;
  const trim = config.trim ?? true;
  const skipEmpty = config.skipEmpty ?? true;

  if (mode === 'lineCount' || mode === 'charCount') {
    const glue = mode === 'lineCount' ? '\n' : '';
    // Code points, not UTF-16 units: slicing a raw string at a fixed width can land
    // between a surrogate pair and hand the next node half an emoji.
    const units = mode === 'lineCount' ? input.split(/\r\n|\r|\n/) : [...input];
    const chunks = chunkJoin(units, clampSize(size), glue);
    const capped = foldTail(
      chunks,
      chunks.map(() => glue),
      maxParts,
    );
    // skipEmpty is deliberately IGNORED for the fixed-width modes: here a part's
    // INDEX is its meaning ("chunk 3 of 5"), so dropping a blank chunk renumbers
    // every part after it. A blank chunk at a fixed offset is a real answer.
    return atLeastOne(trim ? capped.map((part) => part.trim()) : capped);
  }

  const pattern = splitPattern(mode, separator);
  if (!pattern) return [input];

  const { parts, seps } = splitKeepingSeparators(input, pattern);
  let out = foldTail(parts, seps, maxParts);
  if (trim) out = out.map((part) => part.trim());
  if (skipEmpty) out = out.filter((part) => part !== '');
  return atLeastOne(out);
}

export interface ConcatTextConfig {
  /** Placed BETWEEN parts. Default '\n'. */
  readonly separator?: string;
  /** Prepended to the WHOLE result, not to each part. Default ''. */
  readonly prefix?: string;
  /** Appended to the WHOLE result, not to each part. Default ''. */
  readonly suffix?: string;
  /** Trim each part before joining. Default false. */
  readonly trim?: boolean;
  /** Drop empty parts (after trim) before joining. Default true. */
  readonly skipEmpty?: boolean;
}

/**
 * Joins `parts` into one string.
 *
 * `prefix`/`suffix` wrap the WHOLE RESULT — they are not per-part decorations. That
 * ambiguity is the bug worth naming: someone wiring up a bulleted list reaches for
 * `prefix: '- '` and gets one dash on the first line. Per-part decoration belongs in
 * the `separator` (or a map upstream), not here.
 */
export function concatText(parts: readonly string[], config: ConcatTextConfig): string {
  const { separator = '\n', prefix = '', suffix = '' } = config;
  const trim = config.trim ?? false;
  const skipEmpty = config.skipEmpty ?? true;

  let kept = trim ? parts.map((part) => part.trim()) : [...parts];
  if (skipEmpty) kept = kept.filter((part) => part !== '');
  // An empty list still gets its wrapper: the caller asked for a wrapped result, and
  // silently returning '' hides an upstream node that produced nothing.
  return prefix + kept.join(separator) + suffix;
}
