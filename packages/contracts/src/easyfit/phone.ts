/**
 * Phone handling for the Poliwin × Peaking join.
 *
 * Phones never leave the ingest process in clear text: the engine only ever sees
 * `sha256(tel10)`. Both sides (Poliwin "Móvil"/"Teléfono", Peaking `phone`) are
 * normalised with the same rule so equal numbers hash equal — the rule is the
 * `tel10` function of the reference pipeline (`pipeline/attr_v2.py`).
 */

const TEL10_LENGTH = 10;
/** Numbers like 3333333333 or 1212121212 are placeholders, not people. */
const MIN_DISTINCT_DIGITS = 3;

/**
 * Last 10 digits of whatever was typed, or `null` when the value is not a usable
 * Mexican number (fewer than 10 digits, or fewer than 3 distinct digits).
 */
export function normalizePhone(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const asText = typeof raw === 'number' ? numberToDigits(raw) : raw;
  const digits = asText.replace(/\D/g, '').slice(-TEL10_LENGTH);
  if (digits.length !== TEL10_LENGTH) return null;
  return new Set(digits).size >= MIN_DISTINCT_DIGITS ? digits : null;
}

/** Spreadsheets hand phones over as floats (`3312345678.0`); keep the integer digits. */
function numberToDigits(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Math.trunc(value).toLocaleString('en-US', { useGrouping: false });
}

/** SHA-256 of a UTF-8 string as lowercase hex. Web Crypto, so it runs on Bun, Node and browsers alike. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `sha256(tel10)`: the only form of a phone the engine ever sees. */
export const hashPhone = (tel10: string): Promise<string> => sha256Hex(tel10);

/** Normalise then hash; `null` when the number is unusable. */
export async function hashRawPhone(
  raw: string | number | null | undefined,
): Promise<string | null> {
  const tel10 = normalizePhone(raw);
  return tel10 === null ? null : hashPhone(tel10);
}
