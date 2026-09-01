'use client';

// The canvas's download affordance, once.
//
// Airtable #288 is "the layer/stack node has no download control while its siblings do".
// The siblings each hand-rolled the same button, which is exactly how a node ships
// without one — so this is the button, and `exportSourceFromNodeData` (the same reader
// the Export node uses) is the one answer to "has this node produced a file yet".
//
// It renders NOTHING when the node holds no media. A node that has not produced is not
// missing an affordance; a node that HAS produced and offers no way to save it is.

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { downloadAsset } from '../utils/downloadAsset';
import { exportSourceFromNodeData } from '../utils/export/runExport';

type Props = {
  /** The node's React Flow type — `exportSourceFromNodeData` uses it for `sourceUrl` nodes. */
  nodeType?: string;
  data: unknown;
  /** File name without extension; the extension comes from the media itself. */
  baseName: string;
  /** What the control is called, for the tooltip and the accessible name. */
  label?: string;
  className?: string;
};

/** Where every node parks it unless it has a reason not to: top-right, over the preview. */
export const NODE_DOWNLOAD_BUTTON_CLASS =
  'nodrag absolute right-2 top-2 z-20 h-7 w-7 border border-border/70 bg-background/90 opacity-90 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100';

export function NodeDownloadButton({ nodeType, data, baseName, label, className }: Props) {
  const source = exportSourceFromNodeData({ type: nodeType, data });
  if (!source) return null;

  const accessibleName = label ?? `Download ${source.kind === 'video' ? 'clip' : 'image'}`;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className={cn(NODE_DOWNLOAD_BUTTON_CLASS, className)}
      // The canvas drags on mousedown and selects on click; neither should happen
      // because someone reached for the save button.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        downloadAsset({
          data: source.ref,
          baseName,
          fallbackExtension: source.kind === 'video' ? 'mp4' : 'png',
        });
      }}
      title="Download Output"
      aria-label={accessibleName}
    >
      <Download className="h-4 w-4" />
    </Button>
  );
}
