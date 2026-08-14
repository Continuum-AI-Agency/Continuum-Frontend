// Normalizing any upload shape into ONE archive.
//
// A folder selection, a zip, a DTCG json and a PDF are four different things to a file
// input and one thing to the parser. Doing the normalization here — rather than
// branching on the server — means the Backend has a single code path and the browser
// pays the zip cost it was going to pay for a folder anyway.
//
// This lives in contracts rather than in the Frontend client because the upload bench
// has to produce the SAME archive the browser produces. A bench with its own zip helper
// proves that helper works; it says nothing about what a user's upload actually looks
// like, and the two drift the first time either side changes what it skips.

import { zipSync } from 'fflate';
import type { DesignSourceKind } from './manifest';

export interface PackagedDesignSystemUpload {
  blob: Blob;
  fileName: string;
  sourceKind: Extract<DesignSourceKind, 'ds_export' | 'dtcg' | 'document'>;
}

/**
 * `webkitRelativePath` is what carries the folder structure; without it a directory
 * upload arrives as a flat bag of basenames and `preview/colors-accent.html` becomes
 * `colors-accent.html`, which the manifest then cannot match to its own card.
 */
export async function packageDesignSystemUpload(
  files: File[],
): Promise<PackagedDesignSystemUpload> {
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
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    fileName: 'design-system.zip',
    sourceKind: 'ds_export',
  };
}
