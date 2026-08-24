'use client';

// Browser boundary for design systems.
//
// Upload goes straight to Storage, not through the Backend, for the same reason
// document upload does: an 8.8 MB archive is far past the 4.5 MB Vercel function-body
// cap, and routing bytes through a serverless function to then re-upload them is
// latency nobody is paid for. The Backend is told about the object afterwards and
// fetches it with service-role credentials.

import {
  type DesignSection,
  type DesignSystemSnapshot,
  packageDesignSystemUpload,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';
import { createBrandId } from '@/lib/onboarding/state';
import { sanitizeStorageFileName } from '@/lib/storage/sanitize';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const BUCKET = 'brand-docs';

export interface DesignSystemResponse {
  present: boolean;
  status: 'parsing' | 'ready' | 'error' | null;
  version: number | null;
  updated_at: string | null;
  design_system: DesignSystemSnapshot | null;
  /**
   * Id of the active system.
   *
   * An exemplar's `path` is relative to `${brand_id}/design-systems/${design_system_id}/`
   * inside `brand-docs` (the Backend spells the same prefix in
   * `brand-knowledge/design-system/store.ts` `exemplarPrefix`). Without the id the browser
   * can list a brand's exemplars but cannot fetch one.
   */
  design_system_id: string | null;
}

export function fetchDesignSystem(brandId: string): Promise<DesignSystemResponse> {
  return request<DesignSystemResponse>({
    path: `/brand-knowledge/design-system?brand_id=${encodeURIComponent(brandId)}`,
  });
}

export interface StartIngestResult {
  designSystemId: string;
}

/** Upload the archive, then ask the Backend to parse it. */
export async function uploadDesignSystem(args: {
  brandId: string;
  files: File[];
  onProgress?: (stage: 'packaging' | 'uploading' | 'starting') => void;
}): Promise<StartIngestResult> {
  args.onProgress?.('packaging');
  const packaged = await packageDesignSystemUpload(args.files);

  args.onProgress?.('uploading');
  const uploadId = createBrandId();
  const storagePath = `${args.brandId}/design-systems/${uploadId}/${sanitizeStorageFileName(packaged.fileName)}`;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, packaged.blob, {
    contentType: packaged.blob.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Could not upload the design system: ${error.message}`);

  args.onProgress?.('starting');
  try {
    const response = await request<{ design_system_id: string }>({
      path: '/brand-knowledge/design-system/ingest',
      method: 'POST',
      body: {
        brand_id: args.brandId,
        storage_path: storagePath,
        source_kind: packaged.sourceKind,
      },
    });
    return { designSystemId: response.design_system_id };
  } catch (startError) {
    // Same orphan cleanup uploadBrandDocument does, for the same reason: a successful
    // upload followed by a failed start leaves an object nobody owns and nothing will
    // ever reference. There are already 18 such orphans in this bucket from before
    // that helper existed; this one should not add more.
    await supabase.storage
      .from(BUCKET)
      .remove([storagePath])
      .catch(() => undefined);
    throw startError;
  }
}

export function saveDesignSection(args: {
  brandId: string;
  section: DesignSection;
  title?: string;
  summary?: string;
  rules?: DesignSystemSnapshot['sections'][number]['rules'];
  enabled?: boolean;
}): Promise<{ ok: true }> {
  return request({
    path: '/brand-knowledge/design-system/section',
    method: 'PATCH',
    body: {
      brand_id: args.brandId,
      section: args.section,
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.rules !== undefined ? { rules: args.rules } : {}),
      ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
    },
  });
}

export function saveRigorOverride(
  brandId: string,
  tier: 'strict' | 'guided' | 'loose' | null,
): Promise<{ ok: true }> {
  return request({
    path: '/brand-knowledge/design-system/rigor',
    method: 'PATCH',
    body: { brand_id: brandId, rigor_tier_override: tier },
  });
}

export function acknowledgeConflict(brandId: string, index: number): Promise<{ ok: true }> {
  return request({
    path: '/brand-knowledge/design-system/conflict',
    method: 'PATCH',
    body: { brand_id: brandId, index },
  });
}
