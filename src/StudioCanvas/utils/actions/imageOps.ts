import { buildDataUrl } from '../dataUrl';

// Canvas-backed still operations behind the `image.*` action ops. Everything here
// draws through OffscreenCanvas so a runner can use it off the main thread later
// without a rewrite. The geometry is split out into pure helpers — that is the part
// that can be tested without a browser.

/** Degrees folded into [0, 360). `-90`, `270` and `630` are one rotation. */
const normaliseDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

export interface Bounds {
  readonly width: number;
  readonly height: number;
}

/** The canvas a `width` × `height` rectangle needs once rotated by `degrees`. */
export function rotatedBounds(width: number, height: number, degrees: number): Bounds {
  const angle = normaliseDegrees(degrees);

  // Quarter turns are exact by definition. Routing them through sin/cos would hand
  // back a 1919.9999999999998px canvas and a half-pixel blur on every 90° rotate —
  // the single most common case.
  if (angle === 0 || angle === 180) return { width, height };
  if (angle === 90 || angle === 270) return { width: height, height: width };

  const radians = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: Math.round(width * cos + height * sin),
    height: Math.round(width * sin + height * cos),
  };
}

/** A decoded still the 2D context can draw, with its intrinsic size known. */
export type DrawableImage = CanvasImageSource & { width: number; height: number };

/** Rotates a decoded image by `degrees` clockwise, returning a new bitmap-backed canvas. */
export async function rotateImage(
  source: DrawableImage,
  degrees: number,
): Promise<OffscreenCanvas> {
  const bounds = rotatedBounds(source.width, source.height, degrees);
  const canvas = new OffscreenCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create a 2D canvas context');

  // Rotate about the output centre and draw the source centred on it, so the
  // corners land inside the bounding box computed above whatever the angle.
  context.translate(bounds.width / 2, bounds.height / 2);
  context.rotate((normaliseDegrees(degrees) * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

/** Chunked so a large frame does not blow the argument limit of String.fromCharCode. */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** The bridge from an op's canvas output to the data URL a `NodeOutput` carries. */
export async function canvasToDataUrl(
  canvas: OffscreenCanvas,
  mimeType = 'image/png',
): Promise<string> {
  const blob = await canvas.convertToBlob({ type: mimeType });
  // `blob.type` wins: a browser that cannot encode the requested type silently
  // hands back a PNG, and mislabelling that would break every consumer downstream.
  return buildDataUrl(
    blob.type || mimeType,
    bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
  );
}
