import type { BrandTypeInputs } from '@continuum/contracts';
import {
  actionDef,
  actionInputPort,
  type CreativeOpInputRef,
  type CreativeOpsRecipe,
} from '@continuum/contracts';
import type { NodeOutput } from '../../types/execution';
import { buildDataUrl } from '../dataUrl';
import { type ResolvedActionInput, runAction } from './runAction';

/**
 * Run a creative-ops recipe: the same catalog, the same dispatcher, no canvas.
 *
 * This is what makes the two headless lanes ONE implementation. The browser render
 * queue calls it with `resolveAssetUrl` bound to the Library signer; the render
 * service's page calls it with the local files it was handed. Neither reimplements a
 * pixel, which is the only reason a fallback lane is safe to have at all.
 *
 * A recipe is a line, not a graph — `creativeOpsRecipeSchema` has already refused
 * forward references, modality mismatches and a mid-recipe fan-out — so this walks it
 * in order and keeps each step's output for the ones after it.
 */
export interface RunRecipeArgs {
  recipe: CreativeOpsRecipe;
  /** A library asset id -> something the ops can read. `null` fails the step loudly. */
  resolveAssetUrl: (assetId: string) => Promise<string | null>;
  /** Only `image.text` reads this; loading it is the caller's call. */
  brand?: BrandTypeInputs | null;
  signal?: AbortSignal;
  onStep?: (progress: { index: number; total: number; label: string }) => void;
}

const outputAsInput = async (
  output: NodeOutput,
  handle: string,
  modality: 'image' | 'video' | 'text',
): Promise<ResolvedActionInput> => {
  if (modality === 'text') {
    if (output.type !== 'text') throw new Error(`Step output is ${output.type}, not text.`);
    return { handle, text: output.value };
  }
  if (modality === 'image') {
    if (output.type !== 'image') throw new Error(`Step output is ${output.type}, not an image.`);
    const imageUrl =
      output.url ?? (output.base64 ? buildDataUrl(output.mimeType, output.base64) : null);
    if (!imageUrl) throw new Error('Step produced an image with no readable bytes.');
    return { handle, imageUrl, assetId: output.assetId };
  }
  if (output.type !== 'video') throw new Error(`Step output is ${output.type}, not a video.`);
  // Video ops re-encode, so the worker needs the bytes rather than a URL.
  const response = await fetch(output.url);
  if (!response.ok)
    throw new Error(`Could not read the previous step's video (${response.status}).`);
  return { handle, blob: await response.blob(), assetId: output.assetId };
};

const assetAsInput = async (
  url: string,
  assetId: string,
  handle: string,
  modality: 'image' | 'video' | 'text',
): Promise<ResolvedActionInput> => {
  if (modality === 'image') return { handle, imageUrl: url, assetId };
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download asset ${assetId} (${response.status}).`);
  return { handle, blob: await response.blob(), assetId };
};

export async function runRecipe(args: RunRecipeArgs): Promise<NodeOutput> {
  const outputs: NodeOutput[] = [];

  for (const [index, step] of args.recipe.entries()) {
    if (args.signal?.aborted) throw new DOMException('Render stopped.', 'AbortError');
    const def = actionDef(step.actionId);
    if (!def) throw new Error(`${step.actionId} is not an operation this build knows.`);
    args.onStep?.({ index, total: args.recipe.length, label: def.label });

    const inputs: ResolvedActionInput[] = [];
    for (const input of step.inputs) {
      const port = actionInputPort(step.actionId, input.handle);
      // The schema already refused an unknown handle; this is the type narrowing.
      if (!port) throw new Error(`${step.actionId} has no "${input.handle}" input.`);
      inputs.push(await resolveInput(input.from, input.handle, port.modality, outputs, args));
    }

    outputs.push(
      await runAction({
        actionId: step.actionId,
        inputs,
        config: step.config,
        brand: args.brand ?? null,
        signal: args.signal,
      }),
    );
  }

  return outputs[outputs.length - 1];
}

async function resolveInput(
  from: CreativeOpInputRef,
  handle: string,
  modality: 'image' | 'video' | 'text',
  outputs: readonly NodeOutput[],
  args: RunRecipeArgs,
): Promise<ResolvedActionInput> {
  if ('text' in from) return { handle, text: from.text };
  if ('step' in from) return outputAsInput(outputs[from.step], handle, modality);

  const url = await args.resolveAssetUrl(from.assetId);
  // Never degrade to "render it without that layer": a watermark that silently did
  // not land is worse than a run that says which asset it could not read.
  if (!url) throw new Error(`Could not read library asset ${from.assetId}.`);
  return assetAsInput(url, from.assetId, handle, modality);
}
