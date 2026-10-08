'use client';

/*
 * A creative is one image, one video, or a carousel of 2-10 ordered cards. Assets come
 * from the brand's Library — picked, uploaded into it first, or dropped on the node — so
 * every `mediaId` the canvas holds is a real `media.assets` row the save can resolve.
 * Placement itself lives in `useCreativeAssetPlacement`, shared with the node's drop.
 */

import type { MediaAsset } from '@continuum/contracts';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Film,
  GalleryHorizontal,
  GripVertical,
  ImageIcon,
  LibraryBig,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { LibraryMediaPickerDialog } from '@/components/library/editor/LibraryMediaPickerDialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { creativeGenerationPrompt, useCanvasJaina } from '../../canvasJaina';
import { type PickedAsset, useCreativeAssetPlacement } from '../../hooks/useCreativeAssetPlacement';
import {
  creativePreviewSources,
  unsignedCreativeAssetIds,
  useSignedCreativeUrls,
} from '../../nodes/CreativeNode';
import { useCampaignStore } from '../../stores/useCampaignStore';
import {
  CAROUSEL_MAX_CARDS,
  CAROUSEL_MIN_CARDS,
  type CampaignCanvasNodeMap,
  type CarouselCard,
  type CreativeAssetType,
} from '../../types';
import { ChipGroup, CommitInput, InspectorField, InspectorSection, isHttpUrl } from './fields';
import { NameField } from './NodeSections';

const FORMAT_OPTIONS: { value: CreativeAssetType; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'carousel', label: 'Carousel' },
];

const FILE_ACCEPT: Record<CreativeAssetType, string> = {
  image: 'image/*',
  video: 'video/*',
  carousel: 'image/*,video/*',
};

const pickedFromLibrary = (asset: MediaAsset): PickedAsset[] => {
  if (asset.kind !== 'image' && asset.kind !== 'video') return [];
  const thumbnailUrl = asset.thumbnailUrl ?? (asset.kind === 'image' ? asset.signedUrl : null);
  return [
    {
      id: asset.id,
      kind: asset.kind,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(asset.signedUrl ? { assetUrl: asset.signedUrl } : {}),
    },
  ];
};

function Thumb({
  kind,
  thumbnailUrl,
  assetUrl,
  className,
}: {
  kind: 'image' | 'video' | 'carousel';
  thumbnailUrl?: string;
  assetUrl?: string;
  className?: string;
}) {
  const Icon = kind === 'video' ? Film : kind === 'carousel' ? GalleryHorizontal : ImageIcon;
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {thumbnailUrl ? (
        // biome-ignore lint/performance/noImgElement: signed Supabase URLs are not routable through next/image
        <img src={thumbnailUrl} alt="" className="size-full object-cover" draggable={false} />
      ) : kind === 'video' && assetUrl ? (
        <video
          src={assetUrl}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <Icon className="size-5 opacity-40" aria-hidden />
        </span>
      )}
    </div>
  );
}

function CarouselCardRow({
  sortableId,
  card,
  signedUrl,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  sortableId: string;
  card: CarouselCard;
  signedUrl?: string;
  index: number;
  count: number;
  onChange: (patch: Partial<CarouselCard>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });
  const linkInvalid = Boolean(card.linkUrl) && !isHttpUrl(card.linkUrl ?? '');
  const position = index + 1;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="inspector-carousel-card"
      data-media-id={card.mediaId}
      className={cn(
        'flex gap-2 rounded-lg border border-border/70 bg-background p-2 transition-shadow',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <button
        type="button"
        aria-label={`Drag card ${position}`}
        className="flex w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <Thumb
        kind={card.kind}
        thumbnailUrl={card.thumbnailUrl ?? (card.kind === 'image' ? signedUrl : undefined)}
        assetUrl={signedUrl}
        className="size-14 shrink-0 rounded-md"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-2xs font-medium text-muted-foreground tabular-nums">
            Card {position} · {card.kind === 'video' ? 'Video' : 'Image'}
          </span>
          <div className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Move card up"
              disabled={index === 0}
              onClick={() => onMove(index - 1)}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Move card down"
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove card"
              className="text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </div>
        <CommitInput
          testId="inspector-carousel-card-headline"
          aria-label={`Card ${position} headline`}
          placeholder="Headline"
          maxLength={255}
          value={card.headline ?? ''}
          className="h-7 px-2 text-xs"
          onCommit={(next) => onChange({ headline: next.trim() || undefined })}
        />
        <CommitInput
          testId="inspector-carousel-card-link"
          aria-label={`Card ${position} link`}
          type="url"
          inputMode="url"
          placeholder="Link (defaults to the ad's)"
          value={card.linkUrl ?? ''}
          invalid={linkInvalid}
          className="h-7 px-2 text-xs"
          onCommit={(next) => onChange({ linkUrl: next.trim() || undefined })}
        />
        {linkInvalid ? (
          <p className="text-2xs text-destructive" role="alert">
            Enter a full URL, including https://
          </p>
        ) : null}
      </div>
    </li>
  );
}

function CarouselCards({ nodeId, cards }: { nodeId: string; cards: CarouselCard[] }) {
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  const signed = useSignedCreativeUrls(unsignedCreativeAssetIds({ cards }));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Positional ids, as the organic carousel strip uses: a card's identity IS its slot,
  // and the same asset may legitimately appear twice.
  const ids = cards.map((_, index) => `card-${index}`);
  const setCards = (next: CarouselCard[]) => updateNodeData(nodeId, { cards: next });

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setCards(arrayMove(cards, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  if (cards.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs leading-snug text-muted-foreground">
        No cards yet. Add {CAROUSEL_MIN_CARDS} to {CAROUSEL_MAX_CARDS} images or videos from the
        Library, or upload them.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2" aria-label="Carousel cards">
          {cards.map((card, index) => (
            <CarouselCardRow
              key={ids[index]}
              sortableId={ids[index]!}
              card={card}
              signedUrl={signed[card.mediaId]}
              index={index}
              count={cards.length}
              onChange={(patch) =>
                setCards(cards.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)))
              }
              onMove={(to) => setCards(arrayMove(cards, index, to))}
              onRemove={() => setCards(cards.filter((_, at) => at !== index))}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

export function CreativeSection({ node }: { node: CampaignCanvasNodeMap['creative'] }) {
  const { data } = node;
  const setCreativeFormat = useCampaignStore((store) => store.setCreativeFormat);
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const {
    brandId: activeBrandId,
    place: placeAssets,
    notice,
    uploads,
    uploadFiles,
  } = useCreativeAssetPlacement(node.id);
  const signed = useSignedCreativeUrls(unsignedCreativeAssetIds(data));
  const preview = creativePreviewSources(data, signed);
  const canvasJaina = useCanvasJaina();
  const isDirty = useCampaignStore((store) => store.isDirty);
  const feedsSavedAd = useCampaignStore(
    (store) =>
      creativeGenerationPrompt({
        nodes: store.nodes,
        edges: store.edges,
        hydration: store.hydration,
        creativeNodeId: node.id,
      }) !== null,
  );
  const generateBlockedBecause = isDirty
    ? 'Save first — Jaina fills the saved version.'
    : !feedsSavedAd
      ? 'Connect this creative to a saved ad first.'
      : null;

  const format = data.assetType ?? 'image';
  const cards = data.cards ?? [];

  const activeUploads = uploads.filter((upload) => upload.status !== 'done');

  const excludeAssetIds =
    format === 'carousel' ? cards.map((card) => card.mediaId) : data.mediaId ? [data.mediaId] : [];
  const carouselFull = format === 'carousel' && cards.length >= CAROUSEL_MAX_CARDS;

  return (
    <>
      <InspectorSection title="Creative">
        <NameField id={node.id} label={data.label} keptOnSave={false} />
        <InspectorField label="Format" hint="The ad this creative feeds takes the same format.">
          <ChipGroup
            testId="inspector-creative-format"
            label="Creative format"
            value={[format]}
            options={FORMAT_OPTIONS}
            onChange={([next]) => {
              if (next) setCreativeFormat(node.id, next);
            }}
          />
        </InspectorField>
      </InspectorSection>

      <InspectorSection
        title={format === 'carousel' ? 'Cards' : 'Asset'}
        aside={
          format === 'carousel' ? (
            <span
              className={cn(
                'text-2xs tabular-nums',
                cards.length < CAROUSEL_MIN_CARDS ? 'text-destructive' : 'text-muted-foreground',
              )}
              data-testid="inspector-carousel-count"
            >
              {cards.length} of {CAROUSEL_MAX_CARDS}
            </span>
          ) : null
        }
      >
        {format === 'carousel' ? (
          <>
            <CarouselCards nodeId={node.id} cards={cards} />
            {cards.length > 0 && cards.length < CAROUSEL_MIN_CARDS ? (
              <p className="text-2xs leading-snug text-destructive" role="alert">
                A carousel needs at least {CAROUSEL_MIN_CARDS} cards.
              </p>
            ) : null}
          </>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/70">
            <Thumb
              kind={format}
              thumbnailUrl={preview.thumbnailUrl}
              assetUrl={preview.assetUrl}
              className="aspect-video w-full"
            />
            <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2 text-xs">
              <span className={data.mediaId ? 'text-foreground' : 'text-muted-foreground'}>
                {data.mediaId
                  ? format === 'video'
                    ? 'Video attached'
                    : 'Image attached'
                  : `No ${format} yet`}
              </span>
              {data.mediaId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    updateNodeData(node.id, {
                      mediaId: undefined,
                      thumbnailUrl: undefined,
                      assetUrl: undefined,
                    })
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="inspector-creative-upload"
            disabled={!activeBrandId || carouselFull}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload aria-hidden />
            Upload
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="inspector-creative-library"
            disabled={!activeBrandId || carouselFull}
            onClick={() => setLibraryOpen(true)}
          >
            <LibraryBig aria-hidden />
            From library
          </Button>
        </div>
        {canvasJaina ? (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="inspector-creative-generate"
              disabled={Boolean(generateBlockedBecause)}
              onClick={() => canvasJaina.generateForCreative(node.id)}
            >
              <Sparkles aria-hidden />
              Generate with Jaina
            </Button>
            <p className="text-2xs leading-snug text-muted-foreground">
              {generateBlockedBecause ??
                "Made from this ad's copy and attached to it. Spend waits for your approval."}
            </p>
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          data-testid="inspector-creative-file-input"
          accept={FILE_ACCEPT[format]}
          multiple={format === 'carousel'}
          onChange={(event) => {
            void uploadFiles(event.target.files);
            event.target.value = '';
          }}
        />

        {activeUploads.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Uploads">
            {activeUploads.map((upload) => (
              <li key={upload.id} className="flex flex-col gap-1 text-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-foreground">{upload.name}</span>
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      upload.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {upload.status === 'error'
                      ? (upload.error ?? 'Upload failed')
                      : `${Math.round(upload.progress)}%`}
                  </span>
                </div>
                {upload.status === 'error' ? null : (
                  <Progress value={upload.progress} className="h-1" />
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {notice ? (
          <p className="text-2xs leading-snug text-destructive" role="alert">
            {notice}
          </p>
        ) : null}
      </InspectorSection>

      {activeBrandId ? (
        <LibraryMediaPickerDialog
          brandId={activeBrandId}
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          accept={format === 'image' ? 'image' : 'media'}
          excludeAssetIds={excludeAssetIds}
          onPickAssets={(assets) => placeAssets(assets.flatMap(pickedFromLibrary))}
        />
      ) : null}
    </>
  );
}
