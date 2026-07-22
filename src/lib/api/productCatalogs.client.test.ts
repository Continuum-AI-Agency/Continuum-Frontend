import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({}));

mock.module('@/lib/api/http', () => ({
  http: {
    request: requestMock,
  },
}));

import {
  backfillProductCatalogHistory,
  createProductCatalog,
  deleteProductCatalog,
  listProductCatalogs,
  reconcileProductCatalogActivity,
  syncProductCatalog,
  updateProductCatalog,
} from '@/lib/api/productCatalogs.client';

describe('productCatalogs.client', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('lists product catalogs', async () => {
    requestMock.mockResolvedValue({
      catalogs: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          brandId: '22222222-2222-4222-8222-222222222222',
          name: 'Spring Catalog',
          externalCatalogId: 'meta_catalog_123',
          businessId: null,
          catalogStoreId: null,
          vertical: 'commerce',
          feedUrl: null,
          defaultImageUrl: null,
          fallbackImageUrl: null,
          linkedAdObjectLevel: 'adset',
          linkedAdObjectIds: ['adset_1'],
          dataFeedEnabled: true,
          productTaggingEnabled: true,
          syncStatus: 'active',
          productCount: 100,
          feedCount: 1,
          productSetCount: 3,
          lastSyncedAt: '2026-03-14T10:00:00.000Z',
          notes: null,
          createdAt: '2026-03-14T09:00:00.000Z',
          updatedAt: '2026-03-14T10:00:00.000Z',
        },
      ],
    });

    const result = await listProductCatalogs('22222222-2222-4222-8222-222222222222');

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/paid-media/product-catalogs?brandId=22222222-2222-4222-8222-222222222222',
        method: 'GET',
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('creates a product catalog', async () => {
    requestMock.mockResolvedValue({
      catalog: {
        id: '11111111-1111-4111-8111-111111111111',
        brandId: '22222222-2222-4222-8222-222222222222',
        name: 'Spring Catalog',
        externalCatalogId: 'meta_catalog_123',
        businessId: null,
        catalogStoreId: null,
        vertical: 'commerce',
        feedUrl: null,
        defaultImageUrl: null,
        fallbackImageUrl: null,
        linkedAdObjectLevel: 'adset',
        linkedAdObjectIds: [],
        dataFeedEnabled: true,
        productTaggingEnabled: true,
        syncStatus: 'draft',
        productCount: 0,
        feedCount: 0,
        productSetCount: 0,
        lastSyncedAt: null,
        notes: null,
        createdAt: '2026-03-14T09:00:00.000Z',
        updatedAt: '2026-03-14T10:00:00.000Z',
      },
    });

    await createProductCatalog({
      brandId: '22222222-2222-4222-8222-222222222222',
      name: 'Spring Catalog',
      businessId: 'biz_100',
      catalogStoreId: 'page_123',
      metaAccountId: 'act_123',
      vertical: 'commerce',
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/paid-media/product-catalogs',
        method: 'POST',
        body: expect.objectContaining({
          name: 'Spring Catalog',
          businessId: 'biz_100',
          catalogStoreId: 'page_123',
          metaAccountId: 'act_123',
        }),
      }),
    );
  });

  it('updates and deletes a product catalog', async () => {
    requestMock.mockResolvedValueOnce({
      catalog: {
        id: '11111111-1111-4111-8111-111111111111',
        brandId: '22222222-2222-4222-8222-222222222222',
        name: 'Updated Catalog',
        externalCatalogId: 'meta_catalog_123',
        businessId: null,
        catalogStoreId: null,
        vertical: 'commerce',
        feedUrl: null,
        defaultImageUrl: null,
        fallbackImageUrl: null,
        linkedAdObjectLevel: 'adset',
        linkedAdObjectIds: [],
        dataFeedEnabled: true,
        productTaggingEnabled: true,
        syncStatus: 'active',
        productCount: 120,
        feedCount: 2,
        productSetCount: 4,
        lastSyncedAt: '2026-03-14T10:00:00.000Z',
        notes: null,
        createdAt: '2026-03-14T09:00:00.000Z',
        updatedAt: '2026-03-14T10:00:00.000Z',
      },
    });
    requestMock.mockResolvedValueOnce(undefined);

    await updateProductCatalog('11111111-1111-4111-8111-111111111111', {
      name: 'Updated Catalog',
      syncStatus: 'active',
    });

    await deleteProductCatalog('11111111-1111-4111-8111-111111111111');

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: '/api/paid-media/product-catalogs/11111111-1111-4111-8111-111111111111',
        method: 'PUT',
      }),
    );
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: '/api/paid-media/product-catalogs/11111111-1111-4111-8111-111111111111',
        method: 'DELETE',
      }),
    );
  });

  it('invokes sync, reconcile, and backfill catalog jobs', async () => {
    requestMock.mockResolvedValue({
      success: true,
    });

    await syncProductCatalog('11111111-1111-4111-8111-111111111111', {
      brandId: '22222222-2222-4222-8222-222222222222',
      adAccountId: 'act_12345',
    });
    await reconcileProductCatalogActivity('11111111-1111-4111-8111-111111111111', {
      brandId: '22222222-2222-4222-8222-222222222222',
      staleAfterHours: 48,
      dryRun: true,
    });
    await backfillProductCatalogHistory('11111111-1111-4111-8111-111111111111', {
      brandId: '22222222-2222-4222-8222-222222222222',
      dryRun: true,
      limitRows: 500,
    });

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: '/api/paid-media/product-catalogs/11111111-1111-4111-8111-111111111111/sync',
        method: 'POST',
      }),
    );
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: '/api/paid-media/product-catalogs/11111111-1111-4111-8111-111111111111/reconcile',
        method: 'POST',
      }),
    );
    expect(requestMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        path: '/api/paid-media/product-catalogs/11111111-1111-4111-8111-111111111111/backfill',
        method: 'POST',
      }),
    );
  });
});
