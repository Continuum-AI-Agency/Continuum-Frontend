'use client';

import type { InstagramMediaItem, InstagramPost } from '@continuum/contracts';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}) => (
  <button
    type="button"
    aria-label={`Toggle slide ${index + 1}`}
    aria-pressed={isSelected}
    onClick={() => onToggle(index)}
    className={`relative aspect-square overflow-hidden rounded-md border transition ${
      isSelected ? 'ring-2 ring-primary' : 'opacity-50'
    }`}
  >
    {item.kind === 'video' ? (
      <video src={item.url} className="h-full w-full object-cover" muted />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.url} alt={`slide ${index + 1}`} className="h-full w-full object-cover" />
    )}
  </button>
);

export function InstagramSlidePicker({
  post,
  selected,
  onToggle,
  onBack,
  onAdd,
}: InstagramSlidePickerProps) {
  const selectedCount = post.items.filter((_, index) => selected.has(index)).length;

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="ghost" size="sm" className="w-fit px-1" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to results
      </Button>

      {post.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">This post has no importable media.</p>
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
        Add {selectedCount || ''} to canvas
      </Button>
    </div>
  );
}
