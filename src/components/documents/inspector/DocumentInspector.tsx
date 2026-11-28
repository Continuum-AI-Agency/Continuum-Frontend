'use client';

// The DocumentInspector: a document's page with the regions a parse found drawn on it, and
// beside it the parsed fields, one row per region. Selecting a region on either side opens
// its row into a card and draws a link between the two. Used by Knowledge and Jaina, so the
// selection can be controlled (`selectedRegionId` / `onSelectRegion`) and a cited passage can
// be put back on its page (`focusPassage`).
//
// Motion follows the PDF Parse film: a scan line while the page is read, outlines that draw
// on, rows that slide in, a curved link. All of it is off under prefers-reduced-motion.

import {
  type DocumentLayout,
  type DocumentRegion,
  type DocumentRegionCategory,
  regionForPassage,
} from '@continuum/contracts';
import {
  AlertCircle,
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Download,
  FileText,
  Info,
  Loader2,
  RotateCw,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { DocumentPage } from './DocumentPage';
import { REGION_STYLE } from './regionStyle';

export type DocumentInspectorState =
  | { status: 'parsing' }
  | {
      status: 'parsed';
      layout: DocumentLayout;
      fileUrl: string;
      mimeType: string;
      cached: boolean;
    }
  | { status: 'unsupported' }
  | { status: 'error' };

type Translate = ReturnType<typeof useTranslations<'common'>>;

const tint = (color: string, percent: number) =>
  `color-mix(in oklab, ${color} ${percent}%, transparent)`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function DocumentInspector({
  state,
  name,
  selectedRegionId,
  onSelectRegion,
  focusPassage,
  onRerun,
  className,
}: {
  state: DocumentInspectorState;
  /** The file's name: the page's alt text and the exported JSON's file name. */
  name: string;
  selectedRegionId?: string | null;
  onSelectRegion?: (regionId: string | null) => void;
  /** A quoted passage (a citation); the region it came from is selected when found. */
  focusPassage?: string;
  /** Parse again, ignoring a stored layout. Also the retry after a failure. */
  onRerun?: () => void;
  className?: string;
}) {
  const uiText = useTranslations('common');
  const reduceMotion = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const [innerSelection, setInnerSelection] = useState<string | null>(null);
  const selectedId = selectedRegionId !== undefined ? selectedRegionId : innerSelection;
  // A ref, so a parent passing a fresh callback each render does not re-run the effects below.
  const onSelectRef = useRef(onSelectRegion);
  onSelectRef.current = onSelectRegion;
  const select = useCallback((id: string | null) => {
    setInnerSelection(id);
    onSelectRef.current?.(id);
  }, []);

  const layout = state.status === 'parsed' ? state.layout : null;
  const regions = layout?.regions ?? [];
  const selected = regions.find((region) => region.id === selectedId) ?? null;
  const [page, setPage] = useState(1);
  const pageCount = layout?.pageCount ?? 1;
  const shownPage = selected?.box.page ?? page;
  const selectedPage = selected?.box.page;

  useEffect(() => {
    if (selectedPage) setPage(selectedPage);
  }, [selectedPage]);

  useEffect(() => {
    if (!layout || !focusPassage) return;
    const match = regionForPassage(layout.regions, focusPassage);
    if (match) select(match.id);
  }, [layout, focusPassage, select]);

  useEffect(() => {
    if (!selectedId) return;
    const root = rootRef.current;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    for (const selector of [`[data-region-id="${selectedId}"]`, `[data-row-id="${selectedId}"]`]) {
      root?.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior });
    }
  }, [selectedId, reduceMotion]);

  const link = useRegionLink(rootRef, selectedId);

  return (
    <div
      ref={rootRef}
      data-slot="document-inspector"
      className={cn(
        'relative grid min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] overflow-hidden rounded-xl border bg-background md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] md:grid-rows-1',
        className,
      )}
    >
      <section className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs tracking-wide text-muted-foreground uppercase">
            {name}
          </span>
          {pageCount > 1 ? (
            <PagePicker
              page={shownPage}
              pageCount={pageCount}
              onPage={(next) => {
                setPage(next);
                if (selected && selected.box.page !== next) select(null);
              }}
              uiText={uiText}
            />
          ) : null}
        </header>
        <div
          className={cn(
            'relative h-0.5 shrink-0 overflow-hidden',
            state.status === 'parsing' ? 'bg-muted' : 'bg-transparent',
          )}
        >
          {state.status === 'parsing' && !reduceMotion ? (
            <motion.div
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-chart-1 to-chart-4"
              initial={{ left: '-33%' }}
              animate={{ left: '100%' }}
              transition={{ duration: 1.6, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY }}
            />
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] p-4 sm:p-8">
          <div className="relative mx-auto w-full max-w-2xl rounded-md shadow-lg ring-1 ring-foreground/10">
            {state.status === 'parsed' ? (
              <DocumentPage
                fileUrl={state.fileUrl}
                mimeType={state.mimeType}
                page={shownPage}
                alt={name}
                className="rounded-md"
              />
            ) : (
              <Skeleton className="aspect-[1/1.414] w-full rounded-md bg-muted/70" />
            )}
            {state.status === 'parsing' && !reduceMotion ? <ScanLine /> : null}
            {regions
              .filter((region) => region.box.page === shownPage)
              .map((region, index) => (
                <RegionBox
                  key={region.id}
                  region={region}
                  order={index}
                  selected={region.id === selectedId}
                  dimmed={selectedId !== null && region.id !== selectedId}
                  reduceMotion={reduceMotion}
                  onSelect={() => select(region.id === selectedId ? null : region.id)}
                  uiText={uiText}
                />
              ))}
          </div>
        </div>
      </section>

      <Tabs defaultValue="fields" className="flex min-h-0 flex-col gap-0">
        <div className="flex h-11 shrink-0 items-center border-b px-3">
          <TabsList variant="line">
            <TabsTrigger value="fields">{uiText('inspectorTabFields')}</TabsTrigger>
            <TabsTrigger value="json">{uiText('inspectorTabJson')}</TabsTrigger>
          </TabsList>
        </div>
        <StatusBanner state={state} name={name} onRerun={onRerun} uiText={uiText} />
        <TabsContent value="fields" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          {state.status === 'parsed' ? (
            regions.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {regions.map((region, index) => (
                  <RegionRow
                    key={region.id}
                    region={region}
                    order={index}
                    open={region.id === selectedId}
                    reduceMotion={reduceMotion}
                    onOpenChange={(open) => select(open ? region.id : null)}
                    uiText={uiText}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                {uiText('inspectorNoRegions')}
              </p>
            )
          ) : state.status === 'parsing' ? (
            <EmptyRows uiText={uiText} />
          ) : null}
        </TabsContent>
        <TabsContent value="json" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          {layout ? (
            <pre className="rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(layout, null, 2)}
            </pre>
          ) : null}
        </TabsContent>
      </Tabs>

      {link ? (
        <svg
          className="pointer-events-none absolute inset-0 hidden size-full md:block"
          aria-hidden="true"
        >
          <motion.path
            key={selectedId}
            d={link.path}
            fill="none"
            style={{ stroke: link.color }}
            strokeWidth={1.5}
            strokeLinecap="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          />
        </svg>
      ) : null}
    </div>
  );
}

/**
 * The S-shaped link from the selected region's right edge to its row, in the inspector's own
 * coordinates. Measured every frame while a region is selected, because rows above open and
 * close and both sides scroll; state changes only when the path does.
 */
function useRegionLink(
  rootRef: React.RefObject<HTMLDivElement | null>,
  selectedId: string | null,
): { path: string; color: string } | null {
  const [link, setLink] = useState<{ path: string; color: string } | null>(null);
  useEffect(() => {
    if (!selectedId) {
      setLink(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      const root = rootRef.current;
      const region = root?.querySelector<HTMLElement>(`[data-region-id="${selectedId}"]`);
      const row = root?.querySelector<HTMLElement>(`[data-row-id="${selectedId}"]`);
      let next: { path: string; color: string } | null = null;
      if (root && region && row) {
        const origin = root.getBoundingClientRect();
        const from = region.getBoundingClientRect();
        const to = row.getBoundingClientRect();
        const x1 = from.right - origin.left;
        const y1 = from.top + from.height / 2 - origin.top;
        const x2 = to.left - origin.left;
        const y2 = Math.min(to.top + 28, to.bottom) - origin.top;
        const visible = y1 > 0 && y1 < origin.height && y2 > 0 && y2 < origin.height;
        if (x2 > x1 && visible) {
          const mid = (x1 + x2) / 2;
          next = {
            path: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`,
            color: region.style.getPropertyValue('--region'),
          };
        }
      }
      setLink((current) =>
        current?.path === next?.path && current?.color === next?.color ? current : next,
      );
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [rootRef, selectedId]);
  return link;
}

function ScanLine() {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-chart-1 to-chart-4 shadow-[0_0_12px_2px_var(--chart-1)]"
      initial={{ top: '0%' }}
      animate={{ top: '100%' }}
      transition={{ duration: 3, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY }}
    >
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-chart-1/10" />
    </motion.div>
  );
}

function RegionBox({
  region,
  order,
  selected,
  dimmed,
  reduceMotion,
  onSelect,
  uiText,
}: {
  region: DocumentRegion;
  order: number;
  selected: boolean;
  dimmed: boolean;
  reduceMotion: boolean;
  onSelect: () => void;
  uiText: Translate;
}) {
  const { color } = REGION_STYLE[region.category];
  const { box } = region;
  const delay = Math.min(order * 0.08, 0.8);
  return (
    <button
      type="button"
      data-region-id={region.id}
      aria-pressed={selected}
      aria-label={`${categoryLabel(region.category, uiText)}: ${region.preview || region.name}`}
      onClick={onSelect}
      className="group absolute rounded-[3px] outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-ring"
      style={
        {
          '--region': color,
          left: percent(box.x),
          top: percent(box.y),
          width: percent(box.w),
          height: percent(box.h),
          backgroundColor: tint(color, selected ? 14 : 8),
          opacity: dimmed ? 0.55 : 1,
        } as CSSProperties
      }
    >
      <svg
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        aria-hidden="true"
      >
        <motion.rect
          width="100%"
          height="100%"
          rx={3}
          fill="none"
          style={{ stroke: color }}
          strokeWidth={selected ? 2.5 : 1.25}
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        />
      </svg>
      <span
        className={cn(
          'pointer-events-none absolute -top-6 left-0 rounded bg-foreground/90 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-background uppercase transition-opacity',
          selected
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
      >
        {categoryLabel(region.category, uiText)}
      </span>
      {selected
        ? (
            [
              '-top-1 -left-1',
              '-top-1 -right-1',
              '-bottom-1 -left-1',
              '-bottom-1 -right-1',
            ] as const
          ).map((corner) => (
            <motion.span
              key={corner}
              aria-hidden="true"
              className={cn('absolute size-2 rounded-[2px] border bg-background', corner)}
              style={{ borderColor: color }}
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 18 }}
            />
          ))
        : null}
    </button>
  );
}

function RegionRow({
  region,
  order,
  open,
  reduceMotion,
  onOpenChange,
  uiText,
}: {
  region: DocumentRegion;
  order: number;
  open: boolean;
  reduceMotion: boolean;
  onOpenChange: (open: boolean) => void;
  uiText: Translate;
}) {
  const { color, icon: Icon } = REGION_STYLE[region.category];
  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: Math.min(order * 0.06, 0.6), ease: 'easeOut' }}
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div
          data-row-id={region.id}
          className="rounded-xl border bg-card transition-[border-color,box-shadow] duration-300"
          style={
            open ? { borderColor: color, boxShadow: `0 0 0 3px ${tint(color, 18)}` } : undefined
          }
        >
          <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg"
              style={{ color, backgroundColor: tint(color, 14) }}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {categoryLabel(region.category, uiText)} / {region.name}
              </span>
              <span className="block truncate text-sm">{region.preview || region.text}</span>
            </span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {uiText('inspectorPageShort', { page: region.box.page })}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-300 ease-in-out data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none">
            <RegionCard region={region} uiText={uiText} />
          </CollapsibleContent>
        </div>
      </Collapsible>
    </motion.li>
  );
}

function RegionCard({ region, uiText }: { region: DocumentRegion; uiText: Translate }) {
  const locale = useLocale();
  const confidence = new Intl.NumberFormat(locale, { style: 'percent' }).format(region.confidence);
  return (
    <div className="flex flex-col gap-3 border-t px-3 pt-3 pb-3">
      {region.table ? (
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              {region.table.columns.map((column) => (
                <TableHead key={column} className="h-7 font-mono text-[10px] uppercase">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {region.table.rows.map((row, rowIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: parsed rows have no identity of their own
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                  <TableCell key={cellIndex} className="py-1.5">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {region.fields.length > 0 ? (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {region.fields.map((field) => (
            <div key={field.name} className="contents">
              <dt className="truncate font-mono text-[10px] leading-5 text-muted-foreground uppercase">
                {field.name}
              </dt>
              <dd className="flex min-w-0 items-start gap-1.5 text-sm">
                <span className="min-w-0 break-words">{field.value}</span>
                {field.verified ? (
                  <CircleCheck
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-label={uiText('inspectorVerified')}
                  />
                ) : (
                  <CircleDashed
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-label={uiText('inspectorUnverified')}
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!region.table && region.fields.length === 0 ? (
        <p className="line-clamp-6 text-sm text-muted-foreground italic">{region.text}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase">
          {uiText('inspectorConfidence')}
        </span>
        <Progress value={region.confidence * 100} className="h-1.5 flex-1" />
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums">
          {confidence}
        </span>
      </div>
      <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground uppercase">
        <span>{uiText('inspectorBox')}</span>
        <span className="tabular-nums">X {percent(region.box.x)}</span>
        <span className="tabular-nums">Y {percent(region.box.y)}</span>
        <span className="tabular-nums">W {percent(region.box.w)}</span>
        <span className="tabular-nums">H {percent(region.box.h)}</span>
      </div>
    </div>
  );
}

function StatusBanner({
  state,
  name,
  onRerun,
  uiText,
}: {
  state: DocumentInspectorState;
  name: string;
  onRerun?: () => void;
  uiText: Translate;
}) {
  const locale = useLocale();
  const tone = {
    parsing: {
      icon: <Loader2 className="size-4 animate-spin" />,
      text: uiText('inspectorParsing'),
    },
    error: {
      icon: <AlertCircle className="size-4 text-destructive" />,
      text: uiText('inspectorFailed'),
    },
    unsupported: { icon: <Info className="size-4" />, text: uiText('inspectorUnsupported') },
  } as const;

  let icon = tone.parsing.icon;
  let text = tone.parsing.text;
  let detail: string | null = null;
  if (state.status === 'parsed') {
    const { layout } = state;
    icon = <Check className="size-4 text-success" />;
    text = uiText('inspectorParsed', {
      regions: layout.regions.length,
      fields: layout.regions.reduce((sum, region) => sum + region.fields.length, 0),
    });
    detail = state.cached
      ? uiText('inspectorSaved')
      : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(layout.durationMs / 1000)}s`;
  } else if (state.status !== 'parsing') {
    ({ icon, text } = tone[state.status]);
  }

  return (
    <div className="mx-3 my-3 flex min-h-12 shrink-0 items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-background"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="min-w-0 flex-1 text-sm" role="status">
        {text}
        {detail ? (
          <span className="ml-1.5 font-mono text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </p>
      {state.status === 'parsed' ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={uiText('inspectorExportJson')}
          onClick={() => downloadJson(state.layout, name)}
        >
          <Download />
        </Button>
      ) : null}
      {onRerun && (state.status === 'parsed' || state.status === 'error') ? (
        <Button variant="outline" size="sm" onClick={onRerun}>
          <RotateCw data-icon="inline-start" />
          {state.status === 'error' ? uiText('inspectorRetry') : uiText('inspectorRerun')}
        </Button>
      ) : null}
    </div>
  );
}

function EmptyRows({ uiText }: { uiText: Translate }) {
  return (
    <ul className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li
          key={row}
          className="flex h-12 items-center gap-2 rounded-xl border border-dashed px-3 text-xs text-muted-foreground"
        >
          {row === 0 ? (
            <>
              <Braces className="size-3.5 shrink-0" />
              {uiText('inspectorEmpty')}
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function PagePicker({
  page,
  pageCount,
  onPage,
  uiText,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  uiText: Translate;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={uiText('inspectorPreviousPage')}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft />
      </Button>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {uiText('inspectorPage', { page, count: pageCount })}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={uiText('inspectorNextPage')}
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function categoryLabel(category: DocumentRegionCategory, uiText: Translate) {
  return uiText('inspectorCategory', { category });
}

function downloadJson(layout: DocumentLayout, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.replace(/\.[^.]+$/, '')}.layout.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
