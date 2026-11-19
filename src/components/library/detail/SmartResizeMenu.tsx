'use client';

import type { MediaAsset } from '@continuum/contracts';
import { Scaling } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';

import { QuickReformatMenu } from '@/components/library/reformat/QuickReformatMenu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type SmartResizeMenuProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

export function SmartResizeMenu({ brandId, asset, onAssetChanged }: SmartResizeMenuProps) {
  const translateUi = useUiTranslations('library');

  const disabled = asset.kind !== 'image';
  const button = (
    <Button variant="outline" size="sm" disabled={disabled}>
      <Scaling className="size-3.5" aria-hidden /> {translateUi('reformat_122f391e')}{' '}
    </Button>
  );

  return (
    <>
      {disabled ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<span>{button}</span>} />
            <TooltipContent>
              {translateUi('reformat_is_available_for_images_8dbb42f6')}
            </TooltipContent>
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
