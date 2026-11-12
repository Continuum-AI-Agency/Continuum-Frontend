'use client';

import type { InstagramMediaItem, InstagramPost } from '@continuum/contracts';
import { ArrowLeft } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { setInstagramMediaDragData } from './instagramMediaDrag';

interface InstagramSlidePickerProps {
  post: InstagramPost;
  selected: Set<number>;
  onToggle: (index: number) => void;
  onBack: () => void;
  onAdd: () => void;
}

const SlideTile = ({
  item,
  index,
  isSelected,
  onToggle,
}: {
  item: InstagramMediaItem;
  index: number;
  isSelected: boolean;
  onToggle: (index: number) => void;
}) => {
  const translateUi = useUiTranslations('studio');
  return (
    <button
      type="button"
      aria-label={translateUi('toggle_slide_value0_87d0ac77', {
        value0: String(index + 1),
      })}
      aria-pressed={isSelected}
      onClick={() => onToggle(index)}
      // Only stills are draggable: a video reference cannot be inlined through the
      // image proxy, so a dragged clip would land as a dead node. Videos still
      // reach the canvas through "Add to canvas".
      draggable={item.kind === 'image'}
      onDragStart={(event) => {
        if (item.kind !== 'image') return;
        setInstagramMediaDragData(event.dataTransfer, item.url);
      }}
      className={`relative aspect-square overflow-hidden rounded-md border transition ${
        isSelected ? 'ring-2 ring-primary' : 'opacity-50'
      }`}
    >
      {item.kind === 'video' ? (
        <video src={item.url} className="h-full w-full object-cover" muted />
      ) : (
        // draggable={false} so the tile button owns the drag: a natively draggable
        // <img> starts its own drag with the browser's default payload instead.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={translateUi('slide_value0_b7c2917b', {
            value0: String(index + 1),
          })}
          draggable={false}
          className="h-full w-full object-cover"
        />
      )}
    </button>
  );
};

export function InstagramSlidePicker({
  post,
  selected,
  onToggle,
  onBack,
  onAdd,
}: InstagramSlidePickerProps) {
  const translateUi = useUiTranslations('studio');

  const selectedCount = post.items.filter((_, index) => selected.has(index)).length;

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="ghost" size="sm" className="w-fit px-1" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> {translateUi('back_to_results_c7ef0e27')}{' '}
      </Button>

      {post.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translateUi('this_post_has_no_importable_media_ede0de5c')}
        </p>
      ) : (
        <div className="grid max-h-[260px] grid-cols-3 gap-2 overflow-y-auto">
          {post.items.map((item, index) => (
            <SlideTile
              key={`${item.url}-${index}`}
              item={item}
              index={index}
              isSelected={selected.has(index)}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}

      <Button type="button" onClick={onAdd} disabled={selectedCount === 0}>
        {' '}
        {translateUi('add_9fd728c6')} {selectedCount || ''} {translateUi('to_canvas_6e332ed5')}{' '}
      </Button>
    </div>
  );
}
