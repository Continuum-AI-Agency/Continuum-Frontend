'use client';

import {
  FORGE_REASONS,
  type ForgeLineageNode,
  type ForgeLineageView,
  forgeLineageHasReason,
} from '@continuum/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { fetchTemplateLineage } from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';

const REASON_LABEL: Record<string, string> = {
  intake: 'master',
  hygiene: 'hygiene',
  geometry: 'geometry',
  product: 'product',
  copy: 'copy',
  authored: 'authored',
  autofix: 'autofix',
  ship: 'shipped',
  dataset: 'dataset',
  unknown: 'unknown',
};

function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.startsWith('path:') ? `${id.slice(0, 13)}…` : `${id.slice(0, 10)}…`;
}

/**
 * A ref as a badge reads: `<repoKey>/story/base` is `story/base`. The repo key is a tenant-scoped
 * slug with a brand-id fragment in it, so it stays in the badge's title.
 */
function refLabel(ref: string): string {
  return ref.includes('@') ? ref.slice(ref.indexOf('@')) : ref.slice(ref.indexOf('/') + 1);
}

function LineageNode({
  node,
  selected,
  onSelect,
  filter,
  depth,
}: {
  node: ForgeLineageNode;
  selected: string | null;
  onSelect: (node: ForgeLineageNode) => void;
  filter: string | null;
  depth: number;
}) {
  if (filter && !forgeLineageHasReason(node, filter)) return null;
  const active = selected === node.sha;
  const label = node.reason ? (REASON_LABEL[node.reason] ?? node.reason) : (node.tool ?? 'commit');
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
          active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        aria-current={active ? 'true' : undefined}
        // The commit id is for whoever needs to find it in the forge, not for reading.
        title={shortId(node.sha)}
      >
        <span className="font-medium">{label}</span>
        {typeof node.ops === 'number' ? (
          <span className="text-muted-foreground">{node.ops} ops</span>
        ) : null}
        {node.refs.slice(0, 2).map((ref) => (
          <Badge
            key={ref}
            variant="secondary"
            className="px-1 py-0 text-2xs font-normal"
            title={ref}
          >
            {refLabel(ref)}
          </Badge>
        ))}
      </button>
      {node.children.map((child) => (
        <LineageNode
          key={child.sha}
          node={child}
          selected={selected}
          onSelect={onSelect}
          filter={filter}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export function LineagePanel({ brandId, assetId }: { brandId: string; assetId: string }) {
  const [lineage, setLineage] = useState<ForgeLineageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<ForgeLineageNode | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const next = await fetchTemplateLineage(brandId, assetId);
      setLineage(next);
      setSelected(next.roots[0] ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read lineage');
      setLineage(null);
    }
  }, [brandId, assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <p className="text-xs text-muted-foreground">Could not read the version tree. {error}</p>
    );
  }
  if (!lineage) {
    return <p className="text-xs text-muted-foreground">Reading the version tree…</p>;
  }
  if (!lineage.connected) {
    return (
      <p className="text-xs text-muted-foreground">
        Lineage is not connected — Template Forge is not configured for this environment.
      </p>
    );
  }
  if (!lineage.known) {
    return (
      <p className="text-xs text-muted-foreground">This upload is not in the version tree yet.</p>
    );
  }
  if (!lineage.roots.length) {
    return (
      <p className="text-xs text-muted-foreground">The version tree is empty for this template.</p>
    );
  }

  const presentReasons = FORGE_REASONS.filter((reason) =>
    lineage.roots.some((root) => forgeLineageHasReason(root, reason)),
  );

  return (
    <div className="flex flex-col gap-3" title={`master ${shortId(lineage.currentMaster)}`}>
      {lineage.pinnedToOlderMaster ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          This implementation is pinned to an older master. Follow (replay) is a CLI action.
        </p>
      ) : null}
      {presentReasons.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={cn(
              'rounded-full border px-2 py-0.5 text-2xs',
              filter === null ? 'border-primary bg-primary/10' : 'hover:bg-muted/60',
            )}
            onClick={() => setFilter(null)}
          >
            all
          </button>
          {presentReasons.map((reason) => (
            <button
              key={reason}
              type="button"
              className={cn(
                'rounded-full border px-2 py-0.5 text-2xs',
                filter === reason ? 'border-primary bg-primary/10' : 'hover:bg-muted/60',
              )}
              onClick={() => setFilter(reason)}
            >
              {REASON_LABEL[reason]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {lineage.roots.map((root) => (
          <LineageNode
            key={root.sha}
            node={root}
            selected={selected?.sha ?? null}
            onSelect={setSelected}
            filter={filter}
            depth={0}
          />
        ))}
      </div>
      {lineage.worktrees.length ? (
        <ul className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {lineage.worktrees.map((worktree) => (
            <li
              key={worktree.id}
              title={[shortId(worktree.commit), worktree.path].filter(Boolean).join(' · ')}
            >
              checkout
              {worktree.locked ? ' · locked' : ''}
              {worktree.reason ? ` · ${worktree.reason}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs">
          <p title={shortId(selected.sha)}>
            <span className="text-muted-foreground">Change</span>
            {selected.reason ? ` · ${REASON_LABEL[selected.reason] ?? selected.reason}` : ''}
            {selected.facet ? ` · ${selected.facet}` : ''}
          </p>
          {selected.why ? <p className="text-muted-foreground">{selected.why}</p> : null}
          {selected.base && selected.base !== lineage.currentMaster ? (
            <p className="text-muted-foreground" title={shortId(selected.base)}>
              Pinned to an older master
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
