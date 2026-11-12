import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type CatalogTranslator = ReturnType<typeof useTranslations<'onboarding'>>;

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

export type PriceIssueCode = 'priceDecimalSeparator' | 'priceAmountFormat' | 'priceOutOfRange';
export type PriceReading =
  | { ok: true; price: CampaignMoney | null }
  | { ok: false; raw: string; reason: PriceIssueCode };

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Locale chooses separators; the supplied currency always owns the money unit. */
export function readPrice(
  raw: string,
  currency = CATALOG_DEFAULT_CURRENCY,
  locale: UiLocale = 'en',
): PriceReading {
  const typed = raw.trim();
  if (!typed) return { ok: true, price: null };
  const invalid = (reason: PriceIssueCode): PriceReading => ({ ok: false, raw: typed, reason });
  if (typed.length > 100) return invalid('priceOutOfRange');
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.89);
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  let bare = typed;
  try {
    const symbols = new Set([
      currency.toUpperCase(),
      ...new Intl.NumberFormat(locale, { style: 'currency', currency })
        .formatToParts(1)
        .filter((part) => part.type === 'currency')
        .map((part) => part.value),
    ]);
    if (currency.toUpperCase() === 'USD') symbols.add('$');
    const token = [...symbols]
      .sort((a, b) => b.length - a.length)
      .find(
        (symbol) =>
          bare.toUpperCase().startsWith(symbol.toUpperCase()) ||
          bare.toUpperCase().endsWith(symbol.toUpperCase()),
      );
    if (token)
      bare = bare.toUpperCase().startsWith(token.toUpperCase())
        ? bare.slice(token.length).trim()
        : bare.slice(0, -token.length).trim();
  } catch {
    return invalid('priceAmountFormat');
  }
  const integer = `(?:\\d{1,3}(?:${escapePattern(group)}\\d{3})+|\\d+)`;
  const pattern = new RegExp(`^${integer}(?:${escapePattern(decimal)}\\d{1,2})?$`);
  if (!pattern.test(bare)) {
    const wrongDecimal = decimal === '.' ? /,\d{1,2}$/ : /\.\d{1,2}$/;
    return invalid(wrongDecimal.test(bare) ? 'priceDecimalSeparator' : 'priceAmountFormat');
  }
  const [whole, fraction = ''] = bare.split(decimal);
  const minor = BigInt(whole.split(group).join('')) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return invalid('priceOutOfRange');
  return { ok: true, price: { amountMinor: Number(minor), currency } };
}

export interface CatalogRowBuild {
  /** `unknown` on purpose — the row travels to the server unjudged. */
  row: unknown;
  /** Set when the price could not be read; the row still imports, without a price. */
  priceIssue: { raw: string; reason: PriceIssueCode } | null;
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
  locale: UiLocale = 'en',
): CatalogRowBuild {
  const reading = readPrice(draft.price, currency, locale);
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
  translate?: CatalogTranslator,
): CatalogImportSummary {
  let added = 0;
  let updated = 0;
  for (const accepted of response.accepted) {
    if (heldSlugsBefore.has(accepted.slug)) updated += 1;
    else added += 1;
  }
  const rejected = response.rejected.length;
  const submitted = response.accepted.length + rejected;

  if (translate) {
    const changes = [
      added > 0 ? translate('catalogAddedCount', { count: added }) : '',
      updated > 0 ? translate('catalogUpdatedCount', { count: updated }) : '',
    ]
      .filter(Boolean)
      .join(', ');
    const landed = changes
      ? translate('catalogImportedSummary', {
          accepted: response.accepted.length,
          submitted,
          changes,
        })
      : translate('catalogNoneImported', { count: submitted });
    const missed =
      rejected > 0 ? ` ${translate('catalogRejectedSummary', { count: rejected })}` : '';
    return { added, updated, rejected, submitted, headline: landed + missed };
  }
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
export function rejectionDetail(issues: readonly string[], translate?: CatalogTranslator): string {
  if (translate) {
    if (issues.length === 0) return translate('catalogNoDetails');
    const keys = issues.map((issue) => {
      const field = issue.split(':', 1)[0];
      if (field.startsWith('product.productUrl')) return 'catalogProductUrlInvalid' as const;
      if (field === 'name') return 'catalogNameRequired' as const;
      if (field.startsWith('memberAssetIds')) return 'catalogImageRequired' as const;
      return 'catalogRowInvalid' as const;
    });
    return [...new Set(keys)].map((key) => translate(key)).join(' · ');
  }
  return issues.length > 0 ? issues.join(' · ') : 'The server gave no further detail.';
}
