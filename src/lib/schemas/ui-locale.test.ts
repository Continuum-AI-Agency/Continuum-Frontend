import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../../messages/scale/en.json';
import es from '../../../messages/scale/es.json';
import pt from '../../../messages/scale/pt-BR.json';
import {
  brandGuidelineDraftSchema,
  createBrandGuidelineSchemas,
  EMPTY_BRAND_GUIDELINE_FORM,
} from './brandGuidelines';
import {
  createProductCatalogFormSchema,
  EMPTY_PRODUCT_CATALOG_FORM,
  productCatalogFormSchema,
} from './productCatalogs';

for (const [locale, messages] of [
  ['en', en],
  ['pt-BR', pt],
  ['es', es],
] as const) {
  const t = createTranslator({
    locale,
    messages: { scale: messages },
    namespace: 'scale',
    onError(error) {
      throw error;
    },
  });
  describe(`UI schema messages ${locale}`, () => {
    it('preserves guideline validation/data while localizing nested required/color errors', () => {
      const value = {
        ...structuredClone(EMPTY_BRAND_GUIDELINE_FORM),
        purpose: 'Customer wording — sem tradução',
      };
      const local = createBrandGuidelineSchemas(t).brandGuidelineDraftSchema;
      expect(local.parse(value)).toEqual(brandGuidelineDraftSchema.parse(value));
      const invalid = {
        ...value,
        purpose: '',
        colors: { ...value.colors, primary: 'red' },
        tags: { ...value.tags, logo: [{ label: '', description: '' }] },
      };
      const original = JSON.stringify(invalid);
      const result = local.safeParse(invalid);
      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected validation failure');
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        t('schemaUi_3'),
        t('schemaUi_0'),
        t('schemaUi_1'),
        t('schemaUi_2'),
      ]);
      expect(JSON.stringify(invalid)).toBe(original);
      expect(
        createBrandGuidelineSchemas(t).brandGuidelineApprovalSchema.safeParse(value).success,
      ).toBe(false);
    });
    it('keeps catalog identifiers and URL/length rules identical', () => {
      const value = {
        ...EMPTY_PRODUCT_CATALOG_FORM,
        name: 'Catálogo del cliente',
        businessId: 'business_123',
        catalogStoreId: 'store_123',
        feedUrl: 'https://example.com/feed',
      };
      const local = createProductCatalogFormSchema(t);
      expect(local.parse(value)).toEqual(productCatalogFormSchema.parse(value));
      const result = local.safeParse({
        ...value,
        name: '',
        businessId: '',
        catalogStoreId: '',
        feedUrl: 'bad',
      });
      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected validation failure');
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        t('schemaUi_18'),
        t('schemaUi_19'),
        t('schemaUi_21'),
        t('schemaUi_23'),
      ]);
      expect(local.safeParse({ ...value, businessId: 'a'.repeat(65) }).success).toBe(false);
    });
  });
}
