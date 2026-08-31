import type { LayerEditorLayer } from '../../types';
import type { Frame } from './frameModel';
import { applyLayerTransform } from './layerTransform';

/**
 * The N-layer compositor.
 *
 * NOT an extension of `utils/compositeImages.ts`: that one stacks exactly two images at
 * the origin with no transform, and widening it into a layer engine would drag the
 * hyperframes callers along for the ride. This one honours the aep-interop §4.3 model
 * exactly — see `layerTransform.ts` for why the pivot is the anchor and not the frame
 * centre.
 *
 * Bottom-first, painter's algorithm, over a TRANSPARENT frame. Transparent because a
 * stills compositor owes its downstream consumers an alpha channel, and because a
 * default white fill would make every "what colour is this blend?" assertion secretly
 * an assertion about white.
 */

export interface CompositeLayersInput {
  frame: Frame;
  /** BOTTOM-FIRST, exactly `LayerEditorNodeData.layers`. */
  layers: readonly LayerEditorLayer[];
  /** Pixels, keyed by `layer.id`. A layer with no entry is reported, not drawn. */
  images: ReadonlyMap<string, CanvasImageSource>;
}

export interface CompositeLayersResult {
  base64: string;
  mimeType: 'image/png';
  dataUrl: string;
  width: number;
  height: number;
  /** Ids that had no pixels. The dialog says so rather than exporting a silent hole. */
  missing: string[];
}

/** Canvas' own name for `normal`. Every other member is spelled identically. */
const compositeOperation = (blendMode: LayerEditorLayer['blendMode']): GlobalCompositeOperation =>
  blendMode === 'normal' ? 'source-over' : blendMode;

/**
 * Paint the layers onto `ctx`. Pure with respect to everything but the context, so a
 * recording mock can assert the exact call sequence (the `frameComposition.test.ts`
 * idiom).
 *
 * Returns which ids were painted and which had no pixels. `locked` is not consulted —
 * it is an editing affordance, not a render property — but `visible` is.
 */
export function drawLayers(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layers: readonly LayerEditorLayer[],
  images: ReadonlyMap<string, CanvasImageSource>,
): { drawn: string[]; missing: string[] } {
  const drawn: string[] = [];
  const missing: string[] = [];

  // Index 0 -> n-1: array order IS paint order, bottom first (aep-interop §4.2.6).
  for (const layer of layers) {
    if (!layer.visible) continue;
    const image = images.get(layer.id);
    if (!image) {
      missing.push(layer.id);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = compositeOperation(layer.blendMode);
    applyLayerTransform(ctx, layer);
    // The origin is the anchor after that transform, so the source is placed by its
    // anchor. This negative offset IS the anchor-point mechanism.
    ctx.drawImage(image, -layer.anchor.x, -layer.anchor.y, layer.sourceWidth, layer.sourceHeight);
    ctx.restore();

    drawn.push(layer.id);
  }

  return { drawn, missing };
}

const toBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked: String.fromCharCode(...bytes) on a multi-megabyte array blows the argument
  // limit, and a 4096x4096 PNG is comfortably that.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

/** Composite to a PNG. PNG because the frame is transparent and must stay that way. */
export async function compositeLayers(input: CompositeLayersInput): Promise<CompositeLayersResult> {
  const { width, height } = input.frame;
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('The Layer Editor needs OffscreenCanvas, which this browser does not have');
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context for the composition');

  const { missing } = drawLayers(ctx, input.layers, input.images);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const base64 = await toBase64(blob);
  return {
    base64,
    mimeType: 'image/png',
    dataUrl: `data:image/png;base64,${base64}`,
    width,
    height,
    missing,
  };
}

/**
 * Decode each layer's source to an `ImageBitmap`, keyed by layer id.
 *
 * `fetch` + `createImageBitmap` rather than `new Image()`: it handles `data:`, `blob:`
 * and signed `https:` alike, and it does not taint the canvas the way a cross-origin
 * `<img>` without CORS does — a tainted canvas fails at `convertToBlob`, i.e. after
 * all the work, with an error that names none of this.
 *
 * A source that will not load is OMITTED rather than thrown on: one dead signed URL
 * must not cost the user the other nine layers.
 */
export async function loadLayerImages(
  refs: ReadonlyMap<string, string>,
): Promise<Map<string, ImageBitmap>> {
  const entries = await Promise.all(
    [...refs].map(async ([id, ref]): Promise<[string, ImageBitmap] | null> => {
      try {
        const response = await fetch(ref);
        if (!response.ok) return null;
        return [id, await createImageBitmap(await response.blob())];
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((entry): entry is [string, ImageBitmap] => entry !== null));
}

/** The intrinsic size of a source, for `sourceWidth`/`sourceHeight` at add time. */
export async function measureSource(ref: string): Promise<{ width: number; height: number }> {
  const response = await fetch(ref);
  if (!response.ok) throw new Error(`Could not read the image to place (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
