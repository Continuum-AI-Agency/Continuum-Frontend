import { expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { forgeQueryKeys, invalidateForgeBrand } from './queryKeys';

test('a save refetches the brand’s Forge reads but keeps the per-version layer views', async () => {
  const client = new QueryClient();
  const keys = {
    templates: forgeQueryKeys.templates('brand'),
    inventory: forgeQueryKeys.layerInventory('brand', 'asset', 'version'),
    scene: forgeQueryKeys.layerScene('brand', 'asset', 'version', null),
    preview: forgeQueryKeys.layerPreview('brand', 'revision', 3, { layers: [] }),
    otherBrand: forgeQueryKeys.templates('other'),
  };
  for (const key of Object.values(keys)) client.setQueryData(key, 'held');
  await invalidateForgeBrand(client, 'brand');
  const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
  expect(stale(keys.templates)).toBe(true);
  expect(stale(keys.inventory)).toBe(false);
  expect(stale(keys.scene)).toBe(false);
  expect(stale(keys.preview)).toBe(false);
  expect(stale(keys.otherBrand)).toBe(false);
});
