'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumberScrubField } from '@/components/ui/number-field';
import { SliderField } from '@/components/ui/slider-field';
import {
  applyCaptionPreset,
  CAPTION_PRESETS,
  resolveCaptionPreset,
  resolveStyleWithPreset,
} from '@/lib/clips/captionPresets';
import { parseCaptionFile, toSrt, toVtt } from '@/lib/clips/captionsInterchange';
import type { CaptionStyle, CaptionStyleOverride } from '@/lib/clips/clipCaptionStyle';
import { resolveCaptionStyle } from '@/lib/clips/clipCaptionStyle';
import {
  type CaptionCue,
  captionCueText,
  setWordEmphasis,
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

function clampFraction(value: number): number {
  return Math.max(0.05, Math.min(0.95, value));
}

function download(filename: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CaptionEditor({
  cues,
  selectedId,
  style,
  onSelect,
  onChangeCues,
  onChangeStyle,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notices, setNotices] = useState<string[]>([]);

  const selected = cues.find((cue) => cue.id === selectedId) ?? cues[0];
  const globalStyle = resolveCaptionStyle(style);
  const resolvedSelectedStyle = resolveCaptionStyle(style, selected?.style);
  const activePresetId = resolveCaptionPreset(style?.presetId).id;

  const updateSelected = (patch: Parameters<typeof updateCaptionCue>[1]) => {
    if (!selected) return;
    onChangeCues(cues.map((cue) => (cue.id === selected.id ? updateCaptionCue(cue, patch) : cue)));
  };
  const updateSelectedStyle = (patch: CaptionStyleOverride) => {
    if (!selected) return;
    updateSelected({ style: { ...selected.style, ...patch } });
  };
  const toggleWordEmphasis = (index: number) => {
    if (!selected) return;
    const next = setWordEmphasis(selected, index, selected.words[index]?.emphasis !== true);
    onChangeCues(cues.map((cue) => (cue.id === selected.id ? next : cue)));
  };

  const cueRows = useMemo(() => cues.map((cue) => ({ cue, text: captionCueText(cue) })), [cues]);

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    // UTF-8 only, deliberately. SRT has no in-band encoding declaration and its historical
    // default was Windows-1252, so a mis-decoded file is a real possibility — telling the
    // user beats mojibaking their captions silently.
    const result = parseCaptionFile(await file.text());
    if (result.cues.length === 0) {
      setNotices([`No usable cues were found in ${file.name}.`, ...result.warnings]);
      return;
    }
    onChangeCues(result.cues);
    onSelect(result.cues[0].id);

    const notes = [`Imported ${result.cues.length} cues from ${file.name}.`, ...result.warnings];
    if (!result.hasRealWordTimings) {
      // A preset whose whole point is per-word sync must not be offered on data that has no
      // per-word sync — it would visibly drift against the speech and read as broken.
      onChangeStyle(applyCaptionPreset(resolveCaptionPreset('classic')));
      notes.push('Switched to the Classic preset, which does not rely on per-word timing.');
    }
    setNotices(notes);
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold">Captions</h3>
          <p className="text-2xs text-muted-foreground">
            Pick a style, edit copy and timing, mark the words that matter.
          </p>
        </div>
        <span className="text-2xs tabular-nums text-muted-foreground">{cues.length} cues</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-2xs text-muted-foreground">Style</span>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CAPTION_PRESETS.map((preset) => {
            const previewStyle = resolveStyleWithPreset(preset.style);
            const isActive = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isActive}
                aria-label={`${preset.label} caption style`}
                title={preset.description}
                className={`shrink-0 rounded-md border px-2 py-1.5 text-left transition-colors ${
                  isActive ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted/60'
                }`}
                onClick={() => onChangeStyle(applyCaptionPreset(preset))}
              >
                {/* Rendered through the same resolver the burn-in uses, so the chip cannot
                    advertise a look the export will not produce. */}
                <span
                  className="block leading-none"
                  style={{
                    color: previewStyle.textColor,
                    fontFamily: previewStyle.fontFamily
                      ? `"${previewStyle.fontFamily}", sans-serif`
                      : undefined,
                    fontWeight: previewStyle.fontWeight ?? 700,
                    textTransform: previewStyle.uppercase ? 'uppercase' : undefined,
                    fontSize: '0.85rem',
                  }}
                >
                  {preset.label}
                </span>
                <span className="mt-0.5 block text-3xs text-muted-foreground">
                  {previewStyle.animation?.kind && previewStyle.animation.kind !== 'none'
                    ? previewStyle.animation.kind
                    : 'no motion'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain"
          className="hidden"
          onChange={(event) => {
            void handleImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          Import SRT/VTT
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={cues.length === 0}
          onClick={() => download('captions.srt', toSrt(cues), 'application/x-subrip')}
        >
          Export SRT
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={cues.length === 0}
          onClick={() => download('captions.vtt', toVtt(cues, globalStyle), 'text/vtt')}
        >
          Export VTT
        </Button>
      </div>

      {notices.length > 0 ? (
        <ul className="grid gap-0.5 rounded-md border border-border/60 bg-muted/40 p-2 text-2xs text-muted-foreground">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}

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
            onChange={(event) =>
              onChangeStyle({ ...globalStyle, highlightColor: event.target.value })
            }
          />
        </label>
        <SliderField
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          label="X position"
          max={0.95}
          min={0.05}
          step={0.01}
          value={globalStyle.position.xFrac}
          onChange={(next) =>
            onChangeStyle({
              ...globalStyle,
              position: { ...globalStyle.position, xFrac: clampFraction(next) },
            })
          }
        />
        <SliderField
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          label="Y position"
          max={0.95}
          min={0.05}
          step={0.01}
          value={globalStyle.position.yFrac}
          onChange={(next) =>
            onChangeStyle({
              ...globalStyle,
              position: { ...globalStyle.position, yFrac: clampFraction(next) },
            })
          }
        />
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

          <div className="grid gap-1">
            <span>Emphasis — click a word to make it louder</span>
            <div className="flex flex-wrap gap-1">
              {selected.words.map((word, index) => (
                <button
                  key={`${selected.id}:${index}:${word.startSec}`}
                  type="button"
                  aria-pressed={word.emphasis === true}
                  className={`rounded px-1.5 py-0.5 text-2xs transition-colors ${
                    word.emphasis
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 hover:bg-muted'
                  }`}
                  onClick={() => toggleWordEmphasis(index)}
                >
                  {word.text}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberScrubField
              label="Start"
              min={0}
              step={0.1}
              suffix="s"
              value={selected.startSec}
              onChange={(startSec) => updateSelected({ startSec })}
            />
            <NumberScrubField
              label="End"
              min={0}
              step={0.1}
              suffix="s"
              value={selected.endSec}
              onChange={(endSec) => updateSelected({ endSec })}
            />
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
