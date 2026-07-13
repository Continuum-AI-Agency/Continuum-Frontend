import { describe, expect, test } from 'bun:test';
import { fileExtension, formatBytes } from './assetFileMeta';

describe('fileExtension', () => {
  test('extracts and uppercases the extension', () => {
    expect(fileExtension('promo-cut.aep')).toBe('AEP');
    expect(fileExtension('brand.assets.zip')).toBe('ZIP');
  });

  test('returns null when there is no usable extension', () => {
    expect(fileExtension('README')).toBeNull();
    expect(fileExtension('.gitignore')).toBeNull();
    expect(fileExtension('archive.')).toBeNull();
    expect(fileExtension('weird.reallylongext')).toBeNull();
  });
});

describe('formatBytes', () => {
  test('scales through units', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(512)).toBe('512.0 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  test('caps at GB for very large files', () => {
    expect(formatBytes(2 * 1024 ** 4)).toBe('2048.0 GB');
  });
});
