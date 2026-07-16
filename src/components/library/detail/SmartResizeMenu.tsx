'use client';

import type { MediaAsset } from '@continuum/contracts';
import { Scaling } from 'lucide-react';

import { QuickReformatMenu } from '@/components/library/reformat/QuickReformatMenu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type SmartResizeMenuProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

export function SmartResizeMenu({ brandId, asset, onAssetChanged }: SmartResizeMenuProps) {
  const disabled = asset.kind !== 'image';
  const button = (
    <Button variant="outline" size="sm" disabled={disabled}>
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
            <TooltipContent>Reformat is available for images.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <QuickReformatMenu
          asset={asset}
          brandId={brandId}
          trigger={button}
          onCompleted={() => onAssetChanged?.()}
        />
      )}
    </>
  );
}
