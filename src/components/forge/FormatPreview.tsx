'use client';

import {
  type ApiRenderOutput,
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
// The badge always says where the picture came from: a finished file, or a drawing of the boxes.

export type PreviewFormat = RenderOutputFormatCandidate & {
  label: string;
  /** Pixels, when the comp is measured. Null draws the frame from `ratio` alone. */
  width: number | null;
  height: number | null;
};

export type PreviewFrame =
  | {
      mode: 'rendered';
      /** When the file was finished. */
      at: string;
      /** The file predates the edits now on screen. */
      stale?: boolean;
      node: ReactNode;
      /** The drawing too, so a person can compare the render with what was measured. */
      estimate?: ReactNode;
      caption?: ReactNode;
    }
  | { mode: 'estimate'; node: ReactNode; caption?: ReactNode }
  /** Nothing to draw: an empty frame at the format's shape, saying why. */
  | { mode: 'none'; message?: string };

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
export function fileForFormat(
  outputs: readonly ApiRenderOutput[],
  formats: readonly PreviewFormat[],
  formatId: string,
): ApiRenderOutput | null {
  return (
    outputs.find((output) => matchOutputFormat(output.fileName, formats)?.id === formatId) ?? null
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
  /** A problem with the picked format, shown in place of the caption in every mode. */
  warning?: (format: PreviewFormat) => string | null;
  /** Must give the well a definite height: the frame is sized from it. */
  wellClassName?: string;
  className?: string;
}) {
  const [source, setSource] = useState<'rendered' | 'estimate'>('rendered');
  const format = formats.find((candidate) => candidate.id === value) ?? formats[0];
  if (!format) return null;
  const [width, height] = aspectOf(format);
  const picked = frame(format);
  const both = picked.mode === 'rendered' && picked.estimate !== undefined;
  const shown: PreviewFrame =
    both && source === 'estimate' && picked.mode === 'rendered'
      ? { mode: 'estimate', node: picked.estimate }
      : picked;

  const badge =
    shown.mode === 'rendered'
      ? shown.stale
        ? 'Rendered · before latest edits'
        : `Rendered · ${formatRelativeTime(shown.at)}`
      : shown.mode === 'estimate'
        ? 'Estimate · wireframe'
        : 'No preview';
  const problem = warning?.(format) ?? null;
  const caption =
    shown.mode === 'estimate'
      ? (shown.caption ?? ESTIMATE_CAPTION)
      : shown.mode === 'rendered'
        ? shown.caption
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
        {formats.map((entry) => (
          <ToggleGroupItem
            key={entry.id}
            value={entry.id}
            aria-label={entry.label}
            className="gap-1.5 px-2"
          >
            <RatioGlyph ratio={entry.ratio} className="text-muted-foreground" />
            <span className="text-xs">{entry.ratio ?? entry.label}</span>
            {entry.width && entry.height ? (
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {entry.width}×{entry.height}
              </span>
            ) : null}
          </ToggleGroupItem>
        ))}
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
          {both ? (
            <ToggleGroup
              aria-label="Picture"
              size="sm"
              variant="outline"
              spacing={0}
              className="bg-background"
              value={source}
              onValueChange={(next) => next && setSource(next as 'rendered' | 'estimate')}
            >
              <ToggleGroupItem value="rendered" className="h-6 text-2xs">
                Rendered
              </ToggleGroupItem>
              <ToggleGroupItem value="estimate" className="h-6 text-2xs">
                Estimate
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          <Badge
            data-slot="format-preview-badge"
            variant={shown.mode === 'rendered' ? (shown.stale ? 'warning' : 'success') : 'muted'}
            className="bg-background text-2xs"
          >
            {badge}
          </Badge>
        </div>
      </div>
      {/* Always one line tall, so a caption appearing never moves the well. */}
      <p
        className={cn(
          'm-0 h-4 truncate text-2xs',
          problem ? 'text-destructive' : 'text-muted-foreground',
        )}
        title={problem ?? undefined}
      >
        {problem ?? caption}
      </p>
    </fieldset>
  );
}
