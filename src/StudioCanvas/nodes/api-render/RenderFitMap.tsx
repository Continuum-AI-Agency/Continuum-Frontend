'use client';

import type { ApiRenderFitVerdict, ApiRenderTemplateContract } from '@continuum/contracts';
import { cn } from '@/lib/utils';

/**
 * The template's own layout, to scale, with the chosen artwork drawn where it would land.
 *
 * A render costs a queue slot and a minute; this costs nothing and answers the question that
 * actually goes wrong — a hot dog in a hamburger's slot is a different shape, and After Effects
 * will happily hand back a frame with it hanging off the bottom. The dashed rectangle is the
 * prediction, the solid canvas edge is what it has to stay inside, and the numbers underneath
 * are pixels, not adjectives.
 *
 * Drawn rather than tabulated because the failure is spatial. "Clips 24 px bottom" is a fact
 * nobody can picture; a box crossing the frame edge is one nobody has to.
 *
 * Everything here is a MEASUREMENT or a named estimate. No box is invented: a slot the parse
 * could not place simply is not drawn, and the caller says so in words elsewhere rather than
 * drawing a guess at the right size.
 */
export function RenderFitMap({
  layout,
  verdicts,
  className,
}: {
  layout: ApiRenderTemplateContract['layout'];
  verdicts: ApiRenderFitVerdict[];
  className?: string;
}) {
  if (!layout) return null;
  const { comp, boxes } = layout;
  // One unit of the viewBox is one comp pixel, so every number below is the real measurement and
  // the browser does the scaling. Padded so a predicted box that overhangs the canvas — which is
  // the whole point of drawing this — is not itself clipped by the SVG.
  const pad = Math.round(Math.max(comp.width, comp.height) * 0.12);

  const predicted = verdicts.filter(
    (verdict): verdict is ApiRenderFitVerdict & { box: NonNullable<ApiRenderFitVerdict['box']> } =>
      verdict.box !== null,
  );

  return (
    <figure className={cn('m-0 flex flex-col gap-1', className)}>
      <div className="overflow-x-auto rounded-md border border-border/60 bg-muted/30 p-1">
        <svg
          viewBox={`${-pad} ${-pad} ${comp.width + pad * 2} ${comp.height + pad * 2}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`${comp.name}: ${boxes.length} measured layers, ${predicted.length} predicted placements`}
        >
          <title>{`${comp.name} — ${comp.width}×${comp.height}`}</title>
          {/* The canvas. Everything outside this line is what the render throws away. */}
          <rect
            x={0}
            y={0}
            width={comp.width}
            height={comp.height}
            className="fill-background stroke-foreground"
            strokeWidth={comp.width * 0.004}
          />
          {boxes.map((row) => (
            <rect
              key={row.key}
              x={row.box[0]}
              y={row.box[1]}
              width={Math.max(0, row.box[2] - row.box[0])}
              height={Math.max(0, row.box[3] - row.box[1])}
              className={cn(
                'fill-muted-foreground/10 stroke-muted-foreground/50',
                row.role === 'product_image' && 'fill-primary/10 stroke-primary/60',
              )}
              strokeWidth={comp.width * 0.003}
            >
              <title>{`${row.label}${row.role ? ` · ${row.role.replace(/_/g, ' ')}` : ''}`}</title>
            </rect>
          ))}
          {predicted.map((verdict) => (
            <rect
              key={verdict.key}
              x={verdict.box[0]}
              y={verdict.box[1]}
              width={Math.max(0, verdict.box[2] - verdict.box[0])}
              height={Math.max(0, verdict.box[3] - verdict.box[1])}
              fill="none"
              // Dashed on purpose, and said so in the caption: this is where the asset is
              // PREDICTED to land, not where a render put it.
              strokeDasharray={`${comp.width * 0.014} ${comp.width * 0.009}`}
              strokeWidth={comp.width * 0.006}
              className={cn(verdict.state === 'clipped' ? 'stroke-destructive' : 'stroke-success')}
            >
              <title>
                {verdict.state === 'clipped'
                  ? `${verdict.key}: clips ${verdict.clippedPx?.join('/')} px (l/t/r/b)`
                  : `${verdict.key}: inside the canvas`}
              </title>
            </rect>
          ))}
        </svg>
      </div>
      {/* Names its SOURCE, not just its confidence. These boxes come from the parse of the
          uploaded .aep; which file the fleet actually renders is decided by the root table's
          action workflow and the node graph's `compoSelector.fileID`, and that can be repointed
          without the parse changing. So this is the design as uploaded — true of the template
          the render usually resolves to, and not a claim about the bytes the worker read. */}
      <figcaption className="text-2xs text-muted-foreground">
        {comp.name} · {comp.width}×{comp.height} · dashed = where the chosen artwork lands
        (estimated from the uploaded project file)
      </figcaption>
    </figure>
  );
}
