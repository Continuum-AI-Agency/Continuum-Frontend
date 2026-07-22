import { describe, expect, it } from 'bun:test';

import {
  formatLinkedAdObjectIds,
  parseLinkedAdObjectIds,
  productCatalogCreateSchema,
  productCatalogUpdateSchema,
} from '@/lib/schemas/productCatalogs';

describe('productCatalogCreateSchema', () => {
  it('accepts a valid catalog payload', () => {
    const parsed = productCatalogCreateSchema.parse({
      brandId: '11111111-1111-4111-8111-111111111111',
      name: 'Spring Catalog',
      businessId: 'biz_100',
      catalogStoreId: 'page_123',
      metaAccountId: 'act_123',
      vertical: 'commerce',
    });

    expect(parsed.name).toBe('Spring Catalog');
    expect(parsed.metaAccountId).toBe('act_123');
  });

  it('requires business, page, and meta account ids', () => {
    const result = productCatalogCreateSchema.safeParse({
      brandId: '11111111-1111-4111-8111-111111111111',
      name: 'Spring Catalog',
      businessId: '',
      catalogStoreId: '',
      metaAccountId: '',
    });

    expect(result.success).toBe(false);
  });

  it('defaults vertical when omitted', () => {
    const result = productCatalogCreateSchema.safeParse({
      brandId: '11111111-1111-4111-8111-111111111111',
      name: 'Spring Catalog',
      businessId: 'biz_100',
      catalogStoreId: 'page_123',
      metaAccountId: 'act_123',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vertical).toBe('commerce');
    }
  });
});

describe('productCatalogUpdateSchema', () => {
  it('requires at least one field', () => {
    const result = productCatalogUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts a single partial field', () => {
    const result = productCatalogUpdateSchema.safeParse({ name: 'Renamed Catalog' });
    expect(result.success).toBe(true);
  });
});

describe('linked ad object helpers', () => {
  it('parses and deduplicates comma/newline inputs', () => {
    const parsed = parseLinkedAdObjectIds('cmp_1, cmp_2\ncmp_1\n cmp_3');
    expect(parsed).toEqual(['cmp_1', 'cmp_2', 'cmp_3']);
  });

  it('formats linked ids as newline-separated text', () => {
    expect(formatLinkedAdObjectIds(['ad_1', 'ad_2'])).toBe('ad_1\nad_2');
  });
});
