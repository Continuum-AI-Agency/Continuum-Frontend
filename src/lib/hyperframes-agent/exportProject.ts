'use client';

import type { HyperframesStoryboard } from '@continuum/contracts';
import { strToU8, zipSync } from 'fflate';
import { getHyperframesRevision } from '@/lib/api/hyperframesAgent.client';

const extensionFor = (mimeType: string): string =>
  ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
  })[mimeType] ?? 'bin';

export function packHyperframesProject(input: {
  html: string;
  assets: { assetId: string; mimeType: string; bytes: Uint8Array }[];
  compositionSpec: unknown;
  storyboard?: HyperframesStoryboard;
}): Uint8Array {
  let html = input.html;
  const files: Record<string, Uint8Array> = {};
  for (const asset of input.assets) {
    const path = `assets/${asset.assetId}.${extensionFor(asset.mimeType)}`;
    files[path] = asset.bytes;
    html = html.replaceAll(`hf-asset://${asset.assetId}`, path);
  }
  files['index.html'] = strToU8(html);
  files['composition.json'] = strToU8(JSON.stringify(input.compositionSpec ?? {}, null, 2));
  if (input.storyboard)
    files['storyboard.json'] = strToU8(JSON.stringify(input.storyboard, null, 2));
  files['README.md'] = strToU8(
    '# HyperFrames project\n\nOpen `index.html` or render it with `npx hyperframes render index.html`. The media files are pinned to this export. Review rights for any attached media before distribution.\n',
  );
  return zipSync(files, { level: 0 });
}

export async function buildHyperframesProjectZip(
  runId: string,
  storyboard?: HyperframesStoryboard,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const revision = await getHyperframesRevision(runId);
  const htmlResponse = await fetcher(revision.compositionUrl);
  if (!htmlResponse.ok) throw new Error('Could not download the composition.');
  const html = await htmlResponse.text();
  const assets: { assetId: string; mimeType: string; bytes: Uint8Array }[] = [];
  for (const asset of revision.assets) {
    const response = await fetcher(asset.url);
    if (!response.ok) throw new Error(`Could not download asset ${asset.assetId}.`);
    assets.push({
      assetId: asset.assetId,
      mimeType: asset.mimeType,
      bytes: new Uint8Array(await response.arrayBuffer()),
    });
  }
  return packHyperframesProject({
    html,
    assets,
    compositionSpec: revision.revision.compositionSpec,
    storyboard,
  });
}

export function downloadHyperframesProjectZip(
  bytes: Uint8Array,
  title = 'hyperframes-project',
): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
