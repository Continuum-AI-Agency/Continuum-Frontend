import { describe, expect, test } from 'bun:test';
import { forgeDeepLinkHref, readForgeDeepLink } from './forgeDeepLink';

describe('Forge handoff links', () => {
  test('carries a HyperFrames revision and its active brand without choosing a template', () => {
    const href = forgeDeepLinkHref({
      templateAssetId: null,
      renderSetId: null,
      rowId: null,
      hyperframesRevisionId: 'revision-42',
      brandId: '22222222-2222-4222-8222-222222222222',
      tab: 'author',
    });

    expect(href).toBe(
      '/forge?hfRevision=revision-42&brand=22222222-2222-4222-8222-222222222222&tab=author',
    );
    expect(readForgeDeepLink(href.slice('/forge'.length))).toEqual({
      templateAssetId: null,
      renderSetId: null,
      rowId: null,
      rerender: false,
      hyperframesRevisionId: 'revision-42',
      brandId: '22222222-2222-4222-8222-222222222222',
      tab: 'author',
    });
  });

  test('opens an explicitly linked Author tab without changing template selection', () => {
    expect(readForgeDeepLink('?template=asset-1&tab=author')).toEqual({
      templateAssetId: 'asset-1',
      renderSetId: null,
      rowId: null,
      rerender: false,
      hyperframesRevisionId: null,
      brandId: null,
      tab: 'author',
    });
  });

  test('keeps the existing Library template, set and row semantics', () => {
    expect(
      readForgeDeepLink(
        '?template=asset-1&set=set-2&row=row-3&rerender=1',
      ),
    ).toEqual({
      templateAssetId: 'asset-1',
      renderSetId: 'set-2',
      rowId: 'row-3',
      rerender: true,
      hyperframesRevisionId: null,
      brandId: null,
    });
  });
});
