'use client';

import {
  IMAGE_REFORMAT_ASPECT_RATIOS,
  IMAGE_REFORMAT_PRESETS,
  type ImageReformatCompletedData,
  type ImageReformatMode,
  type ImageReformatPreset,
  type MediaAsset,
  type TransformOutputMode,
} from '@continuum/contracts';
import { Crop, Expand, Loader2, Scaling } from 'lucide-react';
import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { runImageReformat } from '@/lib/library/reformatImage';

const LABELS: Record<ImageReformatPreset, string> = {
  square: 'Square',
  portrait: 'Portrait',
  vertical: 'Vertical',
  landscape: 'Landscape',
};

type ReformatSourceAsset = Pick<MediaAsset, 'id' | 'kind' | 'signedUrl'>;

export function useQuickReformat({
  asset,
  brandId,
  onCompleted,
}: {
  asset: ReformatSourceAsset | null;
  brandId: string | null | undefined;
  onCompleted?(data: ImageReformatCompletedData, preset: ImageReformatPreset): void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const unavailable = !asset || !brandId || asset.kind !== 'image' || !asset.signedUrl;

  const reformat = useCallback(
    async (
      mode: ImageReformatMode,
      preset: ImageReformatPreset,
      outputMode: TransformOutputMode = 'derivative',
    ) => {
      if (unavailable || running || !asset || !brandId) return;
      const label = `${LABELS[preset]} · ${IMAGE_REFORMAT_ASPECT_RATIOS[preset]}`;
      setRunning(`${mode}:${preset}`);
      try {
        const result = await runImageReformat({
          request: {
            brandId,
            sourceAssetId: asset.id,
            requestId: crypto.randomUUID(),
            mode,
            preset,
            outputMode,
            ...(mode === 'crop' ? { focalPoint: { x: 0.5, y: 0.5 } } : {}),
          },
        });
        onCompleted?.(result.data, preset);
        toast.success(
          outputMode === 'new_version'
            ? `${label} saved as a new version`
            : `${label} saved to Library`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not create ${label}`);
      } finally {
        setRunning(null);
      }
    },
    [asset, brandId, onCompleted, running, unavailable],
  );

  return { reformat, running, unavailable };
}

export function QuickReformatMenu({
  asset,
  brandId,
  trigger,
  onCompleted,
}: {
  asset: ReformatSourceAsset;
  brandId: string;
  trigger: ReactElement;
  onCompleted?(data: ImageReformatCompletedData, preset: ImageReformatPreset): void;
}) {
  const { reformat, running, unavailable } = useQuickReformat({ asset, brandId, onCompleted });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Scaling className="size-3.5" />
          )}
          Reformat for placement
        </DropdownMenuLabel>
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          The original stays unchanged. Each selection creates a durable Library copy.
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={unavailable || Boolean(running)}>
            <Crop className="mr-2 size-3.5" /> Fast crop
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {IMAGE_REFORMAT_PRESETS.map((preset) => (
              <DropdownMenuItem key={preset} onSelect={() => void reformat('crop', preset)}>
                <span>{LABELS[preset]}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {IMAGE_REFORMAT_ASPECT_RATIOS[preset]}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={unavailable || Boolean(running)}>
            <Expand className="mr-2 size-3.5" /> Smart expand
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {IMAGE_REFORMAT_PRESETS.map((preset) => (
              <DropdownMenuItem key={preset} onSelect={() => void reformat('smart_expand', preset)}>
                <span>{LABELS[preset]}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {IMAGE_REFORMAT_ASPECT_RATIOS[preset]}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={unavailable || Boolean(running)}>
            Save crop as new version
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {IMAGE_REFORMAT_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset}
                onSelect={() => void reformat('crop', preset, 'new_version')}
              >
                <span>{LABELS[preset]}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {IMAGE_REFORMAT_ASPECT_RATIOS[preset]}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
