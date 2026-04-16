"use client";

import { http } from "@/lib/api/http";
import {
  productCatalogCreateSchema,
  productCatalogListResponseSchema,
  productCatalogSingleResponseSchema,
  productCatalogUpdateSchema,
  type ProductCatalogCreateInput,
  type ProductCatalogRecord,
  type ProductCatalogUpdateInput,
} from "@/lib/schemas/productCatalogs";

export async function listProductCatalogs(brandId: string): Promise<ProductCatalogRecord[]> {
  const response = await http.request<{ catalogs: ProductCatalogRecord[] }>({
    path: `/api/paid-media/product-catalogs?brandId=${encodeURIComponent(brandId)}`,
    method: "GET",
    schema: productCatalogListResponseSchema,
    cache: "no-store",
  });

  return response.catalogs;
}

export async function createProductCatalog(input: ProductCatalogCreateInput): Promise<ProductCatalogRecord> {
  const payload = productCatalogCreateSchema.parse(input);

  const response = await http.request<{ catalog: ProductCatalogRecord }>({
    path: "/api/paid-media/product-catalogs",
    method: "POST",
    body: payload,
    schema: productCatalogSingleResponseSchema,
    cache: "no-store",
  });

  return response.catalog;
}

export async function updateProductCatalog(
  catalogId: string,
  input: ProductCatalogUpdateInput
): Promise<ProductCatalogRecord> {
  const payload = productCatalogUpdateSchema.parse(input);

  const response = await http.request<{ catalog: ProductCatalogRecord }>({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}`,
    method: "PUT",
    body: payload,
    schema: productCatalogSingleResponseSchema,
    cache: "no-store",
  });

  return response.catalog;
}

export async function deleteProductCatalog(
  catalogId: string,
  options?: { brandId?: string; metaAccountId?: string }
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.brandId) params.set("brandId", options.brandId);
  if (options?.metaAccountId) params.set("metaAccountId", options.metaAccountId);
  const query = params.toString();

  await http.request({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}${query ? `?${query}` : ""}`,
    method: "DELETE",
    cache: "no-store",
  });
}

type SyncProductCatalogInput = {
  brandId: string;
  adAccountId: string;
  pageSize?: number;
  maxPages?: number;
  maxActivityRows?: number;
  source?: string;
};

type ReconcileProductCatalogInput = {
  brandId: string;
  staleAfterHours?: number;
  dryRun?: boolean;
};

type BackfillProductCatalogInput = {
  brandId: string;
  since?: string;
  until?: string;
  limitRows?: number;
  dryRun?: boolean;
};

type EdgeJobResponse = {
  success: boolean;
  [key: string]: unknown;
};

export async function syncProductCatalog(catalogId: string, input: SyncProductCatalogInput): Promise<EdgeJobResponse> {
  return http.request({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}/sync`,
    method: "POST",
    body: input,
    cache: "no-store",
  });
}

export async function reconcileProductCatalogActivity(
  catalogId: string,
  input: ReconcileProductCatalogInput
): Promise<EdgeJobResponse> {
  return http.request({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}/reconcile`,
    method: "POST",
    body: input,
    cache: "no-store",
  });
}

export async function backfillProductCatalogHistory(
  catalogId: string,
  input: BackfillProductCatalogInput
): Promise<EdgeJobResponse> {
  return http.request({
    path: `/api/paid-media/product-catalogs/${encodeURIComponent(catalogId)}/backfill`,
    method: "POST",
    body: input,
    cache: "no-store",
  });
}
