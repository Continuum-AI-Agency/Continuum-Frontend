'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { Archive, X } from 'lucide-react';
import React from 'react';
import { StudioMediaLibraryPanel } from '@/components/creative-assets/StudioMediaLibraryPanel';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type CreativeLibrarySidebarProps = {
  brandProfileId: string;
  expandedWidth?: number;
};

// AI Studio's creative library sheet. Surfaces the single unified media.assets
// library (StudioMediaLibraryPanel) — the same composite grid/folders/search the
// /library page uses — so every creative bucket is reachable from one place and
// draggable onto the canvas. The legacy raw-bucket "Files" browser was retired in
// favor of this single source of truth.
export function CreativeLibrarySidebar({
  brandProfileId,
  expandedWidth = 400,
}: CreativeLibrarySidebarProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div className="pointer-events-auto fixed right-4 top-1/2 z-40 -translate-y-1/2">
        <Button
          className="h-10 w-10 rounded-full shadow-xl bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => setOpen(true)}
          aria-label="Open creative library"
        >
          <Archive className="size-5" />
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen} modal={false}>
        <SheetPrimitive.Portal>
          <SheetPrimitive.Popup
            className={cn(
              'fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
              'bg-slate-950/95 border-l border-white/10 text-white backdrop-blur-xl',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
              'inset-y-0 right-0 h-full focus:outline-none',
            )}
            style={{ width: expandedWidth, maxWidth: '100vw' }}
          >
            <div className="flex h-full flex-col">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/5 p-4">
                <div className="flex items-center gap-2 text-white">
                  <Archive className="h-5 w-5" />
                  <SheetTitle className="font-medium text-white">Creative Library</SheetTitle>
                </div>
                <SheetClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-8 w-8 rounded-full p-0 text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>

              <div className="flex-1 overflow-hidden">
                <StudioMediaLibraryPanel brandProfileId={brandProfileId} />
              </div>
            </div>
          </SheetPrimitive.Popup>
        </SheetPrimitive.Portal>
      </Sheet>
    </>
  );
}
