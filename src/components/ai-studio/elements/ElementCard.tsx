'use client';

import type { ElementRecord } from '@continuum/contracts';
import { Layers } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { buildElementDragPayload, ELEMENT_DRAG_TYPE } from '@/lib/ai-studio/referenceDrop';

export function ElementCard({
  element,
  previewUrl,
  onSelect,
}: {
  element: ElementRecord;
  previewUrl?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={<button type="button" />}
        draggable
        data-testid={`element-card-${element.id}`}
        onClick={() => onSelect(element.id)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(
            ELEMENT_DRAG_TYPE,
            buildElementDragPayload({
              elementId: element.id,
              name: element.name,
              category: element.category,
              previewUrl,
            }),
          );
        }}
        className="flex w-full flex-col overflow-hidden border border-border bg-background text-left focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="flex aspect-video w-full items-center justify-center bg-muted/30">
          {previewUrl ? (
            <img src={previewUrl} alt={element.name} className="h-full w-full object-cover" />
          ) : (
            <Layers className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="w-full truncate px-2 py-1.5 text-xs">{element.name}</div>
        {!element.defaultReferenceAssetId && !element.members.length ? (
          <span className="px-2 pb-2 text-xs text-muted-foreground">Needs sheet</span>
        ) : null}
      </HoverCardTrigger>
      <HoverCardContent className="rounded-lg shadow-none">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="mb-3 aspect-video w-full object-cover" />
        ) : null}
        <p className="text-sm font-medium">{element.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reusable {element.category} · Saved to your library
        </p>
        {element.facts?.map((fact) => (
          <p key={fact.label} className="mt-2 text-xs">
            {fact.label}: {fact.value}
          </p>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">
          Open to view or edit. Drag into the canvas to reuse.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
