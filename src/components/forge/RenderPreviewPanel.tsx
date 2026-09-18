'use client';

import {
  type ApiRenderInputValue,
  type ApiRenderJob,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateLayout,
  type ApiRenderVariable,
  motionLabel,
  type PixelBox,
  readableLayerName,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type JSX, useEffect, useState } from 'react';
import {
  FormatPreview,
  fileForFormat,
  type PreviewFormat,
  type PreviewFrame,
  type PreviewRepaint,
  previewFormats,
} from '@/components/forge/FormatPreview';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { templateFrameQuery } from '@/components/forge/TemplateWireframe';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  type Backdrop,
  changedKeys,
  clampBox,
  pickBackdrop,
  sampleTones,
  type Tone,
} from './previewRepaint';
import {
  effectiveMedia,
  effectiveOutputIds,
  effectiveValues,
  type RequestRow,
  type RequestRowMedia,
} from './renderRequestRows';

// One row, before a render is spent on it. When a real render of the format exists — this row's,
// the nearest row's in the set, else the template's newest — it is the picture, and only the
// slots whose value differs from what that render used are painted over it, in their measured
// boxes, in colours read off the render. With no render anywhere, the row is drawn into the
// template's slot boxes as a wireframe. Either way the overflow list says in words what the
// picture cannot, rather than trusting anyone to spot a squeezed headline.

// ponytail: no text measurement — a flat 0.55em glyph and 1.2em line stand in for the real face,
// kerning and AE's paragraph box. Add a server still endpoint when these wireframes mislead.
const GLYPH_EM = 0.55;
const LINE_EM = 1.2;
const MAX_SIZE_OF_BOX = 0.8;
const SAMPLE_FLOOR_RATIO = 0.4;
const FLOOR_PX = 12;
// ponytail: a repainted slot's text is set in the app's own sans — a stand-in font, and the
// caption says so. Its size is fitted to the box and capped at the height of the line it replaces
// (a line's ink spans about this share of its font size), its alignment read from where the old
// ink sat; weight, tracking and the template's face are not known. Upgrade: load the brand's
// uploaded faces with the FontFace API and the slot's font from the parse.
const INK_EM = 0.75;

type Box = ApiRenderTemplateLayout['boxes'][number];
type Comp = ApiRenderTemplateLayout['comp'];

const nameOf = (variable: ApiRenderVariable) => readableLayerName(variable.label);

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

type TextFit = { size: number; lines: string[]; overflow: string | null };

/** The size a value takes in its box, its wrapped lines, and the overflow it causes, in words. */
function fitText(
  variable: ApiRenderVariable,
  text: string,
  width: number,
  height: number,
): TextFit {
  const size = fitSize(text, width, height);
  const floor = variable.sample
    ? fitSize(variable.sample, width, height) * SAMPLE_FLOOR_RATIO
    : FLOOR_PX;
  const overBudget = variable.charBudget !== null && text.length > variable.charBudget;
  const tooSmall = size < floor;
  const overflow = overBudget
    ? `${nameOf(variable)} overflows its box (${text.length}/${variable.charBudget} characters)`
    : tooSmall
      ? `${nameOf(variable)} overflows its box (fits only at ${Math.floor(size)} px type, below ${Math.round(floor)} px)`
      : null;
  // Drawn at the floor when it cannot shrink that far, so the spill is visible, not hidden.
  const drawSize = tooSmall ? floor : size;
  return {
    size: drawSize,
    lines: wrapLines(text, Math.max(1, perLineAt(drawSize, width))),
    overflow,
  };
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

  const { size: drawSize, lines, overflow } = fitText(variable, text, width, height);
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

type Repaint = {
  box: Box;
  variable: ApiRenderVariable;
  value: ApiRenderInputValue;
  media: RequestRowMedia | undefined;
};

type Align = 'start' | 'middle' | 'end';

/** Where the render's own text sat across its box: flush left, centred, or flush right. */
function alignOf(ink: PixelBox | null, x0: number, x1: number): Align {
  if (!ink) return 'start';
  const left = ink[0] - x0;
  const right = x1 - ink[2];
  if (Math.abs(left - right) <= (x1 - x0) * 0.1) return 'middle';
  return left < right ? 'start' : 'end';
}

/**
 * One changed slot painted over the render: what the render drew there erased in the box's own
 * fill, then the row's value in the render's ink. With no tone (the render's pixels could not be
 * read) the fill is neutral and the text hangs where the wireframe puts it.
 */
function repaintSlot(
  { box, variable, value, media }: Repaint,
  comp: Comp,
  tone: Tone | undefined,
): JSX.Element {
  const [x0, y0, x1, y1] = clampBox(box.box, comp);
  const width = x1 - x0;
  const height = y1 - y0;
  const ground = tone ? { fill: tone.fill } : { className: 'fill-muted' };
  const title = <title>{nameOf(variable)}</title>;

  if (variable.kind === 'image' || variable.kind === 'video') {
    return (
      <g key={box.key} data-repaint={box.key}>
        {title}
        <rect x={x0} y={y0} width={width} height={height} {...ground} />
        <image
          x={x0}
          y={y0}
          width={width}
          height={height}
          href={media?.thumbnailUrl ?? undefined}
          preserveAspectRatio={
            variable.role === 'background_image' ? 'xMidYMid slice' : 'xMidYMid meet'
          }
        />
      </g>
    );
  }

  // Erase only the ink the render drew here, so a neighbour the measured box overlaps survives.
  const ink = tone?.inkBox ?? null;
  const pad = Math.max(2, height * 0.04);
  const [e0, e1, e2, e3] = ink
    ? [
        Math.max(x0, ink[0] - pad),
        Math.max(y0, ink[1] - pad),
        Math.min(x1, ink[2] + pad),
        Math.min(y1, ink[3] + pad),
      ]
    : [x0, y0, x1, y1];
  const text = textOf(value);
  const fit = fitText(variable, text, width, height);
  const size =
    tone?.lineHeight && !fit.overflow ? Math.min(fit.size, tone.lineHeight / INK_EM) : fit.size;
  const lines =
    size === fit.size ? fit.lines : wrapLines(text, Math.max(1, perLineAt(size, width)));
  const align = alignOf(ink, x0, x1);
  const x = align === 'middle' ? (x0 + x1) / 2 : align === 'end' ? x1 : x0;
  const spread = (lines.length - 1) * size * LINE_EM;
  // The new block centred where the old ink sat; with nothing sampled, hung from the box's top.
  const wanted = ink ? (ink[1] + ink[3]) / 2 - spread / 2 + (size * INK_EM) / 2 : y0 + size;
  const baseline = Math.max(y0 + size * INK_EM, Math.min(wanted, y1 - spread));
  return (
    <g key={box.key} data-repaint={box.key}>
      {title}
      <rect x={e0} y={e1} width={e2 - e0} height={e3 - e1} {...ground} />
      <text
        x={x}
        y={baseline}
        fontSize={size}
        textAnchor={align}
        {...(tone ? { fill: tone.ink } : { className: 'fill-foreground' })}
      >
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: wrapped lines have no identity but position
          <tspan key={index} x={x} dy={index === 0 ? 0 : size * LINE_EM}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** The render as the picture and each changed slot over it. One viewBox unit is one comp pixel. */
function drawPreview(
  comp: Comp,
  url: string,
  repaints: Repaint[],
  tones: Record<string, Tone> | undefined,
): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${comp.width} ${comp.height}`}
      className="block size-full"
      role="img"
      aria-label={`${comp.name} preview`}
    >
      <title>{`${comp.name} — ${comp.width}×${comp.height}`}</title>
      <image
        href={url}
        x={0}
        y={0}
        width={comp.width}
        height={comp.height}
        preserveAspectRatio="none"
      />
      {repaints.map((repaint) => repaintSlot(repaint, comp, tones?.[repaint.box.key]))}
    </svg>
  );
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

/** The most renders one set read returns: the list endpoint's own ceiling. */
const SET_JOBS = 50;

const VIDEO_ONLY =
  'Estimate only: this format renders as video, and a video frame is not painted over yet.';

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
  // The set's finished renders, one read per set: a row with no render of its own is previewed
  // over the nearest row's.
  const setKey = renderSetId
    ? [...forgeQueryKeys.renderJobs(brandId), 'set-finished', renderSetId]
    : null;
  const { data: setJobs } = useQuery({
    queryKey: setKey ?? [...forgeQueryKeys.renderJobs(brandId), 'set-finished', null],
    queryFn: async () =>
      (
        await apiRendersApi.listJobs(brandId, SET_JOBS, {
          renderSetId: renderSetId as string,
          status: 'finished',
        })
      ).items,
    enabled: setKey !== null && rowId !== null,
    staleTime: FORGE_STALE_MS.active,
  });
  // The template's newest renders, through the read its card and sheet already share.
  const { data: templateJobs } = useQuery({
    ...templateFrameQuery(brandId, templateKey),
    enabled: rowId !== null,
    select: (response) => response.items.filter((job) => job.templateKey === templateKey),
  });
  // The set's revision as the grid last read it — a render of an older revision predates the edits.
  const { data: setRevision } = useQuery({
    queryKey: forgeQueryKeys.renderSetList(brandId, templateKey),
    queryFn: () => apiRendersApi.listRenderSets(brandId, templateKey),
    enabled: renderSetId !== null,
    staleTime: FORGE_STALE_MS.lists,
    select: (response) => response.items.find((set) => set.id === renderSetId)?.revision ?? null,
  });

  const row = rowId ? rows.find((candidate) => candidate.id === rowId) : undefined;
  const values = row ? effectiveValues(rows, row.id) : {};
  const media = row ? effectiveMedia(rows, row.id) : {};
  const scopedIds = row ? effectiveOutputIds(rows, row.id) : [];
  const formats = previewFormats({ outputs: contract.outputs, ratios: contract.template.ratios });
  // A row scoped to some outputs previews only those; ratio-only formats have no ids to scope by.
  const rowFormats = contract.outputs.length
    ? formats.filter((format) => scopedIds.length === 0 || scopedIds.includes(format.id))
    : formats;
  const format = rowFormats.find((entry) => entry.id === picked[templateKey]) ?? rowFormats[0];
  const byKey = new Map(contract.variables.map((variable) => [variable.key, variable]));

  // The template-level layout is ONE comp; under a format of another ratio its boxes sit in the
  // wrong coordinate space and report overflow that does not exist.
  const layoutOf = (entry: PreviewFormat) =>
    contract.outputs.find((output) => output.id === entry.id)?.layout ??
    (contract.layout && sameAspect(entry.ratio, contract.layout.comp) ? contract.layout : null);

  /** The render under one format, what the row changed since it, and which changes can be painted. */
  const planOf = (entry: PreviewFormat) => {
    const layout = layoutOf(entry);
    const backdrop: Backdrop | null = row
      ? pickBackdrop({
          rowId: row.id,
          rows,
          rowJob: lastJob,
          setJobs: setJobs ?? [],
          templateJobs: templateJobs ?? [],
          formats,
          formatId: entry.id,
        })
      : null;
    const renderInput = backdrop?.job.renderInput ?? null;
    const changed = backdrop ? changedKeys(contract.variables, values, renderInput) : [];
    const repaints: Repaint[] = [];
    const notPreviewed: string[] = [];
    for (const key of changed) {
      const variable = byKey.get(key);
      if (!variable) continue;
      const box = layout?.boxes.find((candidate) => candidate.key === key);
      const value = values[key];
      // A colour recolours some layer nobody measured, and a picture needs its thumbnail.
      const paintable =
        variable.kind === 'image' || variable.kind === 'video'
          ? Boolean(media[key]?.thumbnailUrl)
          : variable.kind !== 'color';
      if (box && value !== undefined && value !== '' && paintable) {
        repaints.push({ box, variable, value, media: media[key] });
      } else notPreviewed.push(nameOf(variable));
    }
    return { layout, backdrop, known: renderInput !== null, changed, repaints, notPreviewed };
  };

  // The picked format's backdrop, read once for the colours in every box a row could repaint —
  // keyed by the file, not its signed URL, so re-signing or typing never re-reads the render.
  const current = row && format ? planOf(format) : null;
  const toneSource = current?.backdrop && current.layout ? current : null;
  const toneBoxes =
    toneSource?.layout?.boxes.filter((box) => {
      const variable = byKey.get(box.key);
      return variable !== undefined && !variable.reserved && variable.kind !== 'color';
    }) ?? [];
  const tones = useQuery({
    queryKey: [
      'forge-preview-tones',
      toneSource?.backdrop?.job.id ?? null,
      toneSource?.backdrop?.file.fileName ?? null,
      toneSource?.layout?.comp ?? null,
    ],
    queryFn: () =>
      sampleTones(
        toneSource?.backdrop?.file.url as string,
        toneSource?.layout?.comp as Comp,
        toneBoxes,
      ),
    enabled: toneSource !== null && toneBoxes.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  // A realtime job is a signal to re-read, never data to merge: only the list read re-signs URLs.
  useEffect(() => {
    if (!renderSetId || !rowId) return;
    return subscribeToPostgresChanges({
      label: 'render-preview-last',
      bindings: (['INSERT', 'UPDATE'] as const).map((event) => ({
        event,
        schema: 'media',
        table: 'ad_render_jobs',
        filter: `brand_id=eq.${brandId}`,
        onRow: (job: Record<string, unknown>) => {
          if (job.status !== 'finished') return;
          if (job.render_set_row_id === rowId && lastKey) {
            void queryClient.invalidateQueries({ queryKey: lastKey });
          }
          if (job.render_set_id === renderSetId && setKey) {
            void queryClient.invalidateQueries({ queryKey: setKey });
          }
        },
      })),
    });
    // biome-ignore lint/correctness/useExhaustiveDependencies: lastKey and setKey are derived from brandId, renderSetId and rowId.
  }, [brandId, queryClient, renderSetId, rowId]);

  if (!rowId || !row) {
    return (
      <div className="flex h-full items-center justify-center p-2 text-xs text-muted-foreground">
        Select a row to preview it
      </div>
    );
  }

  const motion = motionLabel(contract.template.motion);

  const previewOf = (plan: ReturnType<typeof planOf>, backdrop: Backdrop, entry: PreviewFormat) => {
    const sampled = entry.id === format?.id ? tones : null;
    const comp = plan.layout?.comp;
    const texts = plan.repaints.some(
      (repaint) => repaint.variable.kind !== 'image' && repaint.variable.kind !== 'video',
    );
    const notes = [
      ...(plan.known && plan.changed.length === 0 ? ['same values'] : []),
      ...(texts ? ['stand-in font'] : []),
      ...(plan.known ? [] : ["can't tell what changed"]),
      ...plan.repaints
        .filter((repaint) => repaint.variable.placement?.rigged)
        .map((repaint) => `${nameOf(repaint.variable)} placement estimated`),
      ...(sampled?.isError && plan.repaints.length > 0
        ? ["neutral fill: the render's colours can't be read"]
        : []),
    ];
    const frame: PreviewRepaint = {
      mode: 'preview',
      at: backdrop.job.finishedAt ?? backdrop.job.updatedAt,
      basedOn: backdrop.job.label ?? backdrop.job.templateName,
      notes,
      node: comp ? (
        drawPreview(comp, backdrop.file.url, plan.repaints, sampled?.data)
      ) : (
        // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
        <img
          alt={`${backdrop.job.label ?? 'Render'} preview`}
          src={backdrop.file.url}
          className="size-full object-contain"
        />
      ),
    };
    return frame;
  };

  /** What one format shows, and what it cannot show, in words. */
  const viewOf = (entry: PreviewFormat): { frame: PreviewFrame; warning: string | null } => {
    const plan = planOf(entry);
    const drawing = plan.layout ? drawLayout(plan.layout, contract.variables, values, media) : null;
    const preview = plan.backdrop ? previewOf(plan, plan.backdrop, entry) : null;
    const own = lastJob ? fileForFormat(lastJob.outputs, formats, entry.id) : null;
    let frame: PreviewFrame;
    if (lastJob && own) {
      const ownBackdrop = plan.backdrop?.job.id === lastJob.id;
      const revisionStale =
        setRevision != null &&
        lastJob.renderSetRevision != null &&
        lastJob.renderSetRevision !== setRevision;
      // A recorded input answers exactly; without one, the set's revision is the best proxy.
      const stale = ownBackdrop && plan.known ? plan.changed.length > 0 : revisionStale;
      frame = {
        mode: 'rendered',
        at: lastJob.finishedAt ?? lastJob.updatedAt,
        stale,
        node:
          own.kind === 'video' ? (
            <video controls src={own.url} className="size-full object-contain">
              <track kind="captions" />
            </video>
          ) : (
            // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
            <img alt="Last render" src={own.url} className="size-full object-contain" />
          ),
        caption: own.fileName,
        ...(stale && ownBackdrop && preview ? { preview } : {}),
      };
    } else if (preview) {
      frame = preview;
    } else if (drawing) {
      const videoOnly = [lastJob, ...(setJobs ?? []), ...(templateJobs ?? [])].some(
        (job) => job && fileForFormat(job.outputs, formats, entry.id)?.kind === 'video',
      );
      frame = {
        mode: 'estimate',
        node: drawing.node,
        ...(videoOnly ? { caption: VIDEO_ONLY } : {}),
      };
    } else {
      frame = { mode: 'none' };
    }
    const previewed = frame.mode === 'preview' || (frame.mode === 'rendered' && frame.preview);
    const problems = [
      ...(drawing?.overflows ?? []),
      ...(previewed && plan.notPreviewed.length
        ? [`Not previewed: ${plan.notPreviewed.join(', ')}`]
        : []),
    ];
    return { frame, warning: problems.join(' · ') || null };
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
          warning={(entry) => viewOf(entry).warning}
          frame={(entry) => viewOf(entry).frame}
        />
      ) : (
        <p className="m-0 text-muted-foreground">This template has no measured layout to draw.</p>
      )}
    </div>
  );
}
