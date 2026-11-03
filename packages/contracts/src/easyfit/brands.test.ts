import { describe, expect, test } from 'bun:test';
import {
  EASYFIT_BRAND_IDS,
  EASYFIT_DATASET_BRAND_ID,
  easyfitDatasetBrandFor,
  isEasyfitBrand,
} from './brands';

const EASY_FIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const EASYFIT_VIVO47_AGENCY = '148583e0-5538-462b-8d3a-acd25b80344e';

describe('the Easy Fit dataset owner', () => {
  test('both Easy Fit brands read the one dataset stored under Easy Fit 2026', () => {
    expect(EASYFIT_DATASET_BRAND_ID).toBe(EASY_FIT_2026);
    expect(easyfitDatasetBrandFor(EASY_FIT_2026)).toBe(EASY_FIT_2026);
    expect(easyfitDatasetBrandFor(EASYFIT_VIVO47_AGENCY)).toBe(EASY_FIT_2026);
    expect([...EASYFIT_BRAND_IDS].sort()).toEqual([EASYFIT_VIVO47_AGENCY, EASY_FIT_2026].sort());
  });

  test('any other brand has no Easy Fit dataset', () => {
    expect(easyfitDatasetBrandFor('11111111-1111-4111-8111-111111111111')).toBeNull();
    expect(easyfitDatasetBrandFor('')).toBeNull();
    expect(easyfitDatasetBrandFor(null)).toBeNull();
    expect(easyfitDatasetBrandFor(undefined)).toBeNull();
  });

  test('isEasyfitBrand offers the Dashboard on exactly the two Easy Fit brands', () => {
    expect(isEasyfitBrand(EASY_FIT_2026)).toBe(true);
    expect(isEasyfitBrand(EASYFIT_VIVO47_AGENCY)).toBe(true);
    expect(isEasyfitBrand('brand-1')).toBe(false);
    expect(isEasyfitBrand(null)).toBe(false);
  });
});
