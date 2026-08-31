import type { NodeOutput } from '../../types/execution';
import { buildDataUrl } from '../dataUrl';

/**
 * What a node shows for a `collection` output.
 *
 * Every item, in order — which is the whole point of the type. `setNodeOutput` used to
 * keep one COVER (`items.find(item => item.type === 'image')`), and a node that showed
 * one still for a five-frame extraction is exactly what "it doesn't extract everything
 * and display, it only extracts the first available" looked like from the outside
 * (Airtable #292). A collection of VIDEOS found no image cover at all, so a two-part
 * `video.split` rendered an empty node (#303).
 *
 * The srcs are data URLs (image items carry base64) or object URLs (video items). They
 * are SESSION-LIVED: the canvas serializer strips them on the way to the row, the same
 * way it already does for a single image's `generatedImage`. Nothing here is a
 * persistence path — the durable copy of a collection is its items' assets.
 */
export function collectionPreviewSrcs(
  output: Extract<NodeOutput, { type: 'collection' }>,
): string[] {
  const srcs: string[] = [];
  for (const item of output.items) {
    if (item.type === 'image') {
      const src = item.base64 ? buildDataUrl(item.mimeType, item.base64) : item.url;
      if (src) srcs.push(src);
    } else if (item.type === 'video' && item.url) {
      srcs.push(item.url);
    }
    // A text collection has nothing to point an <img>/<video> at; the node keeps
    // rendering `value`, which is what its text branch already reads.
  }
  return srcs;
}
