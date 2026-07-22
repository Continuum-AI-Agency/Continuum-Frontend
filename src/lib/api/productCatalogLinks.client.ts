'use client';

import { http } from '@/lib/api/http';
import {
  type ProductCatalogLinkRecord,
  productCatalogLinkSingleResponseSchema,
  productCatalogLinksListResponseSchema,
  type RemoveCatalogProductInput,
  type RenameCatalogProductInput,
  removeCatalogProductSchema,
  renameCatalogProductSchema,
  type UpsertProductCatalogLinkInput,
  upsertProductCatalogLinkSchema,
} from '@/lib/schemas/productCatalogLinks';

type ListProductCatalogLinksOptions = {
  activeOnly?: boolean;
};

export async function listProductCatalogLinks(
  catalogId: string,
  brandId: string,
  options: ListProductCatalogLinksOptions = {},
): Promise<ProductCatalogLinkRecord[]> {
  const params = new URLSearchParams({
    brandId,
    activeOnly: options.activeOnly === false ? 'false' : 'true',
  });

  const response = await http.request<{ links: ProductCatalogLinkRecord[] }>({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}/links?${params.toString()}`,
    method: 'GET',
    schema: productCatalogLinksListResponseSchema,
    cache: 'no-store',
  });

  return response.links;
}

export async function upsertProductCatalogLink(
  catalogId: string,
  input: UpsertProductCatalogLinkInput,
): Promise<ProductCatalogLinkRecord> {
  const payload = upsertProductCatalogLinkSchema.parse(input);
  const response = await http.request<{ link: ProductCatalogLinkRecord }>({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}/links`,
    method: 'POST',
    body: payload,
    schema: productCatalogLinkSingleResponseSchema,
    cache: 'no-store',
  });

  return response.link;
}

export async function renameCatalogProduct(
  catalogId: string,
  input: RenameCatalogProductInput,
): Promise<void> {
  const payload = renameCatalogProductSchema.parse(input);
  await http.request({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}/links`,
    method: 'PATCH',
    body: payload,
    cache: 'no-store',
  });
}

export async function removeCatalogProduct(
  catalogId: string,
  input: RemoveCatalogProductInput,
): Promise<void> {
  const payload = removeCatalogProductSchema.parse(input);
  await http.request({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}/links`,
    method: 'DELETE',
    body: payload,
    cache: 'no-store',
  });
}
