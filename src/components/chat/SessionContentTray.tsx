'use client';

import { FileText, Layers } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import { cn } from '@/lib/utils';

// PromptInput accepts a drop carrying this type and turns it into a reference chip, so anything
// draggable can become a pointer into the next turn — not only this tray's tiles.
export const MENTION_DRAG_TYPE = 'application/vnd.continuum.mention+json';

type Props = {
  items: AgentMentionSuggestion[];
  onInsert: (item: AgentMentionSuggestion) => void;
};

/** Everything the agent generated in this session, each one a click or a drag away from the composer. */
export function SessionContentTray({ items, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  // The tray opens over the composer it feeds, so while a tile is in flight it lets the drag
  // through to the editor underneath instead of catching the drop itself.
  const [dragging, setDragging] = useState(false);
  if (items.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Content generated in this session"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Layers className="h-3.5 w-3.5" />
            Session
            <span className="rounded bg-muted px-1 text-2xs tabular-nums">{items.length}</span>
          </button>
        }
      />
      <PopoverContent
        align="start"
        side="top"
        className={cn('w-80 p-2 transition-opacity', dragging && 'pointer-events-none opacity-30')}
      >
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          Click or drag into the message to reference it.
        </p>
        <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(MENTION_DRAG_TYPE, JSON.stringify(item));
                  event.dataTransfer.effectAllowed = 'copy';
                  // Chrome aborts a drag whose source restyles inside dragstart itself.
                  requestAnimationFrame(() => setDragging(true));
                }}
                onDragEnd={(event) => {
                  setDragging(false);
                  if (event.dataTransfer.dropEffect !== 'none') setOpen(false);
                }}
                onClick={() => {
                  onInsert(item);
                  setOpen(false);
                }}
                title={[item.label, item.description].filter(Boolean).join('\n')}
                className="group flex w-full cursor-grab flex-col gap-1 rounded-md text-left active:cursor-grabbing"
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/40 group-hover:border-primary/60">
                  {item.preview?.url && item.preview.kind === 'video' ? (
                    <video src={item.preview.url} muted className="h-full w-full object-cover" />
                  ) : item.preview?.url ? (
                    // biome-ignore lint/performance/noImgElement: signed storage URLs, not next/image-optimizable
                    <img
                      src={item.preview.url}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                </span>
                <span className="line-clamp-2 text-2xs leading-tight">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
