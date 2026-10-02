'use client';

import type { ApiRenderJob, TemplatePreview, TemplateSourceSummary } from '@continuum/contracts';
import { templateDisplayName } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { ForgeProjectDrop } from '@/components/forge/ForgeProjectDrop';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
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
import { fetchTemplateVariants } from '@/lib/library/templateSources';
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

const SOURCE_TYPES = {
  all: 'All source types',
  photoshop: 'Photoshop',
  illustrator: 'Illustrator',
  after_effects: 'After Effects',
  other: 'Other',
} as const;
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
const SORTS = {
  updated: 'Recently updated',
  name: 'Name',
  motion: 'Animated first',
  type: 'Source type',
} as const;
type Sort = keyof typeof SORTS;
const MOTION_RANK: Record<Motion | 'unknown', number> = { animated: 0, static: 1, unknown: 2 };

const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
    active
      ? 'border-primary bg-primary/10 text-foreground'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  );

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
  onOpen: (assetId: string) => void;
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
  const [sort, setSort] = useState<Sort>('updated');
  const [motion, setMotion] = useState<Motion | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
  const metadata = new Map(catalog?.map((item) => [item.assetId, item]));
  const items = useMemo<Item[]>(
    () => [
      ...sources
        .filter((source) => {
          const parent = catalog?.find((item) => item.assetId === source.assetId)?.parentAssetId;
          return !parent || !catalog?.some((item) => item.assetId === parent);
        })
        .map((source) => ({
          sourceKind: catalog?.find((item) => item.assetId === source.assetId)?.sourceKind,
          kind: 'source' as const,
          key: source.assetId,
          name: sourceDisplayName(source),
          group: TEMPLATE_STATUS[templateStatus(source)].group,
          updatedAt: source.updatedAt ?? source.createdAt,
          motion: templateMotion(
            source.parse,
            rendersByTemplate.get(source.templateKey ?? '') ?? NO_RENDERS,
          ),
          source,
        })),
      ...shared.map((template) => ({
        sourceKind: catalog?.find((item) => item.assetId === template.sourceAssetId)?.sourceKind,
        kind: 'shared' as const,
        key: `shared:${sharedTemplateId(template)}`,
        name: template.displayName ?? templateDisplayName(template.name),
        group: template.draft ? 'drafts' : 'ready',
        updatedAt: template.updatedAt ?? '',
        motion: templateMotion(
          catalog?.find((item) => item.assetId === template.sourceAssetId)?.source.parse ?? null,
          rendersByTemplate.get(template.templateKey) ?? NO_RENDERS,
        ),
        shared: template,
      })),
    ],
    [sources, shared, rendersByTemplate, catalog],
  );

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
      .sort(
        (a, b) =>
          (sort === 'type' ? SOURCE_TYPES[typeOf(a)].localeCompare(SOURCE_TYPES[typeOf(b)]) : 0) ||
          (sort === 'motion'
            ? MOTION_RANK[a.motion ?? 'unknown'] - MOTION_RANK[b.motion ?? 'unknown']
            : 0) ||
          (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)),
      );
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
        <div className="ml-auto">
          <Select value={sort} onValueChange={(next) => setSort(next as Sort)}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="Sort templates">
              <SelectValue>{SORTS[sort]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORTS) as Sort[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {SORTS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filter !== 'shared' ? (
        <ForgeProjectDrop compact onFiles={onFiles} onFonts={onFonts} onRejected={onRejected} />
      ) : null}
      <div className="overflow-hidden rounded-lg border">
        <Table aria-label="Templates" className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64">Template</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Formats / variants</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
                        onClick={() =>
                          setCollapsed((previous) => {
                            const next = new Set(previous);
                            if (next.has(group)) next.delete(group);
                            else next.add(group);
                            return next;
                          })
                        }
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
                      return (
                        <TableRow key={item.key}>
                          <TableCell className="py-2">
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
                                  <div className="flex flex-col gap-3">
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
                                  </div>
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
                          </TableCell>
                          <TableCell>
                            <span className="whitespace-nowrap">{SOURCE_TYPES[typeOf(item)]}</span>
                            <span className="mt-0.5 block text-2xs text-muted-foreground">
                              {item.motion === 'animated'
                                ? 'Motion'
                                : item.motion === 'static'
                                  ? 'Static'
                                  : 'Not rendered'}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono">
                            {source
                              ? (source.ratios.join(' · ') || '—') +
                                ` / ${1 + (catalog?.filter((variant) => variant.rootAssetId === (metadata.get(source.assetId)?.rootAssetId ?? source.assetId) && variant.assetId !== (metadata.get(source.assetId)?.rootAssetId ?? source.assetId)).length ?? 0)}`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {item.kind === 'source' ? (
                              <TemplateStatusPill status={templateStatus(item.source)} />
                            ) : item.shared.draft ? (
                              'Draft · Shared'
                            ) : (
                              'Ready · Shared'
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            <time dateTime={item.updatedAt} title={item.updatedAt}>
                              {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}
                            </time>
                          </TableCell>
                          <TableCell className="text-right">
                            {item.kind === 'source' ? (
                              <InlineRename
                                iconOnly
                                value={item.name}
                                onRename={(title) => onRename(item.source.assetId, title)}
                              />
                            ) : (
                              <div className="flex justify-end gap-1">
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
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
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
