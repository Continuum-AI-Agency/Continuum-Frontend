'use client';

// Mounts the Video Editor over a Library asset. Lazy-loaded by EditTimelineButton
// because the editor pulls in mediabunny/WebCodecs — bytes the Library must not
// pay for until someone actually cuts something.

import type { MediaAsset } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TimelineEditorDialog } from '@/StudioCanvas/nodes/timeline/TimelineEditorDialog';
import { useLibraryTimelineAdapter } from './useLibraryTimelineAdapter';

export type LibraryTimelineEditorProps = {
  brandId: string;
  asset: MediaAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssetChanged?: () => void;
};

export function LibraryTimelineEditor({
  brandId,
  asset,
  open,
  onOpenChange,
  onAssetChanged,
}: LibraryTimelineEditorProps) {
  const { adapter, loading, error } = useLibraryTimelineAdapter({ brandId, asset, onAssetChanged });

  // A failed draft load must not open an empty editor: autosaving a seeded
  // timeline over a draft we could not read would destroy the user's cut.
  if (loading || error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-sm font-medium">Video editor</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {error ?? 'Loading your cut...'}
          </DialogDescription>
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          ) : null}
        </DialogContent>
      </Dialog>
    );
  }

  return <TimelineEditorDialog adapter={adapter} open={open} onOpenChange={onOpenChange} />;
}
