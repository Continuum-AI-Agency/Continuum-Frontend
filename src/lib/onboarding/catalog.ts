// The product-catalog step's pure half: what the brand typed → what the bulk import
// endpoint is sent, and what its per-row report MEANS.
//
// WHY NOTHING HERE VALIDATES A ROW. `partitionElementCatalog` in `@continuum/contracts`
// is the single authority on whether a row is legal, and the endpoint runs it. A second
// copy of that judgement in the Frontend is exactly the drift AGENTS.md §4 forbids — and
// it is worse than drift here: a row the Frontend silently drops never appears in the
// server's report, so the brand is never told which product did not import or why. So we
// send what was typed and let the report speak.
//
// The ONE exception is the price, and it is not validation: `campaignMoneySchema` is
// minor-units integer + ISO-4217, so somebody has to turn "$19.99" into 1999. That
// reading can fail, and when it does the row still imports — without a price, carrying
// the raw text the brand typed. A price we could not read must never become a silent
// zero, because a zero is a fact and "we could not read this" is not.

import type { CampaignMoney, ImportElementCatalogResponse } from '@continuum/contracts';

export const CATALOG_DEFAULT_CURRENCY = 'USD';

/** One product as the brand is editing it: raw text, exactly as typed. */
export interface CatalogProductDraft {
  /** Stable across re-renders and edits; not sent. */
  key: string;
  name: string;
  sku: string;
  price: string;
  productUrl: string;
  /** Comma-separated variant names — a colourway/size grid as one line. */
  variants: string;
  assetIds: string[];
  /** Signed preview URLs, one per member, for the thumbnail strip. */
  previewUrls: string[];
}

export type PriceReading =
  | { ok: true; price: CampaignMoney | null }
  | { ok: false; raw: string; reason: string };

const PRICE_PATTERN = /^\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/;

/**
 * "$19.99" → 1999 USD. Empty → no price, which is legal: facts are optional.
 *
 * ponytail: comma-as-decimal locales ("19,99") read as one thousand nine hundred and
 * ninety-nine and are therefore REJECTED rather than guessed — a currency picker per row
 * is the upgrade path, and guessing wrong prints a wrong price on an ad.
 */
export function readPrice(raw: string, currency = CATALOG_DEFAULT_CURRENCY): PriceReading {
  const typed = raw.trim();
  if (typed.length === 0) return { ok: true, price: null };

  const bare = typed.replace(/^[^\d]*/, '').replace(/\s/g, '');
  // Checked BEFORE the shape, because "19,99" fails the shape too and the generic
  // reason would send a European brand hunting for a typo it did not make.
  if (/,\d{1,2}$/.test(bare)) {
    return {
      ok: false,
      raw: typed,
      reason: 'Use a full stop for the decimal — 19.99, not 19,99.',
    };
  }
  if (bare.length === 0 || !PRICE_PATTERN.test(bare)) {
    return {
      ok: false,
      raw: typed,
      reason: 'We read prices as a plain amount — 19.99, or 1,299 — with at most two decimals.',
    };
  }

  const amount = Number(bare.replace(/,/g, ''));
  if (!Number.isFinite(amount)) {
    return { ok: false, raw: typed, reason: 'That is not an amount we can read.' };
  }
  return { ok: true, price: { amountMinor: Math.round(amount * 100), currency } };
}

export interface CatalogRowBuild {
  /** `unknown` on purpose — the row travels to the server unjudged. */
  row: unknown;
  /** Set when the price could not be read; the row still imports, without a price. */
  priceIssue: { raw: string; reason: string } | null;
}

/**
 * A draft → one submission row.
 *
 * `product` is omitted entirely when the brand typed no facts, so a catalog of images
 * and nothing else sends exactly what it did before this block existed. The URL is
 * passed through UNCHECKED — that is the server's call, and its report names the row.
 */
export function buildCatalogRow(
  draft: CatalogProductDraft,
  currency = CATALOG_DEFAULT_CURRENCY,
): CatalogRowBuild {
  const reading = readPrice(draft.price, currency);
  const sku = draft.sku.trim();
  const productUrl = draft.productUrl.trim();
  const variants = draft.variants
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));

  const product: Record<string, unknown> = {};
  if (sku) product.sku = sku;
  if (reading.ok && reading.price) product.price = reading.price;
  if (productUrl) product.productUrl = productUrl;
  if (variants.length > 0) product.variants = variants;

  const row: Record<string, unknown> = {
    name: draft.name.trim(),
    memberAssetIds: draft.assetIds,
  };
  if (Object.keys(product).length > 0) row.product = product;

  return {
    row,
    priceIssue: reading.ok ? null : { raw: reading.raw, reason: reading.reason },
  };
}

export interface CatalogImportSummary {
  added: number;
  updated: number;
  rejected: number;
  submitted: number;
  /** One honest sentence. Never "imported!" when a row did not. */
  headline: string;
}

/**
 * What actually happened, told the way the brand needs to hear it.
 *
 * added vs updated is decided by the slug the server REPORTS against the slugs the brand
 * already held before the submission. That is the same identity the server resolved
 * (SKU first, then slug): a SKU match on a renamed product reports the EXISTING slug, so
 * it lands in `updated` — which is the whole reason re-running the step must not read as
 * a fresh import.
 */
export function summarizeImport(
  response: ImportElementCatalogResponse,
  heldSlugsBefore: ReadonlySet<string>,
): CatalogImportSummary {
  let added = 0;
  let updated = 0;
  for (const accepted of response.accepted) {
    if (heldSlugsBefore.has(accepted.slug)) updated += 1;
    else added += 1;
  }
  const rejected = response.rejected.length;
  const submitted = response.accepted.length + rejected;

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (updated > 0) parts.push(`${updated} updated`);

  const landed =
    parts.length > 0
      ? `Imported ${response.accepted.length} of ${submitted} — ${parts.join(', ')}.`
      : `None of your ${submitted} products imported.`;
  const missed =
    rejected > 0
      ? ` ${rejected === 1 ? '1 product was not imported' : `${rejected} products were not imported`} — see below.`
      : '';

  return { added, updated, rejected, submitted, headline: `${landed}${missed}` };
}

/** `product.productUrl: Invalid url` → the sentence a person fixes a spreadsheet with. */
export function rejectionDetail(issues: readonly string[]): string {
  return issues.length > 0 ? issues.join(' · ') : 'The server gave no further detail.';
}
