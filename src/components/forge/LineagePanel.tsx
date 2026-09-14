'use client';

import {
  FORGE_REASONS,
  forgeLineageHasReason,
  type ForgeLineageNode,
  type ForgeLineageView,
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
  const label = node.reason ? REASON_LABEL[node.reason] ?? node.reason : node.tool ?? 'commit';
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
      >
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted-foreground">{shortId(node.sha)}</span>
        {typeof node.ops === 'number' ? (
          <span className="text-muted-foreground">{node.ops} ops</span>
        ) : null}
        {node.refs.slice(0, 2).map((ref) => (
          <Badge key={ref} variant="secondary" className="px-1 py-0 text-2xs font-normal">
            {ref.includes('@') ? ref.slice(ref.indexOf('@')) : ref.split('/').slice(-2).join('/')}
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
      <div className="rounded-lg border p-4 text-xs text-muted-foreground">
        Could not read the version tree. {error}
      </div>
    );
  }
  if (!lineage) {
    return (
      <div className="rounded-lg border p-4 text-xs text-muted-foreground">Reading the version tree…</div>
    );
  }
  if (!lineage.connected) {
    return (
      <div className="rounded-lg border p-4 text-xs text-muted-foreground">
        Lineage is not connected — Template Forge is not configured for this environment.
      </div>
    );
  }
  if (!lineage.known) {
    return (
      <div className="rounded-lg border p-4 text-xs text-muted-foreground">
        This upload is not in the version tree yet.
      </div>
    );
  }
  if (!lineage.roots.length) {
    return (
      <div className="rounded-lg border p-4 text-xs text-muted-foreground">
        The version tree is empty for this template.
      </div>
    );
  }

  const presentReasons = FORGE_REASONS.filter((reason) =>
    lineage.roots.some((root) => forgeLineageHasReason(root, reason)),
  );

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Lineage</h3>
        <p className="font-mono text-2xs text-muted-foreground">master {shortId(lineage.currentMaster)}</p>
      </div>
      {lineage.pinnedToOlderMaster ? (
        <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          This implementation is pinned to an older master. Follow (replay) is a CLI action.
        </p>
      ) : null}
      {presentReasons.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1">
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
      <div className="space-y-0.5">
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
        <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {lineage.worktrees.map((worktree) => (
            <li key={worktree.id}>
              checkout {shortId(worktree.commit)}
              {worktree.locked ? ' · locked' : ''}
              {worktree.reason ? ` · ${worktree.reason}` : ''}
              {worktree.path ? ` · ${worktree.path}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <div className="mt-3 space-y-1 border-t pt-3 text-xs">
          <p>
            <span className="text-muted-foreground">commit</span>{' '}
            <span className="font-mono">{shortId(selected.sha)}</span>
            {selected.reason ? ` · ${REASON_LABEL[selected.reason] ?? selected.reason}` : ''}
            {selected.facet ? ` · ${selected.facet}` : ''}
          </p>
          {selected.why ? <p className="text-muted-foreground">{selected.why}</p> : null}
          {selected.base && selected.base !== lineage.currentMaster ? (
            <p className="text-muted-foreground">pinned to master {shortId(selected.base)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
