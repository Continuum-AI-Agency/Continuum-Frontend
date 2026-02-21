type SnapNodeDimensionsOptions = {
  aspectRatio?: string;
  currentWidth?: unknown;
  currentHeight?: unknown;
  minWidth: number;
  minHeight: number;
  fallbackWidth: number;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    const normalized = trimmed.endsWith('px') ? trimmed.slice(0, -2) : trimmed;
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function getAspectRatioValue(aspectRatio?: string): number {
  if (!aspectRatio) return 1;
  const match = aspectRatio.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return 1;

  const width = Number.parseFloat(match[1]);
  const height = Number.parseFloat(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }

  return width / height;
}

export function snapNodeDimensionsToAspectRatio({
  aspectRatio,
  currentWidth,
  currentHeight,
  minWidth,
  minHeight,
  fallbackWidth,
}: SnapNodeDimensionsOptions): { width: number; height: number } {
  const ratio = getAspectRatioValue(aspectRatio);
  const safeRatio = ratio > 0 ? ratio : 1;

  const width = toNumber(currentWidth);
  const height = toNumber(currentHeight);

  const baselineWidth = width ?? fallbackWidth;
  const baselineHeight = height ?? Math.max(minHeight, baselineWidth / safeRatio);
  const area = Math.max(minWidth * minHeight, baselineWidth * baselineHeight);

  let snappedWidth = Math.sqrt(area * safeRatio);
  let snappedHeight = snappedWidth / safeRatio;

  if (snappedWidth < minWidth) {
    snappedWidth = minWidth;
    snappedHeight = snappedWidth / safeRatio;
  }

  if (snappedHeight < minHeight) {
    snappedHeight = minHeight;
    snappedWidth = snappedHeight * safeRatio;
  }

  return {
    width: Math.round(snappedWidth),
    height: Math.round(snappedHeight),
  };
}
