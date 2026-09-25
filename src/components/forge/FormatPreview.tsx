'use client';

import {
  type ApiRenderOutput,
  ENCODE_FILE_CONTAINERS,
  matchOutputFormat,
  outputFormatsOfParse,
  type RenderOutputFormatCandidate,
} from '@continuum/contracts';
import { type ReactNode, useState } from 'react';
import { RatioGlyph, ratioParts } from '@/components/forge/RatioGlyph';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

// One picture of a template per format, always at that format's own shape. The well is a fixed
// size the caller sets; the frame inside it is the largest box of the format's aspect that fits
// both axes, so switching 16:9 → 9:16 or dragging a pane never clips it or moves anything else.
// The badge always says where the picture came from: a finished file, that file with the row's
// edits composed over it, the template drawn whole, or a drawing of the boxes.

export type PreviewFormat = RenderOutputFormatCandidate & {
  label: string;
  /** Pixels, when the comp is measured. Null draws the frame from `ratio` alone. */
  width: number | null;
  height: number | null;
};

/**
 * The row composed on the server: a real render with the row's changes painted over it, or, with
 * no render anywhere, the template drawn whole.
 */
export type PreviewRepaint = {
  mode: 'preview';
  /** When the render underneath was finished; null when drawn from the template alone. */
  at: string | null;
  /** Whose render is underneath, as the caption names it: "Based on '{basedOn}' render". */
  basedOn: string | null;
  node: ReactNode;
  /** What the picture could not match, each said once: "Headline: resize rig approximated". */
  notes?: string[];
  /** A newer composition is on its way; this one shows the last settled edit. */
  pending?: boolean;
};

export type PreviewFrame =
  | {
      mode: 'rendered';
      /** When the file was finished. */
      at: string;
      /** The file predates the edits now on screen. */
      stale?: boolean;
      node: ReactNode;
      /** The same render with the edits since painted over it; shown first when present. */
      preview?: PreviewRepaint;
      /** The drawing too, so a person can compare the render with what was measured. */
      estimate?: ReactNode;
      caption?: ReactNode;
    }
  | PreviewRepaint
  | { mode: 'estimate'; node: ReactNode; caption?: ReactNode }
  /** Nothing to draw: an empty frame at the format's shape, saying why. */
  | { mode: 'none'; message?: string };

type Source = 'rendered' | 'preview' | 'estimate';
const SOURCE_LABEL: Record<Source, string> = {
  rendered: 'Rendered',
  preview: 'Preview',
  estimate: 'Estimate',
};

type ContractOutput = {
  id: string;
  label: string;
  ratio: string | null;
  mediaType?: string | null;
  comp?: { name: string; width: number; height: number } | null;
  layout?: { comp: { name: string; width: number; height: number } } | null;
};

/**
 * The formats a template renders, most specific source first: the contract's own outputs, else the
 * parse's delivery comps (template 133 publishes `outputs: []`), else the bare ratio labels.
 */
export function previewFormats(source: {
  outputs?: readonly ContractOutput[];
  parse?: Parameters<typeof outputFormatsOfParse>[0];
  ratios?: readonly string[];
}): PreviewFormat[] {
  if (source.outputs?.length) {
    return source.outputs.map((output) => {
      const comp = output.comp ?? output.layout?.comp ?? null;
      return {
        id: output.id,
        label: output.label,
        ratio: output.ratio,
        comp,
        mediaType: output.mediaType ?? null,
        width: comp?.width ?? null,
        height: comp?.height ?? null,
      };
    });
  }
  const parsed = outputFormatsOfParse(source.parse);
  if (parsed.length) {
    return parsed.map((format) => ({
      ...format,
      label: format.comp?.name ?? format.id,
      width: format.comp?.width ?? null,
      height: format.comp?.height ?? null,
    }));
  }
  return (source.ratios ?? []).map((ratio) => ({
    id: ratio,
    label: ratio,
    ratio,
    width: null,
    height: null,
  }));
}

/** The file a job rendered for this format, read from its name. No match is no file. */
const containerRank = (output: ApiRenderOutput) => {
  const dot = output.fileName.lastIndexOf('.');
  const ext = dot > 0 ? output.fileName.slice(dot + 1).toLowerCase() : '';
  return (ENCODE_FILE_CONTAINERS as readonly string[]).indexOf(ext);
};

/**
 * One comp can come back as several files (MP4, MOV, MXF). Stills first, then the containers in
 * contract order — so a preview shows the file a browser can play before ProRes or MXF.
 */
export const playableFirst = (outputs: readonly ApiRenderOutput[]) =>
  [...outputs].sort((a, b) => containerRank(a) - containerRank(b));

export function fileForFormat(
  outputs: readonly ApiRenderOutput[],
  formats: readonly PreviewFormat[],
  formatId: string,
): ApiRenderOutput | null {
  return (
    playableFirst(outputs).find(
      (output) => matchOutputFormat(output.fileName, formats)?.id === formatId,
    ) ?? null
  );
}

const aspectOf = (format: PreviewFormat): [number, number] =>
  format.width && format.height ? [format.width, format.height] : ratioParts(format.ratio);

const ESTIMATE_CAPTION =
  'Boxes measured from the template; type size, wrapping and brand fonts are guesses.';

export function FormatPreview({
  label,
  formats,
  value,
  onValueChange,
  frame,
  warning,
  wellClassName,
  className,
}: {
  /** Names the preview for assistive tech, and tells two previews on one page apart. */
  label: string;
  formats: PreviewFormat[];
  value: string;
  onValueChange: (formatId: string) => void;
  frame: (format: PreviewFormat) => PreviewFrame;
  /** A problem with the picked format, on its own line under the caption in every mode. */
  warning?: (format: PreviewFormat) => string | null;
  /** Must give the well a definite height: the frame is sized from it. */
  wellClassName?: string;
  className?: string;
}) {
  // Null until a person picks: then a repaint is shown first when there is one, else the render.
  const [source, setSource] = useState<Source | null>(null);
  const format = formats.find((candidate) => candidate.id === value) ?? formats[0];
  if (!format) return null;
  const [width, height] = aspectOf(format);
  const picked = frame(format);
  const sources: Source[] =
    picked.mode === 'rendered'
      ? [
          ...(picked.preview ? (['preview'] as const) : []),
          'rendered',
          ...(picked.estimate !== undefined ? (['estimate'] as const) : []),
        ]
      : [];
  const choice = source && sources.includes(source) ? source : sources[0];
  const shown: PreviewFrame =
    picked.mode !== 'rendered'
      ? picked
      : choice === 'preview' && picked.preview
        ? picked.preview
        : choice === 'estimate'
          ? { mode: 'estimate', node: picked.estimate }
          : picked;

  const badge =
    shown.mode === 'rendered'
      ? shown.stale
        ? 'Rendered · before latest edits'
        : `Rendered · ${formatRelativeTime(shown.at)}`
      : shown.mode === 'preview'
        ? shown.pending
          ? 'Preview · updating…'
          : shown.basedOn === null
            ? 'Composed from template'
            : 'Preview'
        : shown.mode === 'estimate'
          ? 'Estimate · wireframe'
          : 'No preview';
  const problem = warning?.(format) ?? null;
  const caption =
    shown.mode === 'estimate'
      ? (shown.caption ?? ESTIMATE_CAPTION)
      : shown.mode === 'rendered'
        ? shown.caption
        : shown.mode === 'preview'
          ? [
              shown.basedOn === null
                ? 'Drawn from the template'
                : `Based on '${shown.basedOn}' render${shown.at ? ` · ${formatRelativeTime(shown.at)}` : ''}`,
              ...(shown.notes ?? []),
            ].join(' · ')
          : null;

  return (
    <fieldset
      aria-label={label}
      className={cn('m-0 flex min-h-0 min-w-0 flex-col gap-1.5 border-0 p-0', className)}
    >
      <ToggleGroup
        aria-label="Format"
        size="sm"
        variant="outline"
        spacing={1}
        className="w-full flex-wrap"
        value={format.id}
        // A pressed chip pressed again reports no value; the pick stays where it was.
        onValueChange={(next) => next && onValueChange(next)}
      >
        {formats.map((entry) => {
          // Two comps can share a ratio and a size (a fixed and an animated 9:16); only their
          // names tell the chips apart.
          const twin = formats.some(
            (other) =>
              other.id !== entry.id &&
              other.ratio === entry.ratio &&
              other.width === entry.width &&
              other.height === entry.height,
          );
          return (
            <ToggleGroupItem
              key={entry.id}
              value={entry.id}
              aria-label={entry.label}
              title={entry.label}
              className="gap-1.5 px-2"
            >
              <RatioGlyph ratio={entry.ratio} className="text-muted-foreground" />
              <span className="text-xs">{entry.ratio ?? entry.label}</span>
              {twin ? (
                <span className="max-w-32 truncate text-2xs text-muted-foreground">
                  {entry.label}
                </span>
              ) : entry.width && entry.height ? (
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                  {entry.width}×{entry.height}
                </span>
              ) : null}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <div
        data-slot="format-preview-well"
        className={cn(
          'relative flex items-center justify-center overflow-hidden bg-muted/40 p-3 [container-type:size]',
          wellClassName,
        )}
      >
        <div
          data-slot="format-preview-frame"
          className="relative overflow-hidden border border-border bg-background"
          style={{
            aspectRatio: `${width} / ${height}`,
            width: `min(100cqw, calc(100cqh * ${width} / ${height}))`,
          }}
        >
          {shown.mode === 'none' ? (
            <p className="m-0 flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
              {shown.message ?? 'No measured layout for this format'}
            </p>
          ) : (
            shown.node
          )}
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {sources.length > 1 ? (
            <ToggleGroup
              aria-label="Picture"
              size="sm"
              variant="outline"
              spacing={0}
              className="bg-background"
              value={choice}
              onValueChange={(next) => next && setSource(next as Source)}
            >
              {sources.map((entry) => (
                <ToggleGroupItem key={entry} value={entry} className="h-6 text-2xs">
                  {SOURCE_LABEL[entry]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          <Badge
            data-slot="format-preview-badge"
            variant={
              shown.mode === 'rendered'
                ? shown.stale
                  ? 'warning'
                  : 'success'
                : shown.mode === 'preview'
                  ? 'violet'
                  : 'muted'
            }
            className="bg-background text-2xs"
          >
            {badge}
          </Badge>
        </div>
      </div>
      {/* Each line always one line tall, so a caption or a problem appearing never moves the well. */}
      <p
        data-slot="format-preview-caption"
        className="m-0 h-4 truncate text-2xs text-muted-foreground"
        title={typeof caption === 'string' ? caption : undefined}
      >
        {caption}
      </p>
      {warning ? (
        <p
          data-slot="format-preview-warning"
          className="m-0 h-4 truncate text-2xs text-destructive"
          title={problem ?? undefined}
        >
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}
