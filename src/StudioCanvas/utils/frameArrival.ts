/**
 * The arrival batch the camera should frame, or null when it should stay put.
 *
 * A remote write reports the new node ids once and then leaves them set. Node
 * edits, measurements, and pan-driven mounts all change the graph after that.
 * Framing again on those updates animates the camera back to the bounding-box
 * midpoint. One batch is framed once, and only after at least one of its nodes
 * is actually in the graph.
 */
export function arrivalFrameKey(
  alreadyFramed: string | null,
  arrivedNodeIds: readonly string[],
  presentNodeIds: ReadonlySet<string>,
): string | null {
  if (arrivedNodeIds.length === 0) return null;
  if (!arrivedNodeIds.some((id) => presentNodeIds.has(id))) return null;
  const key = arrivedNodeIds.join('\0');
  if (key === alreadyFramed) return null;
  return key;
}
