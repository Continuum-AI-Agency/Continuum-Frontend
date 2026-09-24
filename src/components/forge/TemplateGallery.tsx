'use client';

import type { ApiRenderJob, TemplatePreview, TemplateSourceSummary } from '@continuum/contracts';
import { templateDisplayName } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ForgeProjectDrop } from '@/components/forge/ForgeProjectDrop';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  type SharedTemplate,
  SharedTemplateCard,
  sharedTemplateId,
  sourceDisplayName,
  TEMPLATE_STATUS,
  TemplateCard,
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

const SORTS = { updated: 'Recently updated', name: 'Name', motion: 'Animated first' } as const;
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
    }
  | {
      kind: 'shared';
      key: string;
      name: string;
      group: string;
      updatedAt: string;
      motion: Motion | null;
      shared: SharedTemplate;
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

  const items = useMemo<Item[]>(
    () => [
      ...sources.map((source) => ({
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
        kind: 'shared' as const,
        key: `shared:${sharedTemplateId(template)}`,
        name: template.displayName ?? templateDisplayName(template.name),
        group: template.draft ? 'drafts' : 'ready',
        updatedAt: template.updatedAt ?? '',
        motion: templateMotion(null, rendersByTemplate.get(template.templateKey) ?? NO_RENDERS),
        shared: template,
      })),
    ],
    [sources, shared, rendersByTemplate],
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
          (!needle || item.name.toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) =>
          (sort === 'motion'
            ? MOTION_RANK[a.motion ?? 'unknown'] - MOTION_RANK[b.motion ?? 'unknown']
            : 0) ||
          (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)),
      );
  }, [items, query, filter, sort, motion]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
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

      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4"
        aria-label="Templates"
      >
        {filter === 'shared' ? null : (
          <li className="min-w-0">
            <ForgeProjectDrop onFiles={onFiles} onFonts={onFonts} onRejected={onRejected} />
          </li>
        )}
        {visible.map((item) => (
          <li key={item.key} className="min-w-0">
            {item.kind === 'source' ? (
              <TemplateCard
                brandId={brandId}
                source={item.source}
                renders={rendersOf(item.source.templateKey)}
                emptyLabel={emptyLabel}
                onOpen={() => onOpen(item.source.assetId)}
                onRename={(title) => onRename(item.source.assetId, title)}
              />
            ) : (
              <SharedTemplateCard
                brandId={brandId}
                template={item.shared}
                brandName={brandName}
                renders={rendersOf(item.shared.templateKey)}
                emptyLabel={emptyLabel}
                busy={adopting === sharedTemplateId(item.shared)}
                onOpen={() => onOpenShared(item.shared)}
                onToggle={() => onToggleShared(item.shared)}
                onRender={
                  onOpenRender
                    ? () => onOpenRender({ templateKey: item.shared.templateKey })
                    : undefined
                }
              />
            )}
          </li>
        ))}
      </ul>
      {visible.length === 0 && items.length > 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No templates match.</p>
      ) : null}
    </div>
  );
}
