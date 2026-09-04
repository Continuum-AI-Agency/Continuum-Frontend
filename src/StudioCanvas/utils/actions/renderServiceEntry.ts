/**
 * The browser half of Continuum Render's `/v1/actions` lane.
 *
 * `bun build --target=browser` turns this file into one script that the render
 * service injects into a blank page in headless Chrome. That is the whole trick: the
 * fallback lane executes the SAME `runAction` dispatcher the canvas and the user's
 * own browser execute, so there is no second implementation of a blur to disagree
 * with the first. `e2e/image-text-render.bench.ts` has driven the ops this way for a
 * while — this is that harness promoted to production.
 *
 * Nothing here reaches the network on its own. Inputs arrive as same-origin URLs the
 * service already downloaded through its SSRF guard, and results go back to the
 * service over a same-origin POST rather than through `page.evaluate`, because a
 * finished video would otherwise cross that bridge as ~1.33x its size in base64.
 */

import type { BrandTypeInputs } from '@continuum/contracts';
import { creativeOpsRecipeSchema } from '@continuum/contracts';

import type { NodeOutput } from '../../types/execution';
import { buildDataUrl } from '../dataUrl';
import { runRecipe } from './runRecipe';

export interface CreativeOpsPageRequest {
  recipe: unknown;
  /** Library asset id -> a URL on this origin. */
  assets: Record<string, string>;
  brand: BrandTypeInputs | null;
  /** Same-origin path the finished bytes are POSTed to, one request per output. */
  sinkPath: string;
}

export interface CreativeOpsPageResult {
  outputs: { index: number; mimeType: string; kind: 'image' | 'video'; bytes: number }[];
}

async function outputBlob(output: NodeOutput): Promise<{ blob: Blob; kind: 'image' | 'video' }> {
  if (output.type === 'video') {
    const response = await fetch(output.url);
    if (!response.ok) throw new Error(`could not read the finished video (${response.status})`);
    return { blob: await response.blob(), kind: 'video' };
  }
  if (output.type === 'image') {
    const source =
      output.url ?? (output.base64 ? buildDataUrl(output.mimeType, output.base64) : null);
    if (!source) throw new Error('the finished image has no readable bytes');
    const response = await fetch(source);
    if (!response.ok) throw new Error(`could not read the finished image (${response.status})`);
    return { blob: await response.blob(), kind: 'image' };
  }
  throw new Error(`a recipe cannot end in ${output.type}`);
}

async function run(request: CreativeOpsPageRequest): Promise<CreativeOpsPageResult> {
  const recipe = creativeOpsRecipeSchema.parse(request.recipe);
  const output = await runRecipe({
    recipe,
    brand: request.brand,
    resolveAssetUrl: async (assetId) => request.assets[assetId] ?? null,
  });

  const items = output.type === 'collection' ? output.items : [output];
  const outputs: CreativeOpsPageResult['outputs'] = [];
  for (const [index, item] of items.entries()) {
    const { blob, kind } = await outputBlob(item);
    const response = await fetch(`${request.sinkPath}/${index}`, {
      method: 'POST',
      headers: { 'content-type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    if (!response.ok) throw new Error(`could not hand output ${index} back (${response.status})`);
    outputs.push({ index, mimeType: blob.type, kind, bytes: blob.size });
  }
  return { outputs };
}

declare global {
  interface Window {
    __continuumCreativeOps?: {
      run: (request: CreativeOpsPageRequest) => Promise<CreativeOpsPageResult>;
    };
  }
}

window.__continuumCreativeOps = { run };
