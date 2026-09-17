'use client';

import {
  type ApiRenderInputValue,
  type ApiRenderJob,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateLayout,
  type ApiRenderVariable,
  motionLabel,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type JSX, useEffect, useState } from 'react';
import {
  FormatPreview,
  fileForFormat,
  type PreviewFormat,
  previewFormats,
} from '@/components/forge/FormatPreview';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  effectiveMedia,
  effectiveOutputIds,
  effectiveValues,
  type RequestRow,
  type RequestRowMedia,
} from './renderRequestRows';

// One row, drawn into the template's own slot boxes, before a render is spent on it. The boxes
// are the parse's measurements in comp pixels; what goes inside them is an estimate, and the
// overflow list says so in words rather than trusting anyone to spot a squeezed headline.

// ponytail: no text measurement — a flat 0.55em glyph and 1.2em line stand in for the real face,
// kerning and AE's paragraph box. Add a server still endpoint when these wireframes mislead.
const GLYPH_EM = 0.55;
const LINE_EM = 1.2;
const MAX_SIZE_OF_BOX = 0.8;
const SAMPLE_FLOOR_RATIO = 0.4;
const FLOOR_PX = 12;

type Box = ApiRenderTemplateLayout['boxes'][number];

function wrapLines(text: string, perLine: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length <= perLine) line = `${line} ${word}`;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

const perLineAt = (size: number, width: number) => Math.floor(width / (GLYPH_EM * size));

function fitsAt(text: string, size: number, width: number, height: number): boolean {
  const perLine = perLineAt(size, width);
  if (perLine < 1) return false;
  const lines = wrapLines(text, perLine);
  return lines.length * LINE_EM * size <= height && lines.every((line) => line.length <= perLine);
}

/** The largest size the box takes. A smaller size never wraps into more lines, so bisect. */
function fitSize(text: string, width: number, height: number): number {
  let lo = 0;
  let hi = height * MAX_SIZE_OF_BOX;
  if (hi <= 0 || fitsAt(text, hi, width, height)) return Math.max(0, hi);
  for (let step = 0; step < 20; step++) {
    const mid = (lo + hi) / 2;
    if (fitsAt(text, mid, width, height)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function textOf(value: ApiRenderInputValue | undefined): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value : '';
}

const hexOf = (value: ApiRenderInputValue | undefined): string | null =>
  typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value.trim())
    ? `#${value.trim().replace(/^#/, '')}`
    : null;

type Slot = { node: JSX.Element; overflow: string | null };

function drawSlot(
  box: Box,
  variable: ApiRenderVariable | undefined,
  value: ApiRenderInputValue | undefined,
  media: RequestRowMedia | undefined,
  unit: number,
): Slot {
  const [x0, y0, x1, y1] = box.box;
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const labelSize = unit * 2.4;
  const rect = { x: x0, y: y0, width, height };
  const title = <title>{variable ? variable.label : box.label}</title>;

  if (!variable) {
    // A static layer: part of the design, nothing a row can change.
    return {
      node: (
        <g key={box.key} data-slot={box.key}>
          {title}
          <rect
            {...rect}
            fill="none"
            className="stroke-muted-foreground/30"
            strokeWidth={unit * 0.2}
          />
        </g>
      ),
      overflow: null,
    };
  }

  const mutedLabel = (text: string) => (
    <text
      x={x0 + unit}
      y={y0 + unit + labelSize}
      fontSize={labelSize}
      className="fill-muted-foreground"
    >
      {text}
    </text>
  );

  if (variable.reserved) {
    return {
      node: (
        <g key={box.key} data-slot={box.key}>
          {title}
          <rect
            {...rect}
            className="fill-muted stroke-muted-foreground/40"
            strokeWidth={unit * 0.2}
          />
          {mutedLabel('Continuum fills this')}
        </g>
      ),
      overflow: null,
    };
  }

  const dashed = `${unit * 1.4} ${unit * 0.9}`;
  // Nothing picked yet: the slot's outline and its name, so the gap reads as a gap.
  const placeholder = (
    <>
      <rect
        {...rect}
        fill="none"
        className="stroke-muted-foreground/50"
        strokeDasharray={dashed}
        strokeWidth={unit * 0.3}
      />
      {mutedLabel(variable.label)}
    </>
  );

  if (variable.kind === 'image' || variable.kind === 'video') {
    const href = media?.thumbnailUrl;
    return {
      node: (
        <g key={box.key} data-slot={box.key}>
          {title}
          {href ? (
            // The image viewport clips a `slice` to its own box, so no clipPath is needed.
            <image
              {...rect}
              href={href}
              preserveAspectRatio={
                variable.role === 'background_image' ? 'xMidYMid slice' : 'xMidYMid meet'
              }
            />
          ) : (
            placeholder
          )}
        </g>
      ),
      overflow: null,
    };
  }

  if (variable.kind === 'color') {
    const hex = hexOf(value);
    const swatch = unit * 3;
    return {
      node: (
        <g key={box.key} data-slot={box.key}>
          {title}
          {hex ? (
            <>
              <rect {...rect} fill={hex} />
              <rect
                x={x0 + unit}
                y={y0 + unit}
                width={swatch}
                height={swatch}
                fill={hex}
                className="stroke-background"
                strokeWidth={unit * 0.3}
              />
              <text
                x={x0 + unit * 2 + swatch}
                y={y0 + unit + swatch * 0.8}
                fontSize={labelSize}
                className="fill-foreground stroke-background"
                strokeWidth={unit * 0.1}
              >
                {hex}
              </text>
            </>
          ) : (
            placeholder
          )}
        </g>
      ),
      overflow: null,
    };
  }

  const text = textOf(value);
  if (!text) {
    return {
      node: (
        <g key={box.key} data-slot={box.key}>
          {title}
          <rect
            {...rect}
            fill="none"
            className="stroke-muted-foreground/40"
            strokeWidth={unit * 0.2}
          />
          {mutedLabel(variable.label)}
        </g>
      ),
      overflow: null,
    };
  }

  const size = fitSize(text, width, height);
  const floor = variable.sample
    ? fitSize(variable.sample, width, height) * SAMPLE_FLOOR_RATIO
    : FLOOR_PX;
  const overBudget = variable.charBudget !== null && text.length > variable.charBudget;
  const tooSmall = size < floor;
  const overflow = overBudget
    ? `${variable.label} overflows its box (${text.length}/${variable.charBudget} characters)`
    : tooSmall
      ? `${variable.label} overflows its box (fits only at ${Math.floor(size)} px type, below ${Math.round(floor)} px)`
      : null;
  // Drawn at the floor when it cannot shrink that far, so the spill is visible, not hidden.
  const drawSize = tooSmall ? floor : size;
  const lines = wrapLines(text, Math.max(1, perLineAt(drawSize, width)));

  return {
    node: (
      <g key={box.key} data-slot={box.key} data-overflow={overflow ? 'true' : undefined}>
        {title}
        <rect
          {...rect}
          fill="none"
          className={overflow ? 'stroke-destructive' : 'stroke-muted-foreground/30'}
          strokeDasharray={overflow ? dashed : undefined}
          strokeWidth={unit * (overflow ? 0.5 : 0.2)}
        />
        <text x={x0} y={y0} fontSize={drawSize} className="fill-foreground">
          {lines.map((line, index) => (
            <tspan
              // biome-ignore lint/suspicious/noArrayIndexKey: wrapped lines have no identity but position
              key={index}
              x={x0}
              dy={index === 0 ? drawSize : drawSize * LINE_EM}
            >
              {line}
            </tspan>
          ))}
        </text>
      </g>
    ),
    overflow,
  };
}

/** One row drawn into a layout's slot boxes, and the boxes its text overflows. */
function drawLayout(
  layout: ApiRenderTemplateLayout,
  variables: ApiRenderVariable[],
  values: Record<string, ApiRenderInputValue>,
  media: Record<string, RequestRowMedia>,
): { node: JSX.Element; overflows: string[] } {
  const { comp } = layout;
  const unit = Math.max(comp.width, comp.height) / 100;
  const byKey = new Map(variables.map((variable) => [variable.key, variable]));
  const slots = layout.boxes.map((box) =>
    drawSlot(box, byKey.get(box.key), values[box.key], media[box.key], unit),
  );
  return {
    node: (
      // One viewBox unit is one comp pixel, so every box is the parse's own measurement.
      <svg
        viewBox={`0 0 ${comp.width} ${comp.height}`}
        className="block size-full"
        role="img"
        aria-label={`${comp.name} preview`}
      >
        <title>{`${comp.name} — ${comp.width}×${comp.height}`}</title>
        <rect
          x={0}
          y={0}
          width={comp.width}
          height={comp.height}
          className="fill-background stroke-foreground"
          strokeWidth={unit * 0.4}
        />
        {slots.map((slot) => slot.node)}
      </svg>
    ),
    overflows: slots.flatMap((slot) => (slot.overflow ? [slot.overflow] : [])),
  };
}

const latestFinishedFor = (jobs: ApiRenderJob[], rowId: string): ApiRenderJob | null =>
  jobs
    .filter(
      (job) => job.renderSetRowId === rowId && job.status === 'finished' && job.outputs.length > 0,
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;

async function findLastRender(
  brandId: string,
  renderSetId: string,
  rowId: string,
): Promise<ApiRenderJob | null> {
  const { items } = await apiRendersApi.listJobs(brandId, 1, {
    renderSetId,
    renderSetRowId: rowId,
    status: 'finished',
  });
  return latestFinishedFor(items, rowId);
}

/** `9:16` against a 1080×1920 comp. A null or unreadable ratio proves nothing, so it never matches. */
function sameAspect(ratio: string | null, comp: ApiRenderTemplateLayout['comp']): boolean {
  const [w = 0, h = 0] = (ratio ?? '').split(':').map(Number);
  return w > 0 && h > 0 && Math.abs((w * comp.height) / (h * comp.width) - 1) < 0.01;
}

export function RenderPreviewPanel({
  brandId,
  contract,
  rows,
  rowId,
  renderSetId,
}: {
  brandId: string;
  contract: ApiRenderTemplateContract;
  rows: RequestRow[];
  rowId: string | null;
  renderSetId: string | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const templateKey = contract.template.key;
  // The format picked per template, so moving between rows keeps looking at the same format.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const lastKey =
    rowId && renderSetId ? forgeQueryKeys.renderJobRowLatest(brandId, renderSetId, rowId) : null;
  // One row-scoped read per row, cached: the newest finished render of the row on screen.
  const { data: lastJob } = useQuery({
    queryKey: lastKey ?? [...forgeQueryKeys.renderJobs(brandId), 'row-latest', null],
    queryFn: () => findLastRender(brandId, renderSetId as string, rowId as string),
    enabled: lastKey !== null,
    staleTime: FORGE_STALE_MS.active,
  });
  // The set's revision as the grid last read it — a render of an older revision predates the edits.
  const { data: setRevision } = useQuery({
    queryKey: forgeQueryKeys.renderSetList(brandId, templateKey),
    queryFn: () => apiRendersApi.listRenderSets(brandId, templateKey),
    enabled: renderSetId !== null,
    staleTime: FORGE_STALE_MS.lists,
    select: (response) => response.items.find((set) => set.id === renderSetId)?.revision ?? null,
  });

  // A realtime job is a signal to re-read, never data to merge: only the list read re-signs URLs.
  useEffect(() => {
    if (!lastKey || !rowId) return;
    return subscribeToPostgresChanges({
      label: 'render-preview-last',
      bindings: (['INSERT', 'UPDATE'] as const).map((event) => ({
        event,
        schema: 'media',
        table: 'ad_render_jobs',
        filter: `brand_id=eq.${brandId}`,
        onRow: (job: Record<string, unknown>) => {
          if (job.render_set_row_id === rowId && job.status === 'finished') {
            void queryClient.invalidateQueries({ queryKey: lastKey });
          }
        },
      })),
    });
    // biome-ignore lint/correctness/useExhaustiveDependencies: lastKey is derived from brandId, renderSetId and rowId.
  }, [brandId, queryClient, renderSetId, rowId]);

  const row = rowId ? rows.find((candidate) => candidate.id === rowId) : undefined;
  if (!rowId || !row) {
    return (
      <div className="flex h-full items-center justify-center p-2 text-xs text-muted-foreground">
        Select a row to preview it
      </div>
    );
  }

  const motion = motionLabel(contract.template.motion);
  const values = effectiveValues(rows, rowId);
  const media = effectiveMedia(rows, rowId);
  const scopedIds = effectiveOutputIds(rows, rowId);
  const formats = previewFormats({ outputs: contract.outputs, ratios: contract.template.ratios });
  // A row scoped to some outputs previews only those; ratio-only formats have no ids to scope by.
  const rowFormats = contract.outputs.length
    ? formats.filter((format) => scopedIds.length === 0 || scopedIds.includes(format.id))
    : formats;
  const format = rowFormats.find((entry) => entry.id === picked[templateKey]) ?? rowFormats[0];
  const outputOf = (entry: PreviewFormat) =>
    contract.outputs.find((output) => output.id === entry.id);

  // The template-level layout is ONE comp; under a format of another ratio its boxes sit in the
  // wrong coordinate space and report overflow that does not exist.
  const drawingOf = (entry: PreviewFormat) => {
    const layout =
      outputOf(entry)?.layout ??
      (contract.layout && sameAspect(entry.ratio, contract.layout.comp) ? contract.layout : null);
    return layout ? drawLayout(layout, contract.variables, values, media) : null;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{row.label.trim() || 'Untitled'}</span>
        {/* What this template DELIVERS. A one-frame comp and a 15s one draw the same boxes. */}
        {motion ? <span className="shrink-0 text-2xs text-muted-foreground">{motion}</span> : null}
      </div>
      {format ? (
        <FormatPreview
          label="Row preview"
          className="min-h-0 flex-1"
          wellClassName="min-h-0 flex-1"
          formats={rowFormats}
          value={format.id}
          onValueChange={(next) => setPicked((current) => ({ ...current, [templateKey]: next }))}
          warning={(entry) => drawingOf(entry)?.overflows.join(' · ') || null}
          frame={(entry) => {
            const drawing = drawingOf(entry);
            const file = lastJob ? fileForFormat(lastJob.outputs, formats, entry.id) : null;
            if (lastJob && file) {
              return {
                mode: 'rendered',
                at: lastJob.finishedAt ?? lastJob.updatedAt,
                stale:
                  setRevision != null &&
                  lastJob.renderSetRevision != null &&
                  lastJob.renderSetRevision !== setRevision,
                node:
                  file.kind === 'video' ? (
                    <video controls src={file.url} className="size-full object-contain">
                      <track kind="captions" />
                    </video>
                  ) : (
                    // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
                    <img alt="Last render" src={file.url} className="size-full object-contain" />
                  ),
                estimate: drawing?.node,
                caption: file.fileName,
              };
            }
            return drawing ? { mode: 'estimate', node: drawing.node } : { mode: 'none' };
          }}
        />
      ) : (
        <p className="m-0 text-muted-foreground">This template has no measured layout to draw.</p>
      )}
    </div>
  );
}
