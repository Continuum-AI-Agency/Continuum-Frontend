import {
  applyCapiFieldMap,
  CAPI_MAX_EVENTS_PER_REQUEST,
  type CapiActionSource,
  type CapiEventInput,
  capiCsvFieldMap,
  capiEventTimeProblem,
  capiInvalidEventsErrorSchema,
} from '@continuum/contracts';
import { parseDelimited, recordsFromTable } from '@/components/forge/renderRequestRows';
import { ApiError } from '@/lib/api/errors';

export const nowSeconds = () => Math.floor(Date.now() / 1_000);

/** Every leaf of a sample payload as a dot path; array items are indexed (`lines.0.amount`). */
export function leafPaths(payload: unknown, prefix = ''): string[] {
  if (payload === null || typeof payload !== 'object') return prefix ? [prefix] : [];
  const entries = Array.isArray(payload)
    ? payload.map((item, index) => [String(index), item] as const)
    : Object.entries(payload);
  return entries.flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key));
}

export function chunk<T>(items: readonly T[], size = CAPI_MAX_EVENTS_PER_REQUEST): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

export type CsvReview = {
  headers: string[];
  events: CapiEventInput[];
  /** `line` is the file's line number, header = 1, so it matches what a spreadsheet shows. */
  issues: Array<{ line: number; message: string }>;
};

/** A CSV of offline conversions → the events Meta would accept, and why every other row is out. */
export function reviewCsv(
  text: string,
  defaults: { eventName: string; actionSource: CapiActionSource },
  now: number,
): CsvReview {
  const { headers, rows } = recordsFromTable(parseDelimited(text));
  const fieldMap = capiCsvFieldMap(headers);
  const review: CsvReview = { headers, events: [], issues: [] };
  rows.forEach((row, index) => {
    const line = index + 2;
    const mapped = applyCapiFieldMap(row, { ...defaults, fieldMap }, now);
    if (!mapped.ok) {
      review.issues.push({ line, message: mapped.issues.join('; ') });
      return;
    }
    // One stale event makes Meta refuse the whole request, so it is dropped here, not sent.
    const timeProblem = capiEventTimeProblem(mapped.event, now);
    if (timeProblem) review.issues.push({ line, message: timeProblem });
    else review.events.push(mapped.event);
  });
  return review;
}

/** The per-event issues in a 400 `invalid_events` body, or null for any other failure. */
export function invalidEventIssues(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const parsed = capiInvalidEventsErrorSchema.safeParse(error.payload);
  return parsed.success ? parsed.data.issues : null;
}

export const isForbidden = (error: unknown) => error instanceof ApiError && error.status === 403;

const ERROR_COPY: Record<string, string> = {
  capi_not_configured: 'Save a pixel above before sending events.',
  invalid_forward_destination: 'That forwarding destination does not belong to this brand.',
  not_found: 'That no longer exists. Refresh and try again.',
};

export function capiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return ERROR_COPY[error.message] ?? error.message;
}

// --- Standard Webhooks signing --------------------------------------------------------------

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** `v1,` + base64 HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed by the bytes after `whsec_`. */
export async function standardWebhookSignature(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

/** A native-format body a new source accepts as-is. */
export const sampleWebhookBody = (eventName: string, actionSource: CapiActionSource, now: number) =>
  JSON.stringify({
    test: true,
    events: [
      {
        event_name: eventName,
        event_time: now,
        action_source: actionSource,
        user: { email: 'customer@example.com' },
      },
    ],
  });

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export const unsignedCurl = (url: string, body: string) =>
  `curl -X POST ${shellQuote(url)} \\\n  -H 'Content-Type: application/json' \\\n  -d ${shellQuote(body)}`;

/** Signed with a fresh timestamp: copy it and run it within a few minutes. */
export async function signedCurl(
  url: string,
  body: string,
  secret: string,
  now: number,
): Promise<string> {
  const id = `msg_${crypto.randomUUID()}`;
  const signature = await standardWebhookSignature(secret, id, now, body);
  return [
    `curl -X POST ${shellQuote(url)}`,
    `  -H 'Content-Type: application/json'`,
    `  -H ${shellQuote(`webhook-id: ${id}`)}`,
    `  -H ${shellQuote(`webhook-timestamp: ${now}`)}`,
    `  -H ${shellQuote(`webhook-signature: ${signature}`)}`,
    `  -d ${shellQuote(body)}`,
  ].join(' \\\n');
}

/** What every panel needs: whose data, and the read-only latch a 403 trips. */
export type CapiPanelProps = {
  brandId: string;
  readOnly: boolean;
  onForbidden: () => void;
};

/** A write failure as one line to show, or null after a 403 (the section turns read-only). */
export function writeFailure(error: unknown, onForbidden: () => void, fallback: string) {
  if (isForbidden(error)) {
    onForbidden();
    return null;
  }
  return capiErrorMessage(error, fallback);
}
