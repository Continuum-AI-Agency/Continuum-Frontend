'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  brandCaptionFontStatus,
  CAPTION_PRESETS,
  resolveCaptionPreset,
  resolveStyleWithPreset,
} from '@/lib/clips/captionPresets';
import type { BrandStyleInput } from '@/lib/clips/clipCaptionStyle';

// The bespoke config panel for `video.subtitles`.
//
// Every other action gets its controls generated from its zod schema; this one does not,
// because a dropdown listing six ids tells you nothing about what they look like. A caption
// preset IS its typeface and its motion, so the picker has to show them.
//
// What this panel deliberately does NOT do is edit cues. The `video.subtitles` config schema
// is frozen as `{preset, emphasize, language}` and it is a plain z.object, so parseActionConfig
// STRIPS any other key — cues written here would be dropped on the next read, including by
// this panel's own write. A cue editor whose edits vanish when the popover closes is worse
// than no cue editor, so cue editing lives on the timeline surface where cues persist. The
// animation is shown as a read-only chip for the same reason: the preset carries it, and an
// override has nowhere to live.

type Props = {
  nodeId: string;
  /** Already parsed against the op's schema, so defaults are filled in. */
  config: Record<string, unknown>;
  onWrite: (key: string, value: unknown) => void;
  /** Used only to report whether the brand's display face can actually be rendered. */
  brandStyle?: BrandStyleInput | null;
};

export function SubtitlesConfig({ nodeId, config, onWrite, brandStyle }: Props) {
  const activeId = resolveCaptionPreset(
    typeof config.preset === 'string' ? config.preset : undefined,
  ).id;
  const emphasize = config.emphasize !== false;
  const language = typeof config.language === 'string' ? config.language : '';
  const brandFont = brandCaptionFontStatus(brandStyle);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Style</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {CAPTION_PRESETS.map((preset) => {
            // Resolved through the SAME helper the burn-in uses, so a chip cannot advertise
            // a look the render will not produce.
            const style = resolveStyleWithPreset(preset.style);
            const isActive = preset.id === activeId;
            const motion =
              style.animation && style.animation.kind !== 'none' ? style.animation.kind : 'static';
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isActive}
                aria-label={`${preset.label} — ${preset.description}`}
                title={preset.description}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 transition-colors ${
                  isActive ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted/60'
                }`}
                onClick={() => onWrite('preset', preset.id)}
              >
                <span
                  className="flex h-8 w-full items-center justify-center overflow-hidden rounded-sm bg-neutral-800"
                  style={{
                    backgroundColor: style.backgroundColor ?? undefined,
                  }}
                >
                  <span
                    className="leading-none"
                    style={{
                      color: style.textColor,
                      fontFamily: style.fontFamily
                        ? `"${style.fontFamily}", sans-serif`
                        : undefined,
                      fontWeight: style.fontWeight ?? 700,
                      textTransform: style.uppercase ? 'uppercase' : undefined,
                      fontSize: '0.7rem',
                      WebkitTextStrokeWidth:
                        (style.outlineWidthFrac ?? 0) > 0 ? '0.06em' : undefined,
                      WebkitTextStrokeColor: style.outlineColor,
                      paintOrder: 'stroke fill',
                    }}
                  >
                    Aa
                    <span style={{ color: style.emphasis?.color ?? style.highlightColor }}>Bb</span>
                  </span>
                </span>
                <span className="text-3xs font-medium">{preset.label}</span>
                <span className="text-3xs text-muted-foreground">{motion}</span>
              </button>
            );
          })}
        </div>
        <p className="text-3xs text-muted-foreground">
          {resolveCaptionPreset(activeId).description}
        </p>
      </div>

      {brandFont.family && !brandFont.registered ? (
        // Never a silent substitution. `typography.primary` is a family NAME, not a file,
        // and rendering Helvetica while claiming the brand face is the exact bug that made
        // fontFamily inert for as long as it was.
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-3xs text-amber-700 dark:text-amber-300">
          Brand font “{brandFont.family}” is unavailable — captions will render in the preset face
          instead.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <Label htmlFor={`subtitles-emphasize-${nodeId}`} className="text-xs">
            Emphasise key words
          </Label>
          <span className="text-3xs text-muted-foreground">
            Marks about one word a line. Falls back to a built-in picker if the model is down.
          </span>
        </div>
        <Switch
          id={`subtitles-emphasize-${nodeId}`}
          checked={emphasize}
          onCheckedChange={(checked) => onWrite('emphasize', checked)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`subtitles-language-${nodeId}`} className="text-xs">
          Language
        </Label>
        <Input
          id={`subtitles-language-${nodeId}`}
          className="h-7 text-xs"
          placeholder="Auto-detect"
          value={language}
          onChange={(event) => onWrite('language', event.target.value.trim() || null)}
        />
      </div>
    </div>
  );
}
