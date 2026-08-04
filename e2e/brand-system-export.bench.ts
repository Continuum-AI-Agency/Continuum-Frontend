#!/usr/bin/env bun

import {
  type BrandSystemBinaryAsset,
  brandBookResponseSchema,
  brandSystemManifestV1Schema,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';

import { buildBrandSystemExport, createBrandSystemZip } from '@/lib/brands/brand-system-export';
import { loadProdSupabaseEnv } from './support/prodEnv';

const BRAND_ID = process.env.CONTINUUM_TEST_BRAND_ID ?? '32841a24-9e31-480c-8a3a-7ebc3cde0569';
const textDecoder = new TextDecoder();

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  PASS  ${message}`);
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const { url, serviceRoleKey } = loadProdSupabaseEnv();
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`[brand-system:export:e2e] brand=${BRAND_ID}`);
  const [bookResult, profileResult] = await Promise.all([
    admin
      .schema('brand_profiles')
      .from('brand_book')
      .select('status, assembled, refreshed_at')
      .eq('brand_id', BRAND_ID)
      .maybeSingle(),
    admin
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('brand_name')
      .eq('id', BRAND_ID)
      .maybeSingle(),
  ]);
  if (bookResult.error) throw bookResult.error;
  if (profileResult.error) throw profileResult.error;
  check(bookResult.data, 'materialized Brand Book row exists');
  check(profileResult.data?.brand_name, 'brand profile has a name');

  const assembled = record(bookResult.data.assembled);
  const report = record(assembled.report);
  const brandBook = brandBookResponseSchema.parse({
    brand_id: BRAND_ID,
    status: bookResult.data.status,
    present: bookResult.data.status === 'ready',
    refreshed_at: bookResult.data.refreshed_at,
    stale: false,
    assembled,
    composite: report.composite ?? null,
    summary_markdown: record(report.composite).summary_markdown ?? null,
    brand_md: report.brand_md ?? null,
    brand_tokens: report.brand_tokens ?? null,
    brand_md_is_edited: report.brand_md_is_edited ?? false,
    documents: Array.isArray(assembled.documents) ? assembled.documents : [],
  });
  check(brandBook.present, 'materialized Brand Book is ready');

  const loadLogo = async (storagePath: string): Promise<BrandSystemBinaryAsset | null> => {
    const { data, error } = await admin.storage.from('brand-profile-assets').download(storagePath);
    if (error || !data) return null;
    const mediaType = data.type || 'application/octet-stream';
    const extensionByType: Record<string, string> = {
      'image/gif': 'gif',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
    };
    const extension = extensionByType[mediaType];
    return extension
      ? { bytes: new Uint8Array(await data.arrayBuffer()), mediaType, extension }
      : null;
  };

  const exported = await buildBrandSystemExport(
    {
      brandBook,
      brandName: profileResult.data.brand_name,
    },
    loadLogo,
  );
  const archive = unzipSync(createBrandSystemZip(exported.files));
  const manifestBytes = archive['manifest.json'];
  const pdfBytes = archive['brand-book.pdf'];
  const knowledgeBytes = archive['brand.json'];
  const tokenBytes = archive['tokens.tokens.json'];
  check(manifestBytes, 'ZIP contains manifest.json');
  check(
    pdfBytes && textDecoder.decode(pdfBytes.slice(0, 5)) === '%PDF-',
    'ZIP contains a real PDF',
  );
  check(knowledgeBytes, 'ZIP contains normalized brand knowledge');
  check(tokenBytes, 'ZIP contains portable design tokens');

  const manifest = brandSystemManifestV1Schema.parse(JSON.parse(textDecoder.decode(manifestBytes)));
  const tokens = record(JSON.parse(textDecoder.decode(tokenBytes)));
  check(
    tokens.$schema === 'https://www.designtokens.org/schemas/2025.10/format.json',
    'token file declares the DTCG 2025.10 schema',
  );
  check(manifest.source.brandId === BRAND_ID, 'manifest identifies the materialized source brand');
  check(
    exported.files.every((file) => archive[file.path]?.byteLength === file.bytes.byteLength),
    'ZIP round-trips every compiled file without byte loss',
  );

  const archiveText = [manifestBytes, knowledgeBytes]
    .filter((bytes): bytes is Uint8Array => Boolean(bytes))
    .map((bytes) => textDecoder.decode(bytes))
    .join('\n');
  const storagePath = brandBook.brand_tokens?.logo?.storage_path;
  check(
    !storagePath || !archiveText.includes(storagePath),
    'export omits internal logo storage paths',
  );
  for (const document of brandBook.documents) {
    check(
      !document.excerpt || !archiveText.includes(document.excerpt),
      `export omits source excerpt for ${document.name}`,
    );
  }

  console.log(
    `[brand-system:export:e2e] green files=${exported.files.length} bytes=${createBrandSystemZip(exported.files).byteLength} duration_ms=${Math.round(performance.now() - startedAt)}`,
  );
}

main().catch((error) => {
  console.error('[brand-system:export:e2e] failed', error);
  process.exitCode = 1;
});
