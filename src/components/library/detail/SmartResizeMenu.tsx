'use client';

import type { MediaAsset } from '@continuum/contracts';
import { Scaling } from 'lucide-react';
import { useState } from 'react';

import { ImageReformatDialog } from '@/components/library/reformat/ImageReformatDialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type SmartResizeMenuProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

export function SmartResizeMenu({ brandId, asset, onAssetChanged }: SmartResizeMenuProps) {
  const [open, setOpen] = useState(false);
  const disabled = asset.kind !== 'image' || !asset.signedUrl;
  const button = (
    <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
      <Scaling className="size-3.5" aria-hidden />
      Reformat
    </Button>
  );

  return (
    <>
      {disabled ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{button}</span>
            </TooltipTrigger>
            <TooltipContent>Reformat requires a stored image.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
      <ImageReformatDialog
        open={open}
        onOpenChange={setOpen}
        brandId={brandId}
        asset={asset}
        onCompleted={() => onAssetChanged?.()}
      />
    </>
  );
}
