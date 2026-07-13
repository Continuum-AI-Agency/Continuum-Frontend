'use client';

// Opens the Video Editor on a Library video. The editor's Dialog stacks over the
// asset detail modal; Radix hands Escape to the topmost dismissable layer, so the
// editor closes first and the detail view stays put.

import type { MediaAsset } from '@continuum/contracts';
import { Scissors } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

// The editor drags in mediabunny/WebCodecs; keep it out of the Library's initial
// bundle and off the server (it touches browser-only media APIs).
const LibraryTimelineEditor = dynamic(
  () => import('./LibraryTimelineEditor').then((module) => module.LibraryTimelineEditor),
  { ssr: false },
);

export type EditTimelineButtonProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

export function EditTimelineButton({ brandId, asset, onAssetChanged }: EditTimelineButtonProps) {
  const [open, setOpen] = useState(false);

  if (asset.kind !== 'video') return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Scissors className="size-3.5" aria-hidden />
        Edit video
      </Button>
      {open ? (
        <LibraryTimelineEditor
          brandId={brandId}
          asset={asset}
          open={open}
          onOpenChange={setOpen}
          onAssetChanged={onAssetChanged}
        />
      ) : null}
    </>
  );
}
