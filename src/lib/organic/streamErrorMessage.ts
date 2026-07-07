// The organic generation streams sometimes stringify a ZodError into an
// error.message field; surfacing that raw JSON (e.g. `"path": ["placements", 2,
// "schedule", "scheduledAt"]`) in the UI reads as a broken app. This maps a
// serialized-ZodError-shaped message to a readable line and passes already-human
// messages through unchanged. The ideal fix is a friendly message at the backend
// emit site — this is the owned, testable guard that fixes the visible box now.

type FieldLabel = { test: RegExp; label: string };

// Ordered most-specific first: the first matching path token wins.
const FIELD_LABELS: FieldLabel[] = [
  { test: /scheduledat/i, label: "Couldn't apply the schedule time" },
  { test: /schedule/i, label: "Couldn't apply the schedule" },
  { test: /caption/i, label: "Couldn't apply the caption" },
  { test: /hashtag/i, label: "Couldn't apply the hashtags" },
  { test: /media|asset|storyboard|creative/i, label: "Couldn't apply the media" },
];

const GENERIC = "Some generated fields didn't validate — please retry.";

// A serialized ZodError is a JSON array of issues; every issue carries `path` and
// `message`, and a `code`/`expected`/`invalid_*` marker. Require both a path and a
// zod-specific marker so plain human messages are never rewritten.
function looksLikeZodError(text: string): boolean {
  if (!text.includes('"path"')) return false;
  return (
    text.includes('"code"') ||
    text.includes('"expected"') ||
    text.includes('"received"') ||
    text.includes('"invalid_') ||
    text.includes('"unrecognized_keys"')
  );
}

// The path tokens of the first issue, lowercased and dot-joined, or null.
function extractIssuePath(text: string): string[] | null {
  const parsed = tryParsePath(text);
  if (parsed) return parsed;
  // Fallback: pull the first `"path": [ ... ]` array literal directly.
  const match = text.match(/"path"\s*:\s*\[([^\]]*)\]/);
  if (!match) return null;
  const tokens = match[1]
    .split(',')
    .map((raw) => raw.trim().replace(/^"(.*)"$/, '$1'))
    .filter((token) => token.length > 0);
  return tokens.length > 0 ? tokens : null;
}

function tryParsePath(text: string): string[] | null {
  try {
    const value: unknown = JSON.parse(text);
    const issues = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.issues)
        ? value.issues
        : null;
    const first = issues?.[0];
    if (isRecord(first) && Array.isArray(first.path)) {
      return first.path.map((token) => String(token));
    }
  } catch {
    // Not JSON — fall back to the regex extractor.
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// `placements` is the plan's post array; the token after it is the 0-based post
// index, surfaced 1-based so the message points at the specific post.
function postSuffix(path: string[]): string {
  const idx = path.findIndex((token) => token.toLowerCase() === 'placements');
  if (idx === -1) return '';
  const next = path[idx + 1];
  const position = Number.parseInt(next ?? '', 10);
  return Number.isInteger(position) ? ` for post ${position + 1}` : '';
}

export function friendlyStreamError(raw: string | null | undefined): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return 'Generation failed';
  if (!looksLikeZodError(text)) return text;

  const path = extractIssuePath(text);
  if (!path) return GENERIC;

  const joined = path.join('.');
  const label = FIELD_LABELS.find(({ test }) => test.test(joined))?.label;
  if (!label) return GENERIC;
  return `${label}${postSuffix(path)}.`;
}
