import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import portugueseMessages from '../../../messages/onboarding/pt-BR.json';

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
    expect(readPrice('19.99')).toEqual({
      ok: true,
      price: { amountMinor: 1999, currency: 'USD' },
    });
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
    expect(reading.reason).toBe('priceDecimalSeparator');
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
      draft({
        sku: 'HB-500',
        price: '19.99',
        productUrl: 'https://x.test/hb',
        variants: 'S, M ,',
      }),
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
    row: {
      name: slug,
      memberAssetIds: ['11111111-1111-4111-8111-111111111111'],
    },
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
      {
        accepted: [accepted(0, 'hero-bottle'), accepted(1, 'new-mug')],
        rejected: [],
      },
      new Set(['hero-bottle']),
    );
    expect(summary).toMatchObject({
      added: 1,
      updated: 1,
      rejected: 0,
      submitted: 2,
    });
    expect(summary.headline).toBe('Imported 2 of 2 — 1 added, 1 updated.');
  });

  it('a re-run of the same catalog reads as an update, not a fresh import', () => {
    const summary = summarizeImport(
      {
        accepted: [accepted(0, 'hero-bottle'), accepted(1, 'new-mug')],
        rejected: [],
      },
      new Set(['hero-bottle', 'new-mug']),
    );
    expect(summary).toMatchObject({ added: 0, updated: 2 });
    expect(summary.headline).toBe('Imported 2 of 2 — 2 updated.');
  });

  it('never hides a partial success behind a total', () => {
    const summary = summarizeImport(
      {
        accepted: [accepted(0, 'hero-bottle')],
        rejected: [rejected(1, 'Bad Row')],
      },
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

describe('locale-specific price input', () => {
  for (const locale of ['pt-BR', 'es'] as const) {
    it(`${locale}: reads decimal commas without changing USD identity`, () => {
      expect(readPrice('19,99', 'USD', locale)).toEqual({
        ok: true,
        price: { amountMinor: 1999, currency: 'USD' },
      });
      expect(readPrice('1.234,56', 'USD', locale)).toEqual({
        ok: true,
        price: { amountMinor: 123456, currency: 'USD' },
      });
      expect(readPrice('US$ 0,01', 'USD', locale)).toEqual({
        ok: true,
        price: { amountMinor: 1, currency: 'USD' },
      });
    });
    it(`${locale}: refuses misplaced groups, foreign decimal conventions and extra precision`, () => {
      for (const value of ['19.99', '1,234.56', '12.34,56', '1,234', '19,999', '-19,99', '19x99']) {
        expect(readPrice(value, 'USD', locale).ok).toBe(false);
      }
    });
  }
  it('interprets a group separator according to the selected locale only', () => {
    expect(readPrice('1,234', 'USD', 'en')).toEqual({
      ok: true,
      price: { amountMinor: 123400, currency: 'USD' },
    });
    expect(readPrice('1.234', 'USD', 'pt-BR')).toEqual({
      ok: true,
      price: { amountMinor: 123400, currency: 'USD' },
    });
  });
  it('rejects unsupported currency symbols rather than silently changing the currency', () => {
    expect(readPrice('€19.99', 'USD', 'en').ok).toBe(false);
    expect(readPrice('R$ 19,99', 'USD', 'pt-BR').ok).toBe(false);
  });
  it('preserves an explicitly supplied currency while using localized separators', () => {
    expect(readPrice('19,99', 'BRL', 'pt-BR')).toEqual({
      ok: true,
      price: { amountMinor: 1999, currency: 'BRL' },
    });
  });
  it('computes exact minor units and rejects an unsafe stored integer', () => {
    expect(readPrice('0.29')).toEqual({
      ok: true,
      price: { amountMinor: 29, currency: 'USD' },
    });
    expect(readPrice('90071992547409.91')).toEqual({
      ok: true,
      price: { amountMinor: Number.MAX_SAFE_INTEGER, currency: 'USD' },
    });
    expect(readPrice('90071992547409.92').ok).toBe(false);
  });
  it('builds the same persisted money for equivalent localized input', () => {
    const english = buildCatalogRow(draft({ price: '1,299.50' }), 'USD', 'en');
    const portuguese = buildCatalogRow(draft({ price: '1.299,50' }), 'USD', 'pt-BR');
    expect(portuguese).toEqual(english);
    expect(portuguese.row).toMatchObject({
      product: { price: { amountMinor: 129950, currency: 'USD' } },
    });
  });
});

it('localizes the real import outcome and field guidance without exposing server diagnostics', () => {
  const translate = createTranslator({
    locale: 'pt-BR',
    messages: { onboarding: portugueseMessages },
    namespace: 'onboarding',
  });
  const summary = summarizeImport(
    {
      accepted: [
        {
          status: 'accepted',
          index: 0,
          row: {
            name: 'Bottle',
            memberAssetIds: ['11111111-1111-4111-8111-111111111111'],
          },
          slug: 'bottle',
          externalKey: 'element:bottle',
        },
      ],
      rejected: [
        {
          status: 'rejected',
          index: 1,
          name: 'Bad URL',
          reason: 'element_catalog_row_invalid',
          issues: ['product.productUrl: provider diagnostic'],
        },
      ],
    },
    new Set(),
    translate,
  );
  expect(summary.headline).toBe(
    '1 de 2 importados: 1 adicionado. 1 produto não foi importado; veja abaixo.',
  );
  expect(rejectionDetail(['product.productUrl: provider diagnostic'], translate)).toBe(
    'Verifique a URL da página do produto.',
  );
  expect(rejectionDetail([], translate)).toBe('O servidor não forneceu mais detalhes.');
});
