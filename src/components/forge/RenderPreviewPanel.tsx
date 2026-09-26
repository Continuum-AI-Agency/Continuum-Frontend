'use client';

import {
  type ApiRenderInputValue,
  type ApiRenderJob,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateLayout,
  type ApiRenderVariable,
  changedKeys,
  type ForgeRenderPreview,
  isMotion,
  motionLabel,
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
import { useDebounce } from '@/hooks/useDebounce';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { type Backdrop, pickBackdrop } from './previewBackdrop';
import {
  effectiveMedia,
  effectiveOutputIds,
  effectiveValues,
  type RequestRow,
  type RequestRowMedia,
} from './renderRequestRows';

// One row, before a render is spent on it. The picture is composed on the server — brand faces
// never reach a browser, and the render bucket sends no CORS headers — from the closest real
// render of the format (this row's, the nearest row's in the set, else the template's newest):
// every layer the row did not change stays that render's own pixels, and each changed layer is
// set by the template's parser in the template's faces, in its colours, where After Effects will
// put it. With no render anywhere the template is drawn whole. The slot-box wireframe below is
// only what shows while the first composition is on its way, or when none can be made.

// ponytail: no text measurement — a flat 0.55em glyph and 1.2em line stand in for the real face,
// kerning and AE's paragraph box. The wireframe is the fallback; the composed preview measures.
const GLYPH_EM = 0.55;
const LINE_EM = 1.2;
const MAX_SIZE_OF_BOX = 0.8;
const SAMPLE_FLOOR_RATIO = 0.4;
const FLOOR_PX = 12;
/** A keystroke waits this long before it costs a composition. */
const COMPOSE_DEBOUNCE_MS = 400;

type Box = ApiRenderTemplateLayout['boxes'][number];

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

/** Keys of one composition: everything but the settled values names WHAT is being previewed. */
const composeKeyOf = (
  subject: readonly (string | null)[],
  settled: string,
): readonly (string | null)[] => ['forge-preview', ...subject, settled];

const sameSubject = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.slice(0, -1).every((part, index) => part === b[index]);

const COMPOSE_FAILED = 'Composed preview unavailable — showing the measured boxes.';

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
  const [atSec, setAtSec] = useState<number | null>(null);
  const lastKey =
    rowId && renderSetId ? forgeQueryKeys.renderJobRowLatest(brandId, renderSetId, rowId) : null;
  // One row-scoped read per row, cached: the newest finished render of the row on screen.
  const { data: lastJob, isFetched: lastRead } = useQuery({
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
  const { data: setJobs, isFetched: setRead } = useQuery({
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
  const { data: templateJobs, isFetched: templateRead } = useQuery({
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

  // The template-level layout is ONE comp; under a format of another ratio its boxes sit in the
  // wrong coordinate space and report overflow that does not exist.
  const layoutOf = (entry: PreviewFormat) =>
    contract.outputs.find((output) => output.id === entry.id)?.layout ??
    (contract.layout && sameAspect(entry.ratio, contract.layout.comp) ? contract.layout : null);

  /** The render under one format, and which of the row's values it was not made with. */
  const planOf = (entry: PreviewFormat) => {
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
    return {
      layout: layoutOf(entry),
      backdrop,
      known: renderInput !== null,
      changed: backdrop ? changedKeys(contract.variables, values, renderInput) : [],
    };
  };

  // The picked format is composed once the row stops changing. The subject is part of what is
  // debounced, so switching rows never composes one row's values over another's render.
  const current = row && format ? planOf(format) : null;
  const subject = [
    brandId,
    contract.template.environment,
    templateKey,
    format?.id ?? null,
    row?.id ?? null,
    current?.backdrop?.job.id ?? null,
    current?.backdrop?.file.fileName ?? null,
    atSec === null ? null : String(atSec),
  ];
  const live = JSON.stringify([subject, values]);
  const settled = useDebounce(live, COMPOSE_DEBOUNCE_MS);
  const settledValues = (() => {
    const [settledSubject, settledRow] = JSON.parse(settled) as [unknown[], unknown];
    return sameSubject([...settledSubject, null], [...subject, null])
      ? (settledRow as Record<string, ApiRenderInputValue>)
      : null;
  })();
  // Nothing is composed until every render the backdrop could come from has been read: before
  // then "no render anywhere" is only "not loaded yet", and would draw the template whole.
  const backdropKnown =
    (lastKey === null || lastRead) && (setKey === null || setRead) && templateRead;
  const needsCompose =
    backdropKnown &&
    current !== null &&
    (current.backdrop === null || current.changed.length > 0 || atSec !== null);
  const composeKey = composeKeyOf(subject, settled);
  const composed = useQuery({
    queryKey: composeKey,
    queryFn: (): Promise<ForgeRenderPreview> =>
      apiRendersApi.composePreview({
        brandId,
        environment: contract.template.environment,
        templateKey,
        format: {
          id: (format as PreviewFormat).id,
          ratio: (format as PreviewFormat).ratio,
          comp: (format as PreviewFormat).comp?.name ?? null,
        },
        values: settledValues ?? {},
        ...(atSec !== null ? { atSec } : {}),
        backdrop: current?.backdrop
          ? { jobId: current.backdrop.job.id, fileName: current.backdrop.file.fileName }
          : null,
      }),
    enabled: needsCompose && settledValues !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    // Typing keeps the last settled picture on screen; another row or format never borrows it.
    placeholderData: (previous, previousQuery) =>
      previousQuery && sameSubject(previousQuery.queryKey, composeKey) ? previous : undefined,
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
  const pending = composed.isFetching || settled !== live;

  /** The row as the server composed it — only ever for the picked format. */
  const composedFrame = (backdrop: Backdrop | null): PreviewRepaint | null => {
    const data = composed.data;
    if (!data) return null;
    return {
      mode: 'preview',
      at: data.source === 'render' ? (backdrop?.job.finishedAt ?? null) : null,
      basedOn:
        data.source === 'render'
          ? (data.basedOn?.label ?? backdrop?.job.label ?? backdrop?.job.templateName ?? 'last')
          : null,
      notes: data.notes,
      pending,
      node: (
        // biome-ignore lint/performance/noImgElement: a data URL composed per edit, not a Next-optimisable asset
        <img alt="Composed preview" src={data.image} className="size-full object-contain" />
      ),
    };
  };

  /** A render made with exactly these values is the preview as it stands. */
  const unchangedFrame = (backdrop: Backdrop): PreviewRepaint => ({
    mode: 'preview',
    at: backdrop.job.finishedAt ?? backdrop.job.updatedAt,
    basedOn: backdrop.job.label ?? backdrop.job.templateName,
    notes: ['same values'],
    node:
      backdrop.file.kind === 'video' ? (
        <video controls src={backdrop.file.url} className="size-full object-contain">
          <track kind="captions" />
        </video>
      ) : (
        // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
        <img alt="Render" src={backdrop.file.url} className="size-full object-contain" />
      ),
  });

  /** What the picked format shows, and what it cannot show, in words. */
  const viewOf = (entry: PreviewFormat): { frame: PreviewFrame; warning: string | null } => {
    const plan = planOf(entry);
    const drawing = plan.layout ? drawLayout(plan.layout, contract.variables, values, media) : null;
    const composedPreview = composedFrame(plan.backdrop);
    const preview =
      plan.backdrop && plan.known && plan.changed.length === 0 && atSec === null
        ? unchangedFrame(plan.backdrop)
        : composedPreview;
    const own = lastJob ? fileForFormat(lastJob.outputs, formats, entry.id) : null;
    let frame: PreviewFrame;
    if (lastJob && own && atSec === null) {
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
      frame = {
        mode: 'estimate',
        node: drawing.node,
        caption: composed.isError
          ? COMPOSE_FAILED
          : needsCompose
            ? 'Composing the preview…'
            : undefined,
      };
    } else {
      frame = {
        mode: 'none',
        message: composed.isError
          ? COMPOSE_FAILED
          : needsCompose
            ? 'Composing the preview…'
            : undefined,
      };
    }
    const showsComposed =
      composedPreview !== null &&
      preview === composedPreview &&
      (frame === preview || (frame.mode === 'rendered' && frame.preview === preview));
    const data = showsComposed ? composed.data : undefined;
    const problems = [
      // Whatever stands in for it, a composition that failed is said, not silently skipped.
      ...(composed.isError && needsCompose && frame.mode !== 'estimate' && frame.mode !== 'none'
        ? ['Composed preview unavailable']
        : []),
      ...(data
        ? [
            ...data.overflows.map((label) => `${label} overflows its box`),
            ...(data.notPreviewed.length ? [`Not previewed: ${data.notPreviewed.join(', ')}`] : []),
          ]
        : (drawing?.overflows ?? [])),
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
      {contract.template.motion &&
      isMotion(contract.template.motion.durationSec, contract.template.motion.frameRate) ? (
        <label className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground">
          <span>Frame</span>
          <input
            type="range"
            min={0}
            max={Math.max(
              0,
              Math.floor(
                contract.template.motion.durationSec * contract.template.motion.frameRate,
              ) - 1,
            )}
            value={Math.round((atSec ?? 0) * contract.template.motion.frameRate)}
            onChange={(event) =>
              setAtSec(Number(event.target.value) / contract.template.motion!.frameRate)
            }
            className="min-w-0 flex-1"
            aria-label="Preview frame"
          />
          <span>{atSec === null ? 'Auto' : `${atSec.toFixed(2)}s`}</span>
        </label>
      ) : null}
    </div>
  );
}
