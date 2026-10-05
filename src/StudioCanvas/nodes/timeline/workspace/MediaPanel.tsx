'use client';

import type { EditorProjectV2, VideoEditorPoolAsset } from '@continuum/contracts';
import { AudioLines, Film, Image as ImageIcon, Loader2, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import { LibraryMediaPickerDialog } from '@/components/library/editor/LibraryMediaPickerDialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { VIDEO_STUDIO_ASSET_DRAG_TYPE } from '@/components/video-studio/types';
import { libraryVersionKey } from '../useClipPreviewUrls';
import { IMPORTABLE_MEDIA, poolAssetFromLibrary } from './importMedia';
import { RecordMenu } from './RecordMenu';

export type ImportInFlight = { id: string; name: string };

const KIND_ICON = { video: Film, image: ImageIcon, audio: AudioLines } as const;

/** Every Library asset the timeline references, deduped, plus what this session imported. */
export function projectSources(
  project: EditorProjectV2,
  imported: readonly VideoEditorPoolAsset[],
): VideoEditorPoolAsset[] {
  const byVersion = new Map(
    imported.map(
      (asset) => [libraryVersionKey(asset.assetId, asset.versionId ?? ''), asset] as const,
    ),
  );
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (!('source' in clip) || clip.source.sourceType !== 'library_asset') continue;
      const key = libraryVersionKey(clip.source.assetId, clip.source.renditionId ?? '');
      if (byVersion.has(key)) continue;
      byVersion.set(key, {
        assetId: clip.source.assetId,
        ...(clip.source.renditionId ? { versionId: clip.source.renditionId } : {}),
        kind:
          clip.kind === 'audio'
            ? 'audio'
            : clip.kind === 'overlay' && clip.mediaKind === 'image'
              ? 'image'
              : 'video',
        title: clip.name ?? 'Clip',
        origin: 'project',
      });
    }
  }
  return [...byVersion.values()];
}

function AssetPreview({ asset, url }: { asset: VideoEditorPoolAsset; url?: string }) {
  if (!url)
    return (
      <div className="flex h-24 items-center justify-center rounded bg-muted text-2xs">
        No preview
      </div>
    );
  if (asset.kind === 'image') {
    // biome-ignore lint/performance/noImgElement: signed Library rendition in a hover preview
    return <img src={url} alt="" className="max-h-40 w-full rounded object-contain" />;
  }
  if (asset.kind === 'audio') {
    // biome-ignore lint/a11y/useMediaCaption: audio audition has no visual content.
    return <audio src={url} controls className="h-8 w-full" />;
  }
  return (
    <video
      src={url}
      muted
      playsInline
      autoPlay
      loop
      className="max-h-40 w-full rounded bg-black object-contain"
    />
  );
}

/** Left dock, Media tab: the edit's sources, Library picks, uploads and recordings. */
export function MediaPanel({
  brandId,
  assets,
  previewUrlFor,
  importing,
  onImportFiles,
  onAddAsset,
}: {
  brandId: string;
  assets: readonly VideoEditorPoolAsset[];
  previewUrlFor: (asset: VideoEditorPoolAsset) => string | undefined;
  importing: readonly ImportInFlight[];
  onImportFiles: (files: File[]) => void;
  onAddAsset: (asset: VideoEditorPoolAsset, options?: { newTrack?: boolean }) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="size-3.5" /> Import
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={IMPORTABLE_MEDIA}
          className="hidden"
          aria-label="Import media files"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length > 0) onImportFiles(files);
          }}
        />
        <RecordMenu onRecorded={(file) => onImportFiles([file])} />
        <LibraryMediaPickerDialog
          brandId={brandId}
          excludeAssetIds={assets.map((asset) => asset.assetId)}
          onPickAssets={(picked) =>
            picked
              .flatMap((asset) => poolAssetFromLibrary(asset) ?? [])
              .forEach((asset) => onAddAsset(asset))
          }
        />
      </div>
      {importing.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-2xs text-muted-foreground"
        >
          <Loader2 className="size-3 animate-spin" /> Uploading {file.name}…
        </div>
      ))}
      {assets.length === 0 && importing.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-2xs text-muted-foreground">
          Drop files anywhere in the editor, record, or pick from the Library.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {assets.map((asset) => {
          const Icon = KIND_ICON[asset.kind];
          const url = previewUrlFor(asset);
          return (
            <ContextMenu key={libraryVersionKey(asset.assetId, asset.versionId ?? '')}>
              <HoverCard openDelay={500}>
                <ContextMenuTrigger
                  render={
                    <HoverCardTrigger
                      render={
                        // biome-ignore lint/a11y/noStaticElementInteractions: drag source; its Add button is the keyboard path.
                        <div
                          draggable
                          data-bin-asset={asset.assetId}
                          data-bin-version={asset.versionId}
                          className="group relative flex aspect-video cursor-grab flex-col justify-end overflow-hidden rounded-md border border-border/60 bg-muted/40"
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              VIDEO_STUDIO_ASSET_DRAG_TYPE,
                              JSON.stringify(asset),
                            );
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                        />
                      }
                    />
                  }
                >
                  {asset.kind === 'image' && url ? (
                    // biome-ignore lint/performance/noImgElement: signed Library rendition thumbnail
                    <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : asset.kind === 'video' && url ? (
                    <video
                      src={`${url}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <Icon className="absolute inset-0 m-auto size-6 text-muted-foreground" />
                  )}
                  <div className="relative flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1 text-3xs text-white">
                    <Icon className="size-3 shrink-0" />
                    <span className="truncate">{asset.title}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label={`Add ${asset.title} at the playhead`}
                    className="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onAddAsset(asset)}
                  >
                    <Plus className="size-3" />
                  </Button>
                </ContextMenuTrigger>
                <HoverCardContent className="w-64 space-y-2 p-3">
                  <AssetPreview asset={asset} url={url} />
                  <p className="truncate text-xs font-medium">{asset.title}</p>
                  <p className="text-2xs text-muted-foreground">
                    {asset.kind}
                    {asset.durationSec ? ` · ${asset.durationSec.toFixed(1)}s` : ''}
                  </p>
                </HoverCardContent>
              </HoverCard>
              <ContextMenuContent className="w-52">
                <ContextMenuItem onClick={() => onAddAsset(asset)}>
                  <Plus /> Add at playhead
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onAddAsset(asset, { newTrack: true })}>
                  <Plus /> Add on a new track
                </ContextMenuItem>
                <ContextMenuItem
                  render={
                    <Link
                      href={`/library?assetId=${encodeURIComponent(asset.assetId)}`}
                      target="_blank"
                    />
                  }
                >
                  Open in Library
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
