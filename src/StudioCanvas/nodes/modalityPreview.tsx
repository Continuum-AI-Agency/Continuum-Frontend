import type { ActionModality } from '@continuum/contracts';
import type React from 'react';
import { NodeVideoPreview } from '../components/NodeVideoPreview';

// The preview and the port colours that every modality-carrying node shares.
//
// Extracted so `RouterNode` does not have to import from inside `nodes/action/`, and so
// the Wave-3 export node has somewhere to reuse it from. One copy of the three cases is
// the point: a second copy is how a node ends up rendering text output as a broken img.

/** Port colour by modality — the same three vars the edges paint themselves with, so a
 *  handle and the wire leaving it can never be different colours. */
export const EDGE_COLOR_BY_MODALITY: Readonly<Record<ActionModality, string>> = {
  image: 'var(--edge-image)',
  video: 'var(--edge-video)',
  text: 'var(--edge-text)',
};

export const MODALITY_LABEL: Readonly<Record<ActionModality, string>> = {
  image: 'Image',
  video: 'Video',
  text: 'Text',
};

export const handleStyle = (
  modality: ActionModality | undefined,
  top?: string,
): React.CSSProperties => ({
  ['--edge-color' as keyof React.CSSProperties]: modality
    ? EDGE_COLOR_BY_MODALITY[modality]
    : 'var(--edge-text)',
  ...(top ? { top } : {}),
});

// Surface + label colours are SEMANTIC TOKENS, never `bg-black`/`text-white`. globals.css
// carries a blanket `[data-theme="light"] [class*="bg-black"] { background: var(--muted)
// !important }` (and the same for text-white), so a literal black stage silently renders
// lavender with dark "white" text in light mode. `bg-muted/30` is what the media nodes
// (ImageNode, VideoGenBlock) already use and it is correct in both themes.

/** The fields both `action` and `router` carry for whatever came out of them. */
export interface ModalityPreviewData {
  generatedImage?: string;
  generatedVideo?: string | Blob;
  generatedVideoUrl?: string;
  value?: string;
}

/**
 * The preview is keyed off the OUTPUT MODALITY, never off the node type.
 *
 * `action`'s node-registry entry says `producesMedia: true` for every op, because most
 * of them emit media — so a node type check renders `text.findReplace`'s output as a
 * broken <img>. The op is the only thing that knows what came out.
 */
export function ModalityPreview({
  modality,
  data,
  emptyLabel,
}: {
  modality: ActionModality | null | undefined;
  data: ModalityPreviewData;
  emptyLabel: string;
}) {
  // A worker op hands back bytes; the executor stamps the durable URL. Until it does
  // there is nothing to point a <video> at, so the node stays in its empty state.
  const videoSrc =
    data.generatedVideoUrl ??
    (typeof data.generatedVideo === 'string' ? data.generatedVideo : undefined);

  if (modality === 'image' && data.generatedImage) {
    return (
      // biome-ignore lint/performance/noImgElement: data URLs and signed rendition URLs are valid here.
      <img
        loading="lazy"
        src={data.generatedImage}
        alt="Action output"
        className="max-h-full max-w-full object-contain"
      />
    );
  }
  if (modality === 'video' && videoSrc) {
    return <NodeVideoPreview src={videoSrc} className="bg-transparent" />;
  }
  if (modality === 'text' && data.value) {
    return (
      <div className="nodrag nowheel h-full w-full overflow-y-auto whitespace-pre-wrap p-2 text-left text-xs text-foreground">
        {data.value}
      </div>
    );
  }
  return <span className="px-3 text-center text-xs text-muted-foreground">{emptyLabel}</span>;
}
