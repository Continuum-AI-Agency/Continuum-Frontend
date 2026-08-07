'use client';

// Browser boundary for design systems.
//
// Upload goes straight to Storage, not through the Backend, for the same reason
// document upload does: an 8.8 MB archive is far past the 4.5 MB Vercel function-body
// cap, and routing bytes through a serverless function to then re-upload them is
// latency nobody is paid for. The Backend is told about the object afterwards and
// fetches it with service-role credentials.

import type { DesignSection, DesignSystemSnapshot } from '@continuum/contracts';
import { zipSync } from 'fflate';
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
}

export function fetchDesignSystem(brandId: string): Promise<DesignSystemResponse> {
  return request<DesignSystemResponse>({
    path: `/brand-knowledge/design-system?brand_id=${encodeURIComponent(brandId)}`,
  });
}

/**
 * Normalize any upload shape into ONE archive.
 *
 * A folder selection, a zip, a DTCG json and a PDF are four different things to a file
 * input and one thing to the parser. Doing the normalization here — rather than
 * branching on the server — means the Backend has a single code path and the browser
 * pays the zip cost it was going to pay for a folder anyway.
 *
 * `webkitRelativePath` is what carries the folder structure; without it a directory
 * upload arrives as a flat bag of basenames and `preview/colors-accent.html` becomes
 * `colors-accent.html`, which the manifest then cannot match to its own card.
 */
export async function packageDesignSystemUpload(files: File[]): Promise<{
  blob: Blob;
  fileName: string;
  sourceKind: 'ds_export' | 'dtcg' | 'document';
}> {
  if (files.length === 1) {
    const only = files[0];
    const lower = only.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      return { blob: only, fileName: only.name, sourceKind: 'ds_export' };
    }
    if (lower.endsWith('.json')) {
      return { blob: only, fileName: only.name, sourceKind: 'dtcg' };
    }
    return { blob: only, fileName: only.name, sourceKind: 'document' };
  }

  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const relative =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    // Drop the chosen folder's own name so paths match the manifest, which is written
    // relative to the design-system root rather than to wherever it was saved.
    const path = relative.split('/').slice(1).join('/') || file.name;
    if (/\.DS_Store|_ds_bundle\.js/.test(path)) continue;
    entries[path] = new Uint8Array(await file.arrayBuffer());
  }
  const zipped = zipSync(entries, { level: 6 });
  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    fileName: 'design-system.zip',
    sourceKind: 'ds_export',
  };
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
