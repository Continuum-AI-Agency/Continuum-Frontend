// Makes an Instagram browser tile a drag source for the canvas.
//
// The canvas dropzone and every reference node read the same three MIME types
// and fall back to `text/plain` as a bare URL (parseReferenceDropPayload turns it
// into a remote reference), so a tile needs no protocol of its own — only the
// URL and the matching drag effect. `effectAllowed` MUST equal the dropzone's
// `dropEffect` (STUDIO_ASSET_DROP_EFFECT): Chrome reconciles a mismatch down to
// "none" and silently never fires `drop`.

import { STUDIO_ASSET_DROP_EFFECT } from '@/lib/creative-assets/studioAssetDrop';

export function setInstagramMediaDragData(dataTransfer: DataTransfer, url: string): void {
  dataTransfer.effectAllowed = STUDIO_ASSET_DROP_EFFECT;
  dataTransfer.setData('text/plain', url);
}
