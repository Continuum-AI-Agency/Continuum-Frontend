'use client';

import {
  type ApiRenderFitVerdict,
  type ApiRenderInputValue,
  checkLiveFit,
  type ForgeRenderLive,
  livePictureKey,
  livePinOf,
  paintLive,
  type ScenePicture,
  worstFitByKey,
} from '@continuum/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { type JSX, memo, useEffect, useMemo } from 'react';
import type { PreviewFormat } from '@/components/forge/FormatPreview';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// The Live preview: the template's own scene for one format, fetched once, painted in the browser
// on every keystroke, colour drag and picture swap — for the row on screen and for every row in
// the strip, from the same kit. Text is laid out here exactly as the template parser lays it out
// (`forge-live-text.ts` in the contracts, benched against the parser line for line); the drawing
// is the Backend's own painter. The picture is an SVG shown through an <img>: it runs nothing and
// loads nothing, because everything it draws arrives embedded.

type Kit = ForgeRenderLive;
type Variable = Kit['variables'][number];

/** How many rows the strip draws; the rest are counted. */
const STRIP_MAX = 24;

const isSlot = (variable: Variable) =>
  !variable.reserved &&
  (variable.kind === 'image' || variable.kind === 'video') &&
  variable.layerIds.length > 0;

type KitArgs = {
  brandId: string;
  environment: string;
  templateKey: string;
  format: PreviewFormat;
  atSec: number | null;
};

/** One format's kit, as a query: shared by the format on screen and the ones prefetched beside it. */
export const liveKitQuery = ({ brandId, environment, templateKey, format, atSec }: KitArgs) => ({
  queryKey: [
    'forge-live',
    brandId,
    environment,
    templateKey,
    format.id,
    format.ratio,
    format.comp?.name ?? null,
    atSec,
  ],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiRendersApi.livePreview(
      {
        brandId,
        environment,
        templateKey,
        format: { id: format.id, ratio: format.ratio, comp: format.comp?.name ?? null },
        ...(atSec !== null ? { atSec } : {}),
      },
      signal,
    ),
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
});

export function useLiveKit(
  args: Omit<KitArgs, 'format'> & { format: PreviewFormat | undefined; enabled: boolean },
) {
  const { format, enabled, ...rest } = args;
  // The key and the fetch are the picked format's; with none picked the query never runs.
  const query = liveKitQuery({
    ...rest,
    format: format ?? ({ id: '', ratio: null, comp: null } as unknown as PreviewFormat),
  });
  return useQuery({ ...query, enabled: enabled && Boolean(format) });
}

/** A row's fit, per variable key: `checkLiveFit` over every format's kit, worst format winning. */
export type LiveFitOf = (
  values: Readonly<Record<string, ApiRenderInputValue>>,
  assetSize?: (variableKey: string) => { w: number; h: number } | null,
) => ReadonlyMap<string, ApiRenderFitVerdict>;

/**
 * Does each value still fit the design — asked while it is typed. Every format's kit (the same
 * query the Live preview paints from, so nothing is fetched twice) through `checkLiveFit`, the
 * arithmetic preflight repeats on the server. No model, no round trip per keystroke. Null until
 * a kit has landed; a format whose kit never does is simply not checked here, and preflight
 * still asks.
 */
export function useLiveFit(args: {
  brandId: string;
  environment: string | null;
  templateKey: string | null;
  formats: readonly PreviewFormat[];
  enabled: boolean;
}): LiveFitOf | null {
  const { brandId, environment, templateKey, formats, enabled } = args;
  const kits = useQueries({
    queries: formats.map((format) => ({
      ...liveKitQuery({
        brandId,
        environment: environment ?? '',
        templateKey: templateKey ?? '',
        format,
        atSec: null,
      }),
      enabled: enabled && Boolean(environment && templateKey),
    })),
  });
  const stamp = kits.map((query) => query.dataUpdatedAt).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` changes exactly when a kit lands.
  return useMemo(() => {
    const loaded = kits.flatMap((query, i) =>
      query.data ? [{ format: formats[i]?.ratio ?? formats[i]?.label ?? '', kit: query.data }] : [],
    );
    if (loaded.length === 0) return null;
    return (values, assetSize) =>
      new Map(
        worstFitByKey(
          loaded.map(({ format, kit }) => ({
            format,
            verdicts: checkLiveFit({ kit, values, assetSize }),
          })),
        ).map((verdict) => [verdict.key, verdict]),
      );
  }, [stamp]);
}

/**
 * Every Library picture the rows put in a slot, each fetched once: a picked picture is the one
 * edit that needs bytes the browser does not have. Until it lands its slot draws empty.
 */
export function useLivePictures(
  brandId: string,
  kit: Kit | undefined,
  valuesList: readonly Readonly<Record<string, ApiRenderInputValue>>[],
): ReadonlyMap<string, ScenePicture | null> {
  const wanted = new Map<
    string,
    { pin: NonNullable<ReturnType<typeof livePinOf>>; kind: 'image' | 'video' }
  >();
  for (const variable of kit?.variables.filter(isSlot) ?? []) {
    for (const values of valuesList) {
      const pin = livePinOf(values[variable.key]);
      if (pin)
        wanted.set(livePictureKey(pin, variable.kind), {
          pin,
          kind: variable.kind as 'image' | 'video',
        });
    }
  }
  const entries = [...wanted.entries()];
  const results = useQueries({
    queries: entries.map(([key, { pin, kind }]) => ({
      queryKey: ['forge-live-picture', brandId, kit?.at ?? null, key],
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (
          await apiRendersApi.previewPictures(
            {
              brandId,
              at: kit?.at ?? 0,
              pins: [
                {
                  assetId: pin.assetId,
                  ...(pin.versionId ? { versionId: pin.versionId } : {}),
                  kind,
                },
              ],
            },
            signal,
          )
        ).pictures[0] ?? null,
      enabled: Boolean(kit),
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    })),
  });
  const version = entries.map(([key], i) => `${key}=${results[i]?.dataUpdatedAt ?? 0}`).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` names every entry and when its data last changed.
  return useMemo(
    () => new Map(entries.map(([key], i) => [key, results[i]?.data ?? null])),
    [version],
  );
}

/** A painted SVG as an image. `since` marks when the paint began, for `forge-live-frame`. */
export function LiveImage({
  svg,
  alt,
  className,
  since,
}: {
  svg: string;
  alt: string;
  className?: string;
  since?: number;
}): JSX.Element {
  const url = useMemo(() => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), [svg]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    // biome-ignore lint/performance/noImgElement: a blob URL painted per keystroke, not a Next-optimisable asset
    <img
      alt={alt}
      src={url}
      className={className}
      onLoad={() => {
        if (since !== undefined)
          performance.measure('forge-live-frame', { start: since, end: performance.now() });
      }}
    />
  );
}

const LiveThumb = memo(function LiveThumb({
  kit,
  label,
  valuesKey,
  pictures,
  selected,
  onSelect,
}: {
  kit: Kit;
  label: string;
  valuesKey: string;
  pictures: ReadonlyMap<string, ScenePicture | null>;
  selected: boolean;
  onSelect: () => void;
}) {
  const paint = useMemo(
    () => paintLive(kit, JSON.parse(valuesKey), pictures),
    [kit, valuesKey, pictures],
  );
  const { width, height } = kit.scene.comp;
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={label}
      onClick={onSelect}
      className={cn(
        'flex w-20 shrink-0 flex-col gap-0.5 rounded-sm border p-0.5 text-left',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground',
      )}
    >
      <span
        className="block w-full overflow-hidden bg-background"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <LiveImage svg={paint.svg} alt={label} className="size-full object-contain" />
      </span>
      <span className="truncate text-2xs text-muted-foreground">{label}</span>
    </button>
  );
});

/** Every row of the set, live, at the format on screen: pick one to preview it. */
export function VariationStrip({
  kit,
  rows,
  pictures,
  selectedId,
  onSelect,
}: {
  kit: Kit;
  rows: readonly {
    id: string;
    label: string;
    values: Readonly<Record<string, ApiRenderInputValue>>;
  }[];
  pictures: ReadonlyMap<string, ScenePicture | null>;
  selectedId: string;
  onSelect: (rowId: string) => void;
}): JSX.Element {
  return (
    <fieldset
      aria-label="All variations"
      className="m-0 flex min-w-0 shrink-0 items-end gap-1.5 overflow-x-auto border-0 p-0 pb-1"
    >
      {rows.slice(0, STRIP_MAX).map((row) => (
        <LiveThumb
          key={row.id}
          kit={kit}
          label={row.label.trim() || 'Untitled'}
          valuesKey={JSON.stringify(row.values)}
          pictures={pictures}
          selected={row.id === selectedId}
          onSelect={() => onSelect(row.id)}
        />
      ))}
      {rows.length > STRIP_MAX ? (
        <span className="shrink-0 text-2xs text-muted-foreground">
          +{rows.length - STRIP_MAX} more
        </span>
      ) : null}
    </fieldset>
  );
}
