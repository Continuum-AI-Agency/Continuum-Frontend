// Computes top-left positions for a batch of freshly-imported reference nodes,
// laid out in centered rows around a base point (typically the viewport center).
// The canvas has no batch-add layout helper otherwise — resolveCollisions only
// runs after a drag, so without this newly-added nodes would stack and overlap.

export interface Point {
  x: number;
  y: number;
}

export interface RowLayoutOptions {
  size?: number;
  gap?: number;
  perRow?: number;
}

const DEFAULTS = { size: 192, gap: 32, perRow: 4 };

export function layoutInRow(count: number, base: Point, options: RowLayoutOptions = {}): Point[] {
  if (count <= 0) return [];
  const size = options.size ?? DEFAULTS.size;
  const gap = options.gap ?? DEFAULTS.gap;
  const perRow = Math.max(1, options.perRow ?? DEFAULTS.perRow);

  const rows = Math.ceil(count / perRow);
  const totalHeight = rows * size + (rows - 1) * gap;
  const startY = base.y - totalHeight / 2;

  const points: Point[] = [];
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const itemsInRow = Math.min(perRow, count - row * perRow);
    const rowWidth = itemsInRow * size + (itemsInRow - 1) * gap;
    const startX = base.x - rowWidth / 2;
    points.push({
      x: startX + col * (size + gap),
      y: startY + row * (size + gap),
    });
  }
  return points;
}
