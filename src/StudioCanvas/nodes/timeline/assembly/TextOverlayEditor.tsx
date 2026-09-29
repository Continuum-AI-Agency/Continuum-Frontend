'use client';

import type { EditorProjectV2, EditorTextClip, EditorTrack } from '@continuum/contracts';
import { Plus, Trash2, Type } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { Input } from '@/components/ui/input';
import { NumberScrubField } from '@/components/ui/number-field';
import { SliderField } from '@/components/ui/slider-field';
import {
  type EditorAssemblyOperation,
  removeClipOperation,
  upsertTextOperation,
} from '../editorProjectV2AssemblyModel';

type TextTrack = Extract<EditorTrack, { kind: 'text' }>;

export function TextOverlayEditor({
  project,
  textTrack,
  playheadSec,
  onApply,
}: {
  project: EditorProjectV2;
  textTrack?: TextTrack;
  playheadSec: number;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const [draft, setDraft] = useState('');
  const addText = () => {
    if (!draft.trim()) return;
    onApply(
      upsertTextOperation(project, {
        text: draft,
        timelineStartSec: playheadSec,
        durationSec: Math.min(3, Math.max(0.1, project.durationSec - playheadSec)),
      }),
    );
    setDraft('');
  };

  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2">
        <Type className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold">Text overlays</h3>
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add text at the playhead"
          className="h-8 text-xs"
          onKeyDown={(event) => {
            if (event.key === 'Enter') addText();
          }}
        />
        <Button size="sm" className="h-8" onClick={addText} disabled={!draft.trim()}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {(textTrack?.clips ?? []).map((clip) => (
          <TextOverlayRow
            key={clip.id}
            project={project}
            trackId={textTrack?.id as string}
            clip={clip}
            onApply={onApply}
          />
        ))}
        {!textTrack?.clips.length ? (
          <p className="rounded-md border border-dashed p-3 text-center text-2xs text-muted-foreground">
            No text overlays yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function TextOverlayRow({
  project,
  trackId,
  clip,
  onApply,
}: {
  project: EditorProjectV2;
  trackId: string;
  clip: EditorTextClip;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const colorInputId = useId();
  const [text, setText] = useState(clip.text);
  const [start, setStart] = useState(clip.timelineStartSec);
  const [duration, setDuration] = useState(clip.durationSec);
  const [fontSize, setFontSize] = useState(clip.style.fontSizePx);
  const [color, setColor] = useState(clip.style.color);
  const [x, setX] = useState(clip.transform.position.x);
  const [y, setY] = useState(clip.transform.position.y);
  const [animationIn, setAnimationIn] = useState(clip.animationIn ?? 'none');
  const [animationOut, setAnimationOut] = useState(clip.animationOut ?? 'none');
  useEffect(() => {
    setText(clip.text);
    setStart(clip.timelineStartSec);
    setDuration(clip.durationSec);
    setFontSize(clip.style.fontSizePx);
    setColor(clip.style.color);
    setX(clip.transform.position.x);
    setY(clip.transform.position.y);
    setAnimationIn(clip.animationIn ?? 'none');
    setAnimationOut(clip.animationOut ?? 'none');
  }, [clip]);
  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-8 text-xs"
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberScrubField
          min={0}
          step={0.1}
          label="At"
          value={start}
          max={project.durationSec}
          onChange={setStart}
        />
        <NumberScrubField
          step={0.1}
          label="Duration"
          value={duration}
          min={0.1}
          onChange={setDuration}
        />
        <NumberScrubField
          label="Size"
          value={fontSize}
          min={1}
          max={2000}
          step={1}
          onChange={setFontSize}
        />
        <div className="space-y-1 text-3xs text-muted-foreground">
          <span>Color</span>
          <ColorField id={colorInputId} label="Text" value={color} onChange={setColor} />
        </div>
        <SliderField
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          label="X"
          max={1}
          min={0}
          step={0.05}
          value={x}
          onChange={setX}
        />
        <SliderField
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          label="Y"
          max={1}
          min={0}
          step={0.05}
          value={y}
          onChange={setY}
        />
        <label className="space-y-1 text-3xs text-muted-foreground">
          <span>Animate in</span>
          <select
            aria-label="Animate text in"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={animationIn}
            onChange={(event) => setAnimationIn(event.target.value)}
          >
            <option value="none">None</option>
            <option value="pop">Pop</option>
            <option value="scaleIn">Scale in</option>
            <option value="floatIn">Float in</option>
          </select>
        </label>
        <label className="space-y-1 text-3xs text-muted-foreground">
          <span>Animate out</span>
          <select
            aria-label="Animate text out"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={animationOut}
            onChange={(event) => setAnimationOut(event.target.value)}
          >
            <option value="none">None</option>
            <option value="pop">Pop</option>
            <option value="scaleIn">Scale out</option>
            <option value="floatIn">Float out</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onApply(removeClipOperation(project, trackId, clip.id))}
          aria-label="Delete text overlay"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!text.trim()}
          onClick={() =>
            onApply(
              upsertTextOperation(project, {
                clipId: clip.id,
                text,
                timelineStartSec: start,
                durationSec: duration,
                fontSizePx: fontSize,
                color,
                x,
                y,
                animationIn: animationIn as 'none' | 'pop' | 'scaleIn' | 'floatIn',
                animationOut: animationOut as 'none' | 'pop' | 'scaleIn' | 'floatIn',
              }),
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
