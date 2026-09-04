'use client';

import type { Skill } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Type, Wand2 } from 'lucide-react';
import type { BrandBookPiecePresentation } from '@/lib/brands/generationConfigPresentation';
import { getCreativeAssetsBucket } from '@/lib/creative-assets/config';
import { createSignedAssetUrl } from '@/lib/creative-assets/storageClient';
import { cn } from '@/lib/utils';
import { resolveBrandLogoSource } from '@/StudioCanvas/utils/actions/overlayPresets';

type Size = 'row' | 'card';

const frameClass = (size: Size): string =>
  cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/45 text-muted-foreground',
    size === 'row' ? 'h-9 w-11' : 'h-14 w-16',
  );

function BrandLogoPreview({ storagePath, size }: { storagePath: string; size: Size }) {
  const bucket = getCreativeAssetsBucket();
  const source = resolveBrandLogoSource({ logo: { storage_path: storagePath } }, bucket);
  const query = useQuery({
    queryKey: ['brand-book-logo-preview', source],
    queryFn: () =>
      source.status !== 'ready'
        ? Promise.resolve(null)
        : source.source === 'url'
          ? Promise.resolve(source.url)
          : createSignedAssetUrl(source.storagePath, 3600, source.bucket),
    enabled: source.status === 'ready',
    staleTime: 55 * 60_000,
    retry: false,
  });

  return (
    <div className={frameClass(size)} role="img" aria-label="Brand logo preview">
      {query.data ? (
        // biome-ignore lint/performance/noImgElement: transient signed Brand Book asset
        <img src={query.data} alt="" className="size-full object-contain p-1" />
      ) : (
        <BookOpen className="size-4" aria-hidden />
      )}
    </div>
  );
}

export function BrandBookPiecePreview({
  presentation,
  size = 'row',
}: {
  presentation: BrandBookPiecePresentation;
  size?: Size;
}) {
  const preview = presentation.preview;
  if (preview.kind === 'logo') {
    return <BrandLogoPreview storagePath={preview.storagePath} size={size} />;
  }

  if (preview.kind === 'palette') {
    return (
      <div
        className={cn(frameClass(size), 'grid grid-flow-col auto-cols-fr')}
        role="img"
        aria-label={`Brand colors: ${preview.values.join(', ')}`}
      >
        {preview.values.slice(0, 5).map((value) => (
          <span key={value} className="h-full" style={{ backgroundColor: value }} />
        ))}
      </div>
    );
  }

  if (preview.kind === 'typography') {
    return (
      <div className={cn(frameClass(size), 'gap-1 px-1.5')} title={preview.value}>
        <Type className="size-3.5" aria-hidden />
        <span className="max-w-10 truncate text-[0.6rem] font-medium">{preview.value}</span>
      </div>
    );
  }

  if (preview.kind === 'book') {
    return (
      <div
        className={cn(frameClass(size), 'relative bg-background')}
        role="img"
        aria-label={`${preview.brandName} Brand Book preview`}
      >
        {preview.colors.length > 0 ? (
          <span className="absolute inset-x-0 bottom-0 flex h-1.5">
            {preview.colors.slice(0, 5).map((value) => (
              <span key={value} className="flex-1" style={{ backgroundColor: value }} />
            ))}
          </span>
        ) : null}
        <BookOpen className="size-4" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn(frameClass(size), 'px-1.5')} title={preview.value}>
      <span className="line-clamp-2 text-center text-[0.6rem] leading-tight">{preview.value}</span>
    </div>
  );
}

export function SkillConfigPreview({ skill, size = 'row' }: { skill: Skill; size?: Size }) {
  return (
    <div
      className={cn(frameClass(size), 'flex-col gap-0.5 px-1')}
      role="img"
      aria-label={`${skill.name} skill config`}
    >
      <Wand2 className="size-3.5" aria-hidden />
      {skill.tags[0] ? (
        <span className="max-w-full truncate text-[0.55rem] leading-none">{skill.tags[0]}</span>
      ) : null}
    </div>
  );
}
