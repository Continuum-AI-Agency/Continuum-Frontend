'use client';

import type {
  ApiRenderJob,
  TemplatePreview,
  TemplateRevisionVariant,
  TemplateSourceSummary,
} from '@continuum/contracts';
import { TEMPLATE_SOURCE_KIND_LABELS, templateDisplayName } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Pencil,
  Search,
  Settings2,
} from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { ForgeProjectDrop } from '@/components/forge/ForgeProjectDrop';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { pluralize } from '@/lib/format/pluralize';
import {
  fetchTemplateRevisionVariants,
  fetchTemplateVariants,
} from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  InlineRename,
  type SharedTemplate,
  SharedTemplateCard,
  sharedTemplateId,
  sourceDisplayName,
  TEMPLATE_STATUS,
  TemplateFacts,
  TemplateHoverPreview,
  type TemplateStatus,
  TemplateStatusPill,
  templateStatus,
} from './TemplateCard';

// Every template the brand can work with, as one searchable gallery: its own uploads, and the
// templates others built into the shared workspace that it can add. The detail panel is where a
// template is worked on; this is where one is found.

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'shared', label: 'Shared with you' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

// Its own axis, so "Ready" and "Animated" narrow together rather than replacing each other.
const MOTIONS = [
  { id: 'animated', label: 'Animated' },
  { id: 'static', label: 'Static' },
] as const;
type Motion = (typeof MOTIONS)[number]['id'];

const SOURCE_TYPES = { all: 'All source types', ...TEMPLATE_SOURCE_KIND_LABELS } as const;
type SourceType = keyof typeof SOURCE_TYPES;
const typeOf = (item: Item): Exclude<SourceType, 'all'> =>
  item.sourceKind
    ? item.sourceKind
    : item.kind === 'source' && item.source.family.startsWith('after_effects')
      ? 'after_effects'
      : item.kind === 'source' && item.source.family in SOURCE_TYPES
        ? (item.source.family as Exclude<SourceType, 'all'>)
        : item.kind === 'shared'
          ? 'after_effects'
          : 'other';
// The columns a person sorts by, clicking the header. Source sorts animated before static within a
// type, so "every animated After Effects template" reads as one run of rows.
const SORT_COLUMNS = {
  name: 'Template',
  type: 'Source',
  status: 'Status',
  updated: 'Updated',
} as const;
type SortKey = keyof typeof SORT_COLUMNS;
type Sort = { key: SortKey; dir: 'asc' | 'desc' };
const MOTION_RANK: Record<Motion | 'unknown', number> = { animated: 0, static: 1, unknown: 2 };

const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
    active
      ? 'border-primary bg-primary/10 text-foreground'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  );

const toggled = (keys: Set<string>, key: string) => {
  const next = new Set(keys);
  if (!next.delete(key)) next.add(key);
  return next;
};

const statusOf = (item: Item): TemplateStatus =>
  item.kind === 'source' ? item.status : item.shared.draft ? 'draft' : 'ready';

/** Ties fall back to the name, so a sort never shuffles equal rows between renders. */
function compareItems(a: Item, b: Item, { key, dir }: Sort): number {
  const order =
    key === 'name'
      ? 0
      : key === 'type'
        ? SOURCE_TYPES[typeOf(a)].localeCompare(SOURCE_TYPES[typeOf(b)]) ||
          MOTION_RANK[a.motion ?? 'unknown'] - MOTION_RANK[b.motion ?? 'unknown']
        : key === 'status'
          ? TEMPLATE_STATUS[statusOf(a)].label.localeCompare(TEMPLATE_STATUS[statusOf(b)].label)
          : a.updatedAt.localeCompare(b.updatedAt);
  return (dir === 'asc' ? 1 : -1) * (order || a.name.localeCompare(b.name));
}

function SortHead({
  column,
  sort,
  onSort,
  className,
}: {
  column: SortKey;
  sort: Sort;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        // Its own name: the Render picker's trigger is already the page's "Template" button.
        aria-label={`Sort by ${SORT_COLUMNS[column]}`}
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden"
      >
        {SORT_COLUMNS[column]}
        <Icon className={cn('size-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}

/**
 * One variant or published build, as a row under its template: the same columns, one step in, with
 * Edit opening it in the layer editor and its picture on hover, like the template above it.
 */
function SubRow({
  name,
  detail,
  source,
  ratios,
  status,
  updatedAt,
  preview,
  onOpen,
  onEdit,
  children,
}: {
  name: string;
  detail: string;
  source: string;
  ratios: readonly string[];
  status: ReactNode;
  updatedAt: string;
  preview: ReactNode;
  onOpen: () => void;
  onEdit: () => void;
  /** Row actions before Edit. */
  children?: ReactNode;
}) {
  return (
    <TableRow data-sub-row className="bg-muted/20">
      <TableCell className="py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 pl-7">
          <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <HoverCard openDelay={300}>
            <HoverCardTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 justify-start px-0 font-normal"
                  aria-label={`Open ${name}`}
                  onClick={onOpen}
                />
              }
            >
              <span className="truncate">{name}</span>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
              {preview}
            </HoverCardContent>
          </HoverCard>
          <span className="shrink-0 text-2xs text-muted-foreground">{detail}</span>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">{source}</TableCell>
      <TableCell className="font-mono">{ratios.join(' · ') || '—'}</TableCell>
      <TableCell>{status}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        <time dateTime={updatedAt} title={updatedAt}>
          {updatedAt ? new Date(updatedAt).toLocaleDateString() : '—'}
        </time>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {children}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Edit ${name}`}
            title="Edit layers"
            onClick={onEdit}
          >
            <Pencil aria-hidden />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Whether a template delivers video or stills, from the best fact on hand: its own parse (any
 * delivery comp longer than one frame is motion — template 133's comps are one frame, over a 15s
 * precomp that is not a delivery), else what its finished renders came back as. Null when neither
 * exists — an operator-built template nobody has rendered — so it sits under neither filter rather
 * than under a guess.
 */
function templateMotion(
  parse: Pick<TemplatePreview, 'comps'> | null,
  renders: readonly ApiRenderJob[],
): Motion | null {
  const timed = (parse?.comps ?? []).flatMap(({ isDelivery, durationSec, frameRate }) =>
    isDelivery && durationSec !== undefined && frameRate ? [durationSec * frameRate] : [],
  );
  if (timed.some((frames) => Math.round(frames) > 1)) return 'animated';
  if (timed.length) return 'static';
  const files = renders.flatMap((job) => job.outputs);
  if (!files.length) return null;
  return files.some((file) => file.kind === 'video') ? 'animated' : 'static';
}

// ponytail: one page of the brand's newest finished renders — the list route's page cap. A template
// last rendered before them reads "No recent render" rather than a claim; page further if that bites.
const GALLERY_RENDERS = 50;
const NO_RENDERS: readonly ApiRenderJob[] = [];

type Item =
  | {
      kind: 'source';
      key: string;
      name: string;
      group: string;
      updatedAt: string;
      motion: Motion | null;
      source: TemplateSourceSummary;
      status: ReturnType<typeof templateStatus>;
      sourceKind?: Exclude<SourceType, 'all'>;
    }
  | {
      kind: 'shared';
      key: string;
      name: string;
      group: string;
      updatedAt: string;
      motion: Motion | null;
      shared: SharedTemplate;
      sourceKind?: Exclude<SourceType, 'all'>;
    };

export function TemplateGallery({
  brandId,
  brandName,
  sources,
  shared,
  adopting,
  onOpen,
  onOpenShared,
  onRename,
  onToggleShared,
  onOpenRender,
  onFiles,
  onFonts,
  onRejected,
}: {
  brandId: string;
  brandName?: string;
  sources: TemplateSourceSummary[];
  shared: SharedTemplate[];
  /** The `sharedTemplateId` of the shared template whose adoption is in flight. */
  adopting: string | null;
  /** `tab` names the detail tab to land on — `layers` for settings, `variants` for a variant. */
  /** `comp` names the composition Edit layers opens on — an output row's own. */
  onOpen: (assetId: string, tab?: string, comp?: string) => void;
  onOpenShared: (template: SharedTemplate) => void;
  onRename: (assetId: string, title: string) => void;
  onToggleShared: (template: SharedTemplate) => void;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
  onFiles: (files: File[]) => void;
  onFonts: (files: File[]) => Promise<void>;
  onRejected: (files: File[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>({ key: 'updated', dir: 'desc' });
  // The same column again flips it; a new one starts where people expect — newest first, A to Z.
  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'updated' ? 'desc' : 'asc' },
    );
  const [motion, setMotion] = useState<Motion | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Every card's picture from ONE read, grouped here — never a read per card.
  const { data: finished } = useQuery({
    queryKey: [...forgeQueryKeys.renderJobs(brandId), 'gallery-finished'],
    queryFn: () => apiRendersApi.listJobs(brandId, GALLERY_RENDERS, { status: 'finished' }),
    staleTime: FORGE_STALE_MS.active,
  });
  const rendersByTemplate = useMemo(() => {
    const grouped = new Map<string, ApiRenderJob[]>();
    // Filtered again: a server that ignores `status` would hand back queued and failed jobs too.
    for (const job of finished?.items ?? []) {
      if (job.status !== 'finished') continue;
      grouped.set(job.templateKey, [...(grouped.get(job.templateKey) ?? []), job]);
    }
    return grouped;
  }, [finished]);
  const emptyLabel = finished ? (finished.nextCursor ? 'No recent render' : 'No render yet') : null;
  const rendersOf = (templateKey: string | null) =>
    (templateKey ? rendersByTemplate.get(templateKey) : undefined) ?? NO_RENDERS;

  const {
    data: catalog,
    error: catalogError,
    refetch: reloadCatalog,
  } = useQuery({
    queryKey: forgeQueryKeys.templateVariants(brandId),
    queryFn: () => fetchTemplateVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });
  const {
    data: canonicalVariants,
    error: variantsError,
    isPending: variantsPending,
    refetch: reloadVariants,
  } = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, 'all'),
    queryFn: () => fetchTemplateRevisionVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });
  // The registry's template families, keyed by the original upload's asset id. Every other upload
  // in a family — a named variant, a later revision — is a card under that original, never a row.
  const families = new Map<string, TemplateRevisionVariant[]>();
  for (const variant of canonicalVariants ?? [])
    families.set(variant.templateId, [...(families.get(variant.templateId) ?? []), variant]);
  const canonicalBySource = new Map(
    canonicalVariants?.flatMap((variant) =>
      variant.revisions.map((revision) => [revision.sourceAssetId, variant] as const),
    ),
  );
  const familyOf = (assetId: string | null | undefined) =>
    canonicalBySource.get(assetId ?? '')?.templateId;
  // The template a published build belongs to: its source's family original, else that source.
  const buildParentOf = (template: SharedTemplate) =>
    template.sourceAssetId ? (familyOf(template.sourceAssetId) ?? template.sourceAssetId) : null;
  const metadata = new Map(catalog?.map((item) => [item.assetId, item]));
  const uploads = new Map(sources.map((source) => [source.assetId, source]));
  const sourceOf = (assetId: string | null | undefined) =>
    uploads.get(assetId ?? '') ?? metadata.get(assetId ?? '')?.source;
  const familyStatus = (source: TemplateSourceSummary) =>
    families
      .get(familyOf(source.assetId) ?? '')
      ?.some((variant) =>
        variant.revisions.some(
          (revision) =>
            revision.id === variant.publishedHeadRevisionId && revision.publications.length > 0,
        ),
      )
      ? ('ready' as const)
      : templateStatus(source);
  const sourceKindOf = (assetId: string | null | undefined) =>
    canonicalBySource.get(assetId ?? '')?.sourceKind ?? metadata.get(assetId ?? '')?.sourceKind;

  const { items, builds } = useMemo(() => {
    // Published builds under the template they were built from, by that template's asset id.
    const builds = new Map<string, SharedTemplate[]>();
    // Until the registry answers nothing tells a variant's upload from an original, and a list that
    // shows every revision as its own template is worse than a moment's wait.
    if (variantsPending) return { items: [] as Item[], builds };
    const originals = sources.filter((source) => {
      const family = familyOf(source.assetId);
      if (family) return family === source.assetId;
      // Uploads the registry does not know yet keep the catalog's parent links.
      const parent = metadata.get(source.assetId)?.parentAssetId;
      return !parent || !metadata.has(parent);
    });
    // One row per template. A published build of a template on this page is a card under it, never a
    // row: one design's artboards used to fill the gallery as "Artboard 1…6" with the design hidden.
    // A build stands in as the row only for a template no upload row shows.
    const shown = new Set(originals.map((source) => source.assetId));
    // The original's own build is the one that stands in; a variant's build is a card under it.
    const ownBuildFirst = [...shared].sort(
      (a, b) =>
        Number(b.sourceAssetId === buildParentOf(b)) - Number(a.sourceAssetId === buildParentOf(a)),
    );
    const sharedRows = ownBuildFirst.filter((template) => {
      const parent = buildParentOf(template);
      if (!parent) return true;
      if (!shown.has(parent)) {
        shown.add(parent);
        return true;
      }
      builds.set(parent, [...(builds.get(parent) ?? []), template]);
      return false;
    });
    const items: Item[] = [
      ...originals.map((source) => ({
        sourceKind: sourceKindOf(source.assetId),
        kind: 'source' as const,
        key: source.assetId,
        name: sourceDisplayName(source),
        group: TEMPLATE_STATUS[familyStatus(source)].group,
        status: familyStatus(source),
        updatedAt: source.updatedAt ?? source.createdAt,
        motion: templateMotion(
          source.parse,
          rendersByTemplate.get(source.templateKey ?? '') ?? NO_RENDERS,
        ),
        source,
      })),
      ...sharedRows.map((template) => ({
        sourceKind: sourceKindOf(template.sourceAssetId),
        kind: 'shared' as const,
        key: `shared:${sharedTemplateId(template)}`,
        name: template.displayName ?? templateDisplayName(template.name),
        group: template.draft ? 'drafts' : 'ready',
        updatedAt: template.updatedAt ?? '',
        motion: templateMotion(
          metadata.get(template.sourceAssetId ?? '')?.source.parse ?? null,
          rendersByTemplate.get(template.templateKey) ?? NO_RENDERS,
        ),
        shared: template,
      })),
    ];
    return { items, builds };
  }, [sources, shared, rendersByTemplate, catalog, canonicalVariants, variantsPending]);

  const counts = useMemo(() => {
    const byFilter: Record<Filter, number> = {
      all: items.length,
      ready: 0,
      drafts: 0,
      attention: 0,
      shared: 0,
    };
    const byMotion: Record<Motion, number> = { animated: 0, static: 0 };
    for (const item of items) {
      byFilter[item.group as Filter] += 1;
      if (item.kind === 'shared') byFilter.shared += 1;
      if (item.motion) byMotion[item.motion] += 1;
    }
    return { ...byFilter, ...byMotion };
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          (filter === 'all' ||
            (filter === 'shared' ? item.kind === 'shared' : item.group === filter)) &&
          (!motion || item.motion === motion) &&
          (sourceType === 'all' || typeOf(item) === sourceType) &&
          (!needle || item.name.toLowerCase().includes(needle)),
      )
      .sort((a, b) => compareItems(a, b, sort));
  }, [items, query, filter, sort, motion, sourceType]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {catalogError ? (
        <p role="alert" className="text-xs text-destructive">
          Could not read source types and variants.{' '}
          <Button size="xs" variant="outline" onClick={() => void reloadCatalog()}>
            Retry
          </Button>
        </p>
      ) : null}
      {variantsError ? (
        <p role="alert" className="text-xs text-destructive">
          Could not read template variants, so variants may show as templates of their own.{' '}
          <Button size="xs" variant="outline" onClick={() => void reloadVariants()}>
            Retry
          </Button>
        </p>
      ) : null}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            aria-label="Search templates"
            className="h-8 pl-8"
          />
        </div>
        <fieldset className="flex flex-wrap gap-1" aria-label="Filter templates">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={chipClass(filter === id)}
            >
              {label}
              <span className="tabular-nums text-muted-foreground">{counts[id]}</span>
            </button>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-1" aria-label="Filter by motion">
          {MOTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={motion === id}
              onClick={() => setMotion(motion === id ? null : id)}
              className={chipClass(motion === id)}
            >
              {label}
              <span className="tabular-nums text-muted-foreground">{counts[id]}</span>
            </button>
          ))}
        </fieldset>
        <Select value={sourceType} onValueChange={(next) => setSourceType(next as SourceType)}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filter by source type">
            <SelectValue>{SOURCE_TYPES[sourceType]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SOURCE_TYPES).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filter !== 'shared' ? (
        <ForgeProjectDrop compact onFiles={onFiles} onFonts={onFonts} onRejected={onRejected} />
      ) : null}
      <div className="overflow-hidden rounded-lg border">
        <Table aria-label="Templates" className="text-xs">
          <TableHeader>
            <TableRow>
              <SortHead column="name" sort={sort} onSort={sortBy} className="min-w-64" />
              <SortHead column="type" sort={sort} onSort={sortBy} />
              <TableHead>Formats</TableHead>
              <SortHead column="status" sort={sort} onSort={sortBy} />
              <SortHead column="updated" sort={sort} onSort={sortBy} />
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variantsPending ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Reading templates…
                </TableCell>
              </TableRow>
            ) : null}
            {['ready', 'drafts', 'attention'].map((group) => {
              const rows = visible.filter((item) => item.group === group);
              if (!rows.length) return null;
              const closed = collapsed.has(group);
              const label = FILTERS.find((option) => option.id === group)?.label ?? group;
              return (
                <Fragment key={group}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={6} className="py-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={!closed}
                        aria-label={`${closed ? 'Expand' : 'Collapse'} ${label}`}
                        onClick={() => setCollapsed((previous) => toggled(previous, group))}
                      >
                        {closed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}{' '}
                        {label}{' '}
                        <span className="font-mono text-muted-foreground">{rows.length}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                  {!closed &&
                    rows.map((item) => {
                      const source =
                        item.kind === 'source'
                          ? item.source
                          : metadata.get(item.shared.sourceAssetId ?? '')?.source;
                      // A parent row's asset is its family's original, so the family is keyed by it.
                      const parent =
                        item.kind === 'source' ? item.source.assetId : buildParentOf(item.shared);
                      const family = families.get(parent ?? '') ?? [];
                      const branched =
                        family.length > 1 || family.some((variant) => variant.revisions.length > 1);
                      const published = builds.get(parent ?? '') ?? [];
                      // Every delivery composition is an output a render can pick — an artboard, a
                      // ratio, an animated or still cut, an arrangement. A template's published
                      // builds ARE those outputs when it has them, so they are listed instead.
                      const outputs = (source?.parse?.comps ?? []).filter(
                        (comp) => comp.isDelivery,
                      );
                      const listedOutputs = !published.length && outputs.length > 1 ? outputs : [];
                      const subEntries =
                        (branched ? family.length : 0) + published.length + listedOutputs.length;
                      const nested = subEntries > 0;
                      const open = nested && expanded.has(item.key);
                      // A build standing in as the row renders under its own key, not its source's.
                      const primeKey =
                        item.kind === 'shared' ? item.shared.templateKey : item.source.templateKey;
                      return (
                        <Fragment key={item.key}>
                          <TableRow>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-1">
                                {nested ? (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-expanded={open}
                                    aria-label={`${open ? 'Hide' : 'Show'} ${pluralize(subEntries, 'variant')} of ${item.name}`}
                                    onClick={() =>
                                      setExpanded((previous) => toggled(previous, item.key))
                                    }
                                  >
                                    {open ? (
                                      <ChevronDown aria-hidden />
                                    ) : (
                                      <ChevronRight aria-hidden />
                                    )}
                                  </Button>
                                ) : (
                                  <span className="size-6 shrink-0" aria-hidden />
                                )}
                                <HoverCard openDelay={300}>
                                  <HoverCardTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="max-w-full justify-start px-0 font-medium"
                                        aria-label={`Open ${item.name}`}
                                        onClick={() =>
                                          item.kind === 'source'
                                            ? onOpen(item.source.assetId)
                                            : onOpenShared(item.shared)
                                        }
                                      />
                                    }
                                  >
                                    {item.name}
                                  </HoverCardTrigger>
                                  <HoverCardContent
                                    align="start"
                                    className="w-96 max-w-[calc(100vw-2rem)]"
                                  >
                                    {source ? (
                                      <TemplateHoverPreview
                                        brandId={brandId}
                                        name={item.name}
                                        templateKey={primeKey}
                                        parse={source.parse}
                                        ratios={source.ratios}
                                        renders={rendersOf(primeKey)}
                                        emptyLabel={emptyLabel}
                                      >
                                        <TemplateFacts
                                          brandId={brandId}
                                          source={source}
                                          lastRender={rendersOf(source.templateKey)[0]}
                                          emptyLabel={emptyLabel}
                                        />
                                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                                          <dt className="text-muted-foreground">Source file</dt>
                                          <dd className="break-all">
                                            {metadata.get(source.assetId)?.originalFileName ??
                                              source.parse?.filename ??
                                              'Not parsed yet'}
                                          </dd>
                                          <dt className="text-muted-foreground">Uploaded</dt>
                                          <dd>{new Date(source.createdAt).toLocaleString()}</dd>
                                          <dt className="text-muted-foreground">Parsing</dt>
                                          <dd>{source.parseState}</dd>
                                          <dt className="text-muted-foreground">Build</dt>
                                          <dd>{source.forgeState ?? 'Not built'}</dd>
                                          <dt className="text-muted-foreground">Missing media</dt>
                                          <dd>{source.parse?.missingFootage?.length ?? '—'}</dd>
                                        </dl>
                                        {source.parseError ? (
                                          <p className="text-destructive">{source.parseError}</p>
                                        ) : null}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => onOpen(source.assetId)}
                                        >
                                          Inspect checks and original files
                                        </Button>
                                      </TemplateHoverPreview>
                                    ) : item.kind === 'shared' ? (
                                      <SharedTemplateCard
                                        brandId={brandId}
                                        template={item.shared}
                                        brandName={brandName}
                                        renders={rendersOf(item.shared.templateKey)}
                                        emptyLabel={emptyLabel}
                                        busy={adopting === sharedTemplateId(item.shared)}
                                        onOpen={() => onOpenShared(item.shared)}
                                        onToggle={() => onToggleShared(item.shared)}
                                      />
                                    ) : null}
                                  </HoverCardContent>
                                </HoverCard>
                                {nested ? (
                                  <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                                    {pluralize(subEntries, 'variant')}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="whitespace-nowrap">
                                {SOURCE_TYPES[typeOf(item)]}
                              </span>
                              <span className="mt-0.5 block text-2xs text-muted-foreground">
                                {item.motion === 'animated'
                                  ? 'Motion'
                                  : item.motion === 'static'
                                    ? 'Static'
                                    : 'Not rendered'}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono">
                              {source?.ratios.join(' · ') || '—'}
                            </TableCell>
                            <TableCell>
                              {item.kind === 'source' ? (
                                <TemplateStatusPill status={item.status} />
                              ) : item.shared.draft ? (
                                'Draft · Shared'
                              ) : (
                                'Ready · Shared'
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              <time dateTime={item.updatedAt} title={item.updatedAt}>
                                {item.updatedAt
                                  ? new Date(item.updatedAt).toLocaleDateString()
                                  : '—'}
                              </time>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {source ? (
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Template settings for ${item.name}`}
                                    title="Template settings"
                                    onClick={() => onOpen(source.assetId, 'layers')}
                                  >
                                    <Settings2 aria-hidden />
                                  </Button>
                                ) : null}
                                {item.kind === 'source' ? (
                                  <InlineRename
                                    iconOnly
                                    value={item.name}
                                    onRename={(title) => onRename(item.source.assetId, title)}
                                  />
                                ) : (
                                  <>
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      disabled={adopting === sharedTemplateId(item.shared)}
                                      onClick={() => onToggleShared(item.shared)}
                                    >
                                      {item.shared.granted
                                        ? `Remove ${item.name} from ${brandName ?? 'this brand'}`
                                        : `Use in ${brandName ?? 'this brand'}`}
                                    </Button>
                                    {item.shared.granted && onOpenRender ? (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={() =>
                                          onOpenRender({ templateKey: item.shared.templateKey })
                                        }
                                      >
                                        Render
                                      </Button>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {open
                            ? (branched ? family : []).map((variant) => {
                                const draft = variant.revisions.find(
                                  (revision) => revision.id === variant.draftHeadRevisionId,
                                );
                                if (!draft) return null;
                                const name = variant.original ? 'Original' : variant.name;
                                const publication = variant.revisions.find(
                                  (revision) => revision.id === variant.publishedHeadRevisionId,
                                )?.publications[0];
                                const key = publication?.templateKey ?? draft.source.templateKey;
                                return (
                                  <SubRow
                                    key={variant.variantId}
                                    name={name}
                                    detail={`Revision ${draft.number} · ${pluralize(variant.revisions.length, 'revision')}`}
                                    source={SOURCE_TYPES[variant.sourceKind]}
                                    ratios={draft.source.ratios}
                                    status={
                                      <Badge
                                        variant={
                                          variant.publishedHeadRevisionId ? 'success' : 'muted'
                                        }
                                      >
                                        {variant.publishedHeadRevisionId ? 'Published' : 'Draft'}
                                      </Badge>
                                    }
                                    updatedAt={draft.createdAt}
                                    preview={
                                      <TemplateHoverPreview
                                        brandId={brandId}
                                        name={name}
                                        templateKey={key}
                                        parse={draft.source.parse}
                                        ratios={draft.source.ratios}
                                        renders={rendersOf(key)}
                                        emptyLabel={emptyLabel}
                                      >
                                        <TemplateFacts
                                          brandId={brandId}
                                          source={draft.source}
                                          lastRender={rendersOf(key)[0]}
                                          emptyLabel={emptyLabel}
                                        />
                                      </TemplateHoverPreview>
                                    }
                                    onOpen={() => onOpen(draft.sourceAssetId, 'variants')}
                                    onEdit={() => onOpen(draft.sourceAssetId, 'layers')}
                                  />
                                );
                              })
                            : null}
                          {open && source
                            ? listedOutputs.map((comp) => {
                                const ratio = source.parse?.ratios.find((entry) =>
                                  entry.comps.includes(comp.name),
                                )?.ratio;
                                const frames =
                                  comp.durationSec !== undefined && comp.frameRate
                                    ? Math.round(comp.durationSec * comp.frameRate)
                                    : null;
                                return (
                                  <SubRow
                                    key={`output:${comp.name}`}
                                    name={comp.name}
                                    detail={`Output · ${comp.width}×${comp.height}`}
                                    source={SOURCE_TYPES[typeOf(item)]}
                                    ratios={ratio ? [ratio] : []}
                                    status={
                                      <Badge variant="muted">
                                        {frames === null
                                          ? 'Output'
                                          : frames > 1
                                            ? `Animated · ${comp.durationSec!.toFixed(1)}s`
                                            : 'Static'}
                                      </Badge>
                                    }
                                    updatedAt={item.updatedAt}
                                    preview={
                                      <TemplateHoverPreview
                                        brandId={brandId}
                                        name={comp.name}
                                        templateKey={primeKey}
                                        parse={source.parse}
                                        ratios={source.ratios}
                                        renders={rendersOf(primeKey)}
                                        emptyLabel={emptyLabel}
                                        comp={comp.name}
                                      />
                                    }
                                    onOpen={() => onOpen(source.assetId)}
                                    onEdit={() => onOpen(source.assetId, 'layers', comp.name)}
                                  />
                                );
                              })
                            : null}
                          {open
                            ? published.map((template) => {
                                const name =
                                  template.displayName ?? templateDisplayName(template.name);
                                const built = sourceOf(template.sourceAssetId);
                                const toggle = `${template.granted ? 'Remove' : 'Use'} ${name} ${template.granted ? 'from' : 'in'} ${brandName ?? 'this brand'}`;
                                return (
                                  <SubRow
                                    key={sharedTemplateId(template)}
                                    name={name}
                                    detail="Published build"
                                    source={
                                      SOURCE_TYPES[
                                        sourceKindOf(template.sourceAssetId) ?? typeOf(item)
                                      ]
                                    }
                                    ratios={built?.ratios ?? []}
                                    status={
                                      <Badge variant={template.granted ? 'success' : 'muted'}>
                                        {template.granted ? 'In use' : 'Off'}
                                      </Badge>
                                    }
                                    updatedAt={template.updatedAt ?? ''}
                                    preview={
                                      <TemplateHoverPreview
                                        brandId={brandId}
                                        name={name}
                                        templateKey={template.granted ? template.templateKey : null}
                                        parse={built?.parse ?? null}
                                        ratios={built?.ratios ?? []}
                                        renders={rendersOf(template.templateKey)}
                                        emptyLabel={emptyLabel}
                                      >
                                        {built ? (
                                          <TemplateFacts
                                            brandId={brandId}
                                            source={built}
                                            lastRender={rendersOf(template.templateKey)[0]}
                                            emptyLabel={emptyLabel}
                                          />
                                        ) : null}
                                      </TemplateHoverPreview>
                                    }
                                    onOpen={() => onOpenShared(template)}
                                    onEdit={() =>
                                      template.sourceAssetId
                                        ? onOpen(template.sourceAssetId, 'layers')
                                        : onOpenShared(template)
                                    }
                                  >
                                    {template.granted && onOpenRender ? (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        aria-label={`Render ${name}`}
                                        onClick={() =>
                                          onOpenRender({
                                            templateKey: template.templateKey,
                                            bindingId: template.workspaceId,
                                          })
                                        }
                                      >
                                        Render
                                      </Button>
                                    ) : null}
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      aria-label={toggle}
                                      disabled={adopting === sharedTemplateId(template)}
                                      onClick={() => onToggleShared(template)}
                                    >
                                      {template.granted ? 'Remove' : 'Use'}
                                    </Button>
                                  </SubRow>
                                );
                              })
                            : null}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {visible.length === 0 && items.length > 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No templates match.</p>
      ) : null}
    </div>
  );
}
