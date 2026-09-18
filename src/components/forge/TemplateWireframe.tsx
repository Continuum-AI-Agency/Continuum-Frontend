'use client';

import type { TemplatePreview } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { LayoutTemplate } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import React, { type ComponentType, type ReactNode } from 'react';
import { fileForFormat, type PreviewFormat } from '@/components/forge/FormatPreview';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// A template's picture before anyone has rendered it: the frame at one ratio, with every variable's
// box where the designer put it, coloured by what goes in it.

type Box = [number, number, number, number];

export type WireframeFrame = {
  ratio: string;
  width: number;
  height: number;
  boxes: Array<{ key: string; kind: string; box: Box }>;
};

/** A box measured in a comp of one size, drawn on a frame of another. */
function scaleBox(
  box: readonly number[],
  from: readonly number[] | null | undefined,
  to: Box,
): Box {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = box;
  const [fromWidth, fromHeight] = from?.length === 2 ? from : [to[2], to[3]];
  const sx = fromWidth ? to[2] / fromWidth : 1;
  const sy = fromHeight ? to[3] / fromHeight : 1;
  return [x0 * sx, y0 * sy, x1 * sx, y1 * sy];
}

/**
 * One frame per ratio the parse found, each with the boxes measured in that ratio's comp.
 *
 * `instances` is per comp and is the truth; `placement` is the older single-comp measurement; a
 * bare `box` is drawn only where it cannot be another comp's rectangle. No box is invented — a
 * slot nobody measured is simply not drawn.
 */
export function wireframeFrames(parse: TemplatePreview | null | undefined): WireframeFrame[] {
  if (!parse) return [];
  const targets = parse.ratios.length
    ? parse.ratios.map((entry) => ({ ...entry, comp: entry.comps[0] }))
    : parse.comps
        .filter((comp) => comp.isDelivery)
        .map((comp) => ({ ratio: `${comp.width}×${comp.height}`, ...comp, comp: comp.name }));
  return targets.map(({ ratio, width, height, comp }) => {
    const frame: Box = [0, 0, width, height];
    return {
      ratio,
      width,
      height,
      boxes: parse.slots.flatMap((slot) => {
        const instance = slot.instances?.find((entry) => entry.comp === comp && entry.box);
        const placement = slot.placement?.comp === comp ? slot.placement : null;
        const bare =
          !slot.instances?.length && (targets.length === 1 || slot.comps.join() === comp)
            ? slot.box
            : undefined;
        const box = instance?.box
          ? scaleBox(instance.box, instance.compSize, frame)
          : placement
            ? scaleBox(placement.box, placement.compSize, frame)
            : bare
              ? scaleBox(bare, null, frame)
              : null;
        return box ? [{ key: slot.key, kind: slot.kind, box }] : [];
      }),
    };
  });
}

const KIND_STYLE: Record<string, string> = {
  text: 'fill-primary/15 stroke-primary/70',
  image: 'fill-sky-500/15 stroke-sky-500/70',
  video: 'fill-sky-500/15 stroke-sky-500/70',
  color: 'fill-amber-500/20 stroke-amber-500/70',
};

/** A template's ten newest jobs — one cached read shared by its card, its sheet and the row preview. */
export const templateFrameQuery = (brandId: string, templateKey: string | null) => ({
  queryKey: ['forge-template-frame', brandId, templateKey] as const,
  queryFn: () => apiRendersApi.listJobs(brandId, 10, { templateKey: templateKey ?? '' }),
  enabled: Boolean(templateKey),
  staleTime: 60_000,
});

/**
 * The newest finished render of this template that has a file for one format — `formatId`, else the
 * first of `formats`. Found by file name: the fleet lists a job's files in a different order every
 * time, so the first file is an arbitrary ratio. No formats, no frame.
 */
export function useLatestRenderFrame(
  brandId: string,
  templateKey: string | null,
  formats: readonly PreviewFormat[] = [],
  formatId: string | undefined = formats[0]?.id,
) {
  const { data } = useQuery({
    ...templateFrameQuery(brandId, templateKey),
    // Filtered again here: a server that has not learned the `templateKey` filter answers with the
    // brand's latest jobs, and another template's frame on this card would be a lie.
    select: (response) => {
      if (!formatId) return null;
      for (const job of response.items) {
        if (job.templateKey !== templateKey || job.status !== 'finished') continue;
        const file = fileForFormat(job.outputs, formats, formatId);
        if (file) return file;
      }
      return null;
    },
  });
  return data ?? null;
}

export function TemplateWireframe({
  parse,
  ratio,
  className,
}: {
  brandId: string;
  templateKey: string | null;
  /** The gallery's compact parse is enough: cards never read render history. */
  parse: TemplatePreview | null;
  /** Draw this ratio's wireframe. Omitted: the first ratio. */
  ratio?: string;
  className?: string;
}) {
  const frames = wireframeFrames(parse);
  const frame = frames.find((entry) => entry.ratio === ratio) ?? frames[0];

  return (
    <div className={cn('flex items-center justify-center overflow-hidden bg-muted/40', className)}>
      {frame ? (
        <svg
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          className="h-full w-full"
          role="img"
          aria-label={`${frame.ratio} layout`}
        >
          <rect
            width={frame.width}
            height={frame.height}
            className="fill-background stroke-border"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {frame.boxes.map(({ key, kind, box }) => (
            <rect
              key={key}
              x={box[0]}
              y={box[1]}
              width={Math.max(0, box[2] - box[0])}
              height={Math.max(0, box[3] - box[1])}
              rx={Math.min(frame.width, frame.height) * 0.01}
              className={KIND_STYLE[kind] ?? 'fill-muted-foreground/10 stroke-muted-foreground/50'}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ) : (
        <LayoutTemplate className="size-8 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  );
}

// React 19.2's <ViewTransition>, pulled at runtime the way OrganicWorkspaceTabs does: the stable
// @types/react has no declaration for it yet, and the test build of React has no component at all.
const ViewTransition = (
  React as unknown as { ViewTransition?: ComponentType<{ name: string; children: ReactNode }> }
).ViewTransition;

/**
 * Runs the state change that swaps a card and its detail panel. In a transition, so the previews
 * morph. Reduced motion runs it outside one: dropping the named morph alone is not enough, because
 * the page's own unnamed <ViewTransition> would still cross-fade a transition update.
 */
export function useTemplateMorphSwap(): (swap: () => void) => void {
  const reducedMotion = useReducedMotion();
  return (swap) => (reducedMotion ? swap() : React.startTransition(swap));
}

/**
 * The shared element between a template's card and its detail panel. Both sides wrap their preview
 * in this with the same id, and the state change that swaps them goes through `useTemplateMorphSwap`.
 * Reduced motion gets the swap with no morph at all, not a shorter one.
 */
export function TemplateMorph({ id, children }: { id: string; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion || !ViewTransition) return <>{children}</>;
  return <ViewTransition name={`forge-template-${id}`}>{children}</ViewTransition>;
}
