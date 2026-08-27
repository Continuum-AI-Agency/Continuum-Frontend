import { describe, expect, it } from 'bun:test';

import {
  buildCatalogRow,
  type CatalogProductDraft,
  readPrice,
  rejectionDetail,
  summarizeImport,
} from './catalog';

const draft = (overrides: Partial<CatalogProductDraft> = {}): CatalogProductDraft => ({
  key: 'k1',
  name: 'Hero Bottle',
  sku: '',
  price: '',
  productUrl: '',
  variants: '',
  assetIds: ['11111111-1111-4111-8111-111111111111'],
  previewUrls: [],
  ...overrides,
});

describe('readPrice', () => {
  it('reads a plain amount into minor units', () => {
    expect(readPrice('19.99')).toEqual({ ok: true, price: { amountMinor: 1999, currency: 'USD' } });
  });

  it('tolerates a currency symbol and a thousands separator', () => {
    expect(readPrice('$1,299')).toEqual({
      ok: true,
      price: { amountMinor: 129_900, currency: 'USD' },
    });
  });

  it('treats an empty price as no price, not as zero', () => {
    expect(readPrice('   ')).toEqual({ ok: true, price: null });
  });

  it('refuses a comma decimal rather than reading it as 1,999', () => {
    const reading = readPrice('19,99');
    expect(reading.ok).toBe(false);
    if (reading.ok) throw new Error('unreachable');
    expect(reading.raw).toBe('19,99');
    expect(reading.reason).toContain('full stop');
  });

  it('hands back the raw text when it cannot read the amount', () => {
    const reading = readPrice('call us');
    expect(reading.ok).toBe(false);
    if (reading.ok) throw new Error('unreachable');
    expect(reading.raw).toBe('call us');
  });
});

describe('buildCatalogRow', () => {
  it('omits the product block entirely when no facts were typed', () => {
    const { row, priceIssue } = buildCatalogRow(draft());
    expect(row).toEqual({
      name: 'Hero Bottle',
      memberAssetIds: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(priceIssue).toBeNull();
  });

  it('carries sku, price, url and variants when they were', () => {
    const { row } = buildCatalogRow(
      draft({ sku: 'HB-500', price: '19.99', productUrl: 'https://x.test/hb', variants: 'S, M ,' }),
    );
    expect(row).toEqual({
      name: 'Hero Bottle',
      memberAssetIds: ['11111111-1111-4111-8111-111111111111'],
      product: {
        sku: 'HB-500',
        price: { amountMinor: 1999, currency: 'USD' },
        productUrl: 'https://x.test/hb',
        variants: [{ name: 'S' }, { name: 'M' }],
      },
    });
  });

  it('passes a malformed URL through unjudged — the server names the row', () => {
    const { row } = buildCatalogRow(draft({ productUrl: 'shop.example' }));
    expect(row).toMatchObject({ product: { productUrl: 'shop.example' } });
  });

  it('still imports a row whose price could not be read, and reports the raw text', () => {
    const { row, priceIssue } = buildCatalogRow(draft({ sku: 'HB-500', price: 'call us' }));
    // No price key at all — never a zero.
    expect(row).toEqual({
      name: 'Hero Bottle',
      memberAssetIds: ['11111111-1111-4111-8111-111111111111'],
      product: { sku: 'HB-500' },
    });
    expect(priceIssue).toEqual({ raw: 'call us', reason: expect.any(String) });
  });
});

describe('summarizeImport', () => {
  const accepted = (index: number, slug: string) => ({
    status: 'accepted' as const,
    index,
    row: { name: slug, memberAssetIds: ['11111111-1111-4111-8111-111111111111'] },
    slug,
    externalKey: `element:${slug}`,
  });
  const rejected = (index: number, name: string) => ({
    status: 'rejected' as const,
    index,
    name,
    reason: 'element_catalog_row_invalid' as const,
    issues: ['product.productUrl: Invalid url'],
  });

  it('splits added from updated by what the brand already held', () => {
    const summary = summarizeImport(
      { accepted: [accepted(0, 'hero-bottle'), accepted(1, 'new-mug')], rejected: [] },
      new Set(['hero-bottle']),
    );
    expect(summary).toMatchObject({ added: 1, updated: 1, rejected: 0, submitted: 2 });
    expect(summary.headline).toBe('Imported 2 of 2 — 1 added, 1 updated.');
  });

  it('a re-run of the same catalog reads as an update, not a fresh import', () => {
    const summary = summarizeImport(
      { accepted: [accepted(0, 'hero-bottle'), accepted(1, 'new-mug')], rejected: [] },
      new Set(['hero-bottle', 'new-mug']),
    );
    expect(summary).toMatchObject({ added: 0, updated: 2 });
    expect(summary.headline).toBe('Imported 2 of 2 — 2 updated.');
  });

  it('never hides a partial success behind a total', () => {
    const summary = summarizeImport(
      { accepted: [accepted(0, 'hero-bottle')], rejected: [rejected(1, 'Bad Row')] },
      new Set(),
    );
    expect(summary.rejected).toBe(1);
    expect(summary.headline).toBe(
      'Imported 1 of 2 — 1 added. 1 product was not imported — see below.',
    );
  });

  it('says so plainly when nothing landed', () => {
    const summary = summarizeImport(
      { accepted: [], rejected: [rejected(0, 'Bad Row')] },
      new Set(),
    );
    expect(summary.headline).toBe(
      'None of your 1 products imported. 1 product was not imported — see below.',
    );
  });
});

describe('rejectionDetail', () => {
  it('joins the server issues', () => {
    expect(rejectionDetail(['a: one', 'b: two'])).toBe('a: one · b: two');
  });

  it('does not invent a reason it was not given', () => {
    expect(rejectionDetail([])).toBe('The server gave no further detail.');
  });
});
