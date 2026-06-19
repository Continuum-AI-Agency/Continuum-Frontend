// Pure resolution-cap math for the clip splice. Given the source's coded
// dimensions and an optional max SHORT edge (1080 for "1080p", 720 for "720p"),
// returns the encode target dimensions: the source scaled down (never up) so its
// short edge fits the cap, with both edges floored to even values (H.264 requires
// even dimensions). Capping the short edge gives conventional results for both
// landscape and vertical short-form sources. No I/O, so it unit-tests cleanly.

function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2)
}

export function computeCappedDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxShortEdgePx?: number,
): { width: number; height: number } {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { width: 2, height: 2 }
  }
  const shortEdge = Math.min(sourceWidth, sourceHeight)
  const scale = maxShortEdgePx && maxShortEdgePx > 0 ? Math.min(1, maxShortEdgePx / shortEdge) : 1
  return {
    width: evenFloor(sourceWidth * scale),
    height: evenFloor(sourceHeight * scale),
  }
}
