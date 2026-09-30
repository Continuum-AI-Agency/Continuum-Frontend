'use client';

import {
  TEXT_TEMPLATE_IDS,
  TEXT_TEMPLATES,
  type TextTemplateId,
  textTemplateIdSchema,
} from '@continuum/contracts';
import { useId, useMemo, useState } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TextPreviewCanvas } from './TextPreviewCanvas';
import { type TemplateLines, templateLines, templatePreviewLayers } from './textPreview';

/** `dataTransfer` type for dragging a text template onto the timeline. */
export const TEXT_TEMPLATE_DRAG_TYPE = 'application/x-continuum-text-template';

const templatePlacementSchema = z.object({
  template: textTemplateIdSchema,
  text: z.string().trim().min(1).max(500),
  secondaryText: z.string().trim().min(1).max(300).optional(),
});
export type TemplatePlacement = z.infer<typeof templatePlacementSchema>;

/** A dragged template, validated: the payload crosses a drag boundary like any other input. */
export function readTemplateDrag(transfer: DataTransfer): TemplatePlacement | null {
  const payload = transfer.getData(TEXT_TEMPLATE_DRAG_TYPE);
  if (!payload) return null;
  try {
    const parsed = templatePlacementSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function TemplateCard({
  templateId,
  lines,
  aspect,
  onPlace,
}: {
  templateId: TextTemplateId;
  lines: TemplateLines;
  aspect: number;
  onPlace: (placement: TemplatePlacement) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const template = TEXT_TEMPLATES[templateId];
  const { text, secondaryText } = templateLines(templateId, lines);
  const layers = useMemo(
    () => templatePreviewLayers(templateId, { text, secondaryText }),
    [templateId, text, secondaryText],
  );
  const placement: TemplatePlacement = {
    template: templateId,
    text,
    ...(secondaryText ? { secondaryText } : {}),
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            draggable
            data-text-template={templateId}
            aria-label={`Add ${template.label}`}
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/60 p-1 text-left transition-colors hover:border-primary/60 focus-visible:border-primary focus-visible:outline-none active:scale-[0.98]"
            onClick={() => onPlace(placement)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(TEXT_TEMPLATE_DRAG_TYPE, JSON.stringify(placement));
            }}
            onPointerEnter={() => setPlaying(true)}
            onPointerLeave={() => setPlaying(false)}
            onFocus={() => setPlaying(true)}
            onBlur={() => setPlaying(false)}
          />
        }
      >
        <TextPreviewCanvas
          layers={layers}
          durationSec={template.defaultDurationSec}
          aspect={aspect}
          playing={playing}
          restSec={template.defaultDurationSec * 0.6}
          label={`${template.label} preview`}
        />
        <span className="truncate px-0.5 text-2xs font-medium">{template.label}</span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-56">
        {template.description}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Left dock, Text tab: every text template as a card drawn by the export's own caption
 * renderer, playing on hover. Click places one at the playhead; drag drops it at a time.
 * The lines typed here fill every card, so what you see is the text you will get.
 */
export function TextTemplateShelf({
  aspect,
  onPlace,
}: {
  aspect: number;
  onPlace: (placement: TemplatePlacement) => void;
}) {
  const ids = useId();
  const [text, setText] = useState('');
  const [secondaryText, setSecondaryText] = useState('');
  const lines = useMemo(() => ({ text, secondaryText }), [text, secondaryText]);
  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2"
      data-testid="text-shelf"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-line`} className="text-2xs">
          Line
        </Label>
        <Input
          id={`${ids}-line`}
          value={text}
          placeholder="Type your line — every card previews it"
          className="h-8 text-xs"
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
        />
        <Input
          aria-label="Second line"
          value={secondaryText}
          placeholder="Second line: a name, a label, a source"
          className="h-8 text-xs"
          maxLength={300}
          onChange={(event) => setSecondaryText(event.target.value)}
        />
      </div>
      <p className="text-2xs text-muted-foreground">
        Click to add at the playhead, or drag onto the timeline.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
        {TEXT_TEMPLATE_IDS.map((templateId) => (
          <TemplateCard
            key={templateId}
            templateId={templateId}
            lines={lines}
            aspect={aspect}
            onPlace={onPlace}
          />
        ))}
      </div>
    </div>
  );
}
