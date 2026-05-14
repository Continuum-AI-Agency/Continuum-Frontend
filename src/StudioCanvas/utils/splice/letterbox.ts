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

export function drawLetterboxed(
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  const rect = computeLetterboxRect(sourceWidth, sourceHeight, targetWidth, targetHeight);
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}
