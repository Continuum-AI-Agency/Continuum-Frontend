'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_CAPTION_STYLE,
  resolveCaptionStyle,
  type CaptionStyle,
  type CaptionStyleOverride,
} from '@/lib/clips/clipCaptionStyle';
import {
  captionCueText,
  type CaptionCue,
  updateCaptionCue,
} from '../../utils/splice/captionCues';

type Props = {
  cues: CaptionCue[];
  selectedId?: string;
  style?: CaptionStyle;
  onSelect: (id: string) => void;
  onChangeCues: (cues: CaptionCue[]) => void;
  onChangeStyle: (style: CaptionStyle) => void;
};

function number(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampFraction(value: number): number {
  return Math.max(0.05, Math.min(0.95, value));
}

export function CaptionEditor({
  cues,
  selectedId,
  style,
  onSelect,
  onChangeCues,
  onChangeStyle,
}: Props) {
  const selected = cues.find((cue) => cue.id === selectedId) ?? cues[0];
  const globalStyle = resolveCaptionStyle(style);
  const resolvedSelectedStyle = resolveCaptionStyle(style, selected?.style);
  const updateSelected = (patch: Parameters<typeof updateCaptionCue>[1]) => {
    if (!selected) return;
    onChangeCues(cues.map((cue) => (cue.id === selected.id ? updateCaptionCue(cue, patch) : cue)));
  };
  const updateSelectedStyle = (patch: CaptionStyleOverride) => {
    if (!selected) return;
    updateSelected({ style: { ...selected.style, ...patch } });
  };

  const cueRows = useMemo(
    () => cues.map((cue) => ({ cue, text: captionCueText(cue) })),
    [cues],
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold">Captions</h3>
          <p className="text-2xs text-muted-foreground">Edit copy, timing, placement, and colors.</p>
        </div>
        <span className="text-2xs tabular-nums text-muted-foreground">{cues.length} cues</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-2xs">
        <label className="grid gap-1">
          Text
          <input
            type="color"
            value={globalStyle.textColor}
            onChange={(event) => onChangeStyle({ ...globalStyle, textColor: event.target.value })}
          />
        </label>
        <label className="grid gap-1">
          Highlight
          <input
            type="color"
            value={globalStyle.highlightColor}
            onChange={(event) => onChangeStyle({ ...globalStyle, highlightColor: event.target.value })}
          />
        </label>
        <label className="grid gap-1">
          X position
          <input
            className="h-7 rounded border border-border bg-background px-2"
            type="number"
            min="0.05"
            max="0.95"
            step="0.01"
            value={globalStyle.position?.xFrac ?? DEFAULT_CAPTION_STYLE.position?.xFrac}
            onChange={(event) =>
              onChangeStyle({
                ...globalStyle,
                position: {
                  ...globalStyle.position!,
                  xFrac: clampFraction(number(event.target.value, globalStyle.position!.xFrac)),
                },
              })
            }
          />
        </label>
        <label className="grid gap-1">
          Y position
          <input
            className="h-7 rounded border border-border bg-background px-2"
            type="number"
            min="0.05"
            max="0.95"
            step="0.01"
            value={globalStyle.position?.yFrac ?? DEFAULT_CAPTION_STYLE.position?.yFrac}
            onChange={(event) =>
              onChangeStyle({
                ...globalStyle,
                position: {
                  ...globalStyle.position!,
                  yFrac: clampFraction(number(event.target.value, globalStyle.position!.yFrac)),
                },
              })
            }
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60">
        {cueRows.map(({ cue, text }) => (
          <button
            key={cue.id}
            type="button"
            className={`block w-full border-b border-border/50 px-2 py-2 text-left text-xs last:border-b-0 ${cue.id === selected?.id ? 'bg-primary/10' : 'hover:bg-muted/60'}`}
            onClick={() => onSelect(cue.id)}
          >
            <span className="mr-2 font-mono text-2xs text-muted-foreground">
              {cue.startSec.toFixed(1)}–{cue.endSec.toFixed(1)}
            </span>
            {text}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="grid gap-2 border-t border-border/60 pt-3 text-2xs">
          <label className="grid gap-1">
            Caption copy
            <textarea
              className="min-h-16 resize-y rounded border border-border bg-background p-2 text-xs"
              value={captionCueText(selected)}
              onChange={(event) => updateSelected({ text: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              Start
              <input
                className="h-7 rounded border border-border bg-background px-2"
                type="number"
                step="0.1"
                min="0"
                value={selected.startSec}
                onChange={(event) => updateSelected({ startSec: number(event.target.value, selected.startSec) })}
              />
            </label>
            <label className="grid gap-1">
              End
              <input
                className="h-7 rounded border border-border bg-background px-2"
                type="number"
                step="0.1"
                min="0"
                value={selected.endSec}
                onChange={(event) => updateSelected({ endSec: number(event.target.value, selected.endSec) })}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              Cue text
              <input
                type="color"
                value={resolvedSelectedStyle.textColor}
                onChange={(event) => updateSelectedStyle({ textColor: event.target.value })}
              />
            </label>
            <label className="grid gap-1">
              Cue highlight
              <input
                type="color"
                value={resolvedSelectedStyle.highlightColor}
                onChange={(event) => updateSelectedStyle({ highlightColor: event.target.value })}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => updateSelected({ style: undefined })}>
              Reset cue style
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
