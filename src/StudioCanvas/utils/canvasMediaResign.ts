import type { StudioNode } from "../types";

// A canvas node carries durable storage pointers (bucket + path) for its media
// independent of the expiring signed URL. After a Realtime sync merge or catch-up
// the node arrives from a persist-stripped row: the durable pointers survive but
// the signed-URL/media field has been removed. These helpers detect that state so
// the sync layer can re-sign the media instead of rendering a blank node.

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const nodeData = (node: StudioNode): Record<string, unknown> =>
  (node?.data ?? {}) as Record<string, unknown>;

// True when a node has a durable pointer (generated output or uploaded reference)
// but its corresponding signed-URL/media field is missing.
export function nodeNeedsResign(node: StudioNode): boolean {
  const data = nodeData(node);

  const imageDurable =
    isNonEmptyString(data.generatedImageStoragePath) && isNonEmptyString(data.generatedImageBucket);
  if (imageDurable && !isNonEmptyString(data.generatedImageUrl)) return true;

  const videoDurable =
    isNonEmptyString(data.generatedVideoStoragePath) && isNonEmptyString(data.generatedVideoBucket);
  if (videoDurable && !isNonEmptyString(data.generatedVideoUrl)) return true;

  const referenceDurable = isNonEmptyString(data.sourcePath) && isNonEmptyString(data.bucket);
  if (referenceDurable && !isNonEmptyString(data.sourceUrl)) return true;

  return false;
}

// Stable key for the durable pointer driving a re-sign, used to avoid re-signing
// the same media repeatedly across successive catch-ups (storm control). Returns
// null when the node has no durable pointer.
export function resignKey(node: StudioNode): string | null {
  const data = nodeData(node);

  if (isNonEmptyString(data.generatedImageStoragePath) && isNonEmptyString(data.generatedImageBucket)) {
    return `img:${data.generatedImageBucket}\n${data.generatedImageStoragePath}`;
  }
  if (isNonEmptyString(data.generatedVideoStoragePath) && isNonEmptyString(data.generatedVideoBucket)) {
    return `vid:${data.generatedVideoBucket}\n${data.generatedVideoStoragePath}`;
  }
  if (isNonEmptyString(data.sourcePath) && isNonEmptyString(data.bucket)) {
    return `ref:${data.bucket}\n${data.sourcePath}`;
  }
  return null;
}
