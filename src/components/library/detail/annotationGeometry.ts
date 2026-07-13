// Pure annotation math for the asset detail stage. Annotations are stored as
// normalized 0..1 boxes/points against the media's intrinsic frame; the stage
// renders media with object-contain, so every conversion goes through the
// fitted content rect (the letterboxed area the pixels actually occupy),
// never the raw container box.

export type Size = { width: number; height: number };

export type CssRect = { left: number; top: number; width: number; height: number };

export type NormalizedPoint = { x: number; y: number };

export type NormalizedBox = { x: number; y: number; width: number; height: number };

// Drags smaller than 1% of the frame in both axes read as clicks, not boxes.
export const MIN_BOX_EDGE = 0.01;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// object-contain: scale by the limiting axis, center the remainder.
export function fitContentRect(container: Size, natural: Size): CssRect | null {
  if (container.width <= 0 || container.height <= 0) return null;
  if (natural.width <= 0 || natural.height <= 0) return null;
  const scale = Math.min(container.width / natural.width, container.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}

// Point in container-relative px -> normalized 0..1 within the content rect.
export function containerPointToNormalized(
  point: { x: number; y: number },
  content: CssRect,
): NormalizedPoint {
  return {
    x: clamp01((point.x - content.left) / content.width),
    y: clamp01((point.y - content.top) / content.height),
  };
}

// Two drag corners (any order) -> a clamped normalized box.
export function normalizedBoxFromPoints(a: NormalizedPoint, b: NormalizedPoint): NormalizedBox {
  const x = clamp01(Math.min(a.x, b.x));
  const y = clamp01(Math.min(a.y, b.y));
  return {
    x,
    y,
    width: clamp01(Math.max(a.x, b.x)) - x,
    height: clamp01(Math.max(a.y, b.y)) - y,
  };
}

export function isMeaningfulBox(box: NormalizedBox): boolean {
  return box.width >= MIN_BOX_EDGE || box.height >= MIN_BOX_EDGE;
}

// Normalized box -> container-relative px rect for absolute positioning.
export function normalizedBoxToCssRect(box: NormalizedBox, content: CssRect): CssRect {
  return {
    left: content.left + box.x * content.width,
    top: content.top + box.y * content.height,
    width: box.width * content.width,
    height: box.height * content.height,
  };
}

// Anchor point for a composer attached to a box: below it, or above when the
// box sits in the lower third of the content rect. Left edge is clamped so a
// panel of `panelWidth` px stays inside the container.
export function composerAnchor(
  box: NormalizedBox,
  content: CssRect,
  container: Size,
  panelWidth: number,
  gap = 8,
): { left: number; top: number; placement: 'below' | 'above' } {
  const rect = normalizedBoxToCssRect(box, content);
  const left = Math.min(
    Math.max(rect.left, gap),
    Math.max(gap, container.width - panelWidth - gap),
  );
  const below = rect.top + rect.height + gap;
  const placeAbove = box.y + box.height > 2 / 3;
  return placeAbove
    ? { left, top: rect.top - gap, placement: 'above' }
    : { left, top: below, placement: 'below' };
}

export function seekFraction(timeMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return clamp01(timeMs / durationMs);
}

export type SeekSpan = { left: number; width: number };

// A range comment's lane geometry, as 0..1 fractions of the scrubber width.
// Both edges clamp to the media, so a range whose end outruns a shorter-than-
// expected duration still renders as a bar ending at the scrubber's edge
// instead of overflowing it.
export function seekSpan(timeMs: number, endMs: number, durationMs: number): SeekSpan {
  const left = seekFraction(timeMs, durationMs);
  const right = seekFraction(endMs, durationMs);
  return { left, width: Math.max(0, right - left) };
}

// m:ss under an hour, h:mm:ss beyond.
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

// The label for a time annotation: a moment, or a span when it carries an end.
export function formatTimecodeRange(timeMs: number, endMs: number | null): string {
  return endMs === null
    ? formatTimecode(timeMs)
    : `${formatTimecode(timeMs)}–${formatTimecode(endMs)}`;
}
