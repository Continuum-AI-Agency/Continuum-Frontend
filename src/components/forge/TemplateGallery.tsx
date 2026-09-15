'use client';

import type { TemplateSource } from '@continuum/contracts';
import { templateDisplayName } from '@continuum/contracts';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ForgeProjectDrop } from '@/components/forge/ForgeProjectDrop';
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

const SORTS = { updated: 'Recently updated', name: 'Name' } as const;
type Sort = keyof typeof SORTS;

type Item =
  | {
      kind: 'source';
      key: string;
      name: string;
      group: string;
      updatedAt: string;
      source: TemplateSource;
    }
  | {
      kind: 'shared';
      key: string;
      name: string;
      group: string;
      updatedAt: string;
      shared: SharedTemplate;
    };

export function TemplateGallery({
  brandId,
  brandName,
  sources,
  shared,
  adopting,
  onOpen,
  onRename,
  onToggleShared,
  onOpenRender,
  onFiles,
  onRejected,
}: {
  brandId: string;
  brandName?: string;
  sources: TemplateSource[];
  shared: SharedTemplate[];
  /** The `sharedTemplateId` of the shared template whose adoption is in flight. */
  adopting: string | null;
  onOpen: (assetId: string) => void;
  onRename: (assetId: string, title: string) => void;
  onToggleShared: (template: SharedTemplate) => void;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
  onFiles: (files: File[]) => void;
  onRejected: (files: File[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('updated');

  const items = useMemo<Item[]>(
    () => [
      ...sources.map((source) => ({
        kind: 'source' as const,
        key: source.assetId,
        name: sourceDisplayName(source),
        group: TEMPLATE_STATUS[templateStatus(source)].group,
        updatedAt: source.updatedAt ?? source.createdAt,
        source,
      })),
      ...shared.map((template) => ({
        kind: 'shared' as const,
        key: `shared:${sharedTemplateId(template)}`,
        name: template.displayName ?? templateDisplayName(template.name),
        group: template.draft ? 'drafts' : 'ready',
        updatedAt: template.updatedAt ?? '',
        shared: template,
      })),
    ],
    [sources, shared],
  );

  const counts = useMemo(() => {
    const byFilter: Record<Filter, number> = {
      all: items.length,
      ready: 0,
      drafts: 0,
      attention: 0,
      shared: 0,
    };
    for (const item of items) {
      byFilter[item.group as Filter] += 1;
      if (item.kind === 'shared') byFilter.shared += 1;
    }
    return byFilter;
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          (filter === 'all' ||
            (filter === 'shared' ? item.kind === 'shared' : item.group === filter)) &&
          (!needle || item.name.toLowerCase().includes(needle)),
      )
      .sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
      );
  }, [items, query, filter, sort]);

  return (
    <div className="space-y-4">
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
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                filter === id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
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
            <ForgeProjectDrop onFiles={onFiles} onRejected={onRejected} />
          </li>
        )}
        {visible.map((item) => (
          <li key={item.key} className="min-w-0">
            {item.kind === 'source' ? (
              <TemplateCard
                brandId={brandId}
                source={item.source}
                onOpen={() => onOpen(item.source.assetId)}
                onRename={(title) => onRename(item.source.assetId, title)}
              />
            ) : (
              <SharedTemplateCard
                brandId={brandId}
                template={item.shared}
                brandName={brandName}
                busy={adopting === sharedTemplateId(item.shared)}
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
