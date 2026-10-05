import type { EditorCrop } from '@continuum/contracts';

export type FitRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function computeLetterboxRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): FitRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const width = targetWidth;
    const height = Math.round(targetWidth / sourceAspect);
    const y = Math.round((targetHeight - height) / 2);
    return { x: 0, y, width, height };
  }

  const height = targetHeight;
  const width = Math.round(targetHeight * sourceAspect);
  const x = Math.round((targetWidth - width) / 2);
  return { x, y: 0, width, height };
}

export function drawCanvasBackground(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  color?: string,
): void {
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
}

export function drawLetterboxed(
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  backgroundColor?: string,
): void {
  drawCanvasBackground(ctx, targetWidth, targetHeight, backgroundColor);
  const rect = computeLetterboxRect(sourceWidth, sourceHeight, targetWidth, targetHeight);
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}

/** Source crop and fitted destination shared by native preview and encoded output. */
export function computeCropRects(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  crop?: EditorCrop,
): { source: FitRect; target: FitRect } {
  const source = {
    x: sourceWidth * (crop?.left ?? 0),
    y: sourceHeight * (crop?.top ?? 0),
    width: sourceWidth * (1 - (crop?.left ?? 0) - (crop?.right ?? 0)),
    height: sourceHeight * (1 - (crop?.top ?? 0) - (crop?.bottom ?? 0)),
  };
  return {
    source,
    target: computeLetterboxRect(source.width, source.height, targetWidth, targetHeight),
  };
}
