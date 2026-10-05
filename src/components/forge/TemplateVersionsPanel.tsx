'use client';

import type { ForgeLineageView } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/components/approvals/formatters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchTemplateLineage } from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';
import { type CheckpointRow, checkpointGraph, refLabel } from './templateCheckpoints';
import { shortSha } from './templateVersion';

/**
 * The template's VERSIONS, as a git history: checkpoints (commits), forks (branches), tags, and the
 * one live checkpoint every render uses. See `templateCheckpoints.ts` for the model and
 * Continuum-Monorepo `docs/forge-variants.md` for how a render reaches it.
 *
 * Built from the version tree AND its log: in production the tree comes back empty and the upload
 * commit is only in the log, so the old tree-only panels read "empty" for every template.
 */

/**
 * The facts the store keeps about these bytes. Only byte facts cross the Backend: on shared bytes
 * (the same package uploaded by two brands is one commit) `shipped` and `pointer` name whichever
 * template wrote last, so they are stripped before a view is served (`forgeScopeView`).
 */
function tagFacts(row: CheckpointRow): string[] {
  const facts: string[] = [];
  if (typeof row.tags.state === 'string') facts.push(row.tags.state);
  if (row.tags['ae-accepted'] === true) facts.push('passed its test render');
  return facts;
}

function Detail({ row, onRender }: { row: CheckpointRow; onRender?: () => void }) {
  const facts = tagFacts(row);
  return (
    <section
      aria-label="Checkpoint"
      className="flex flex-col gap-2 border-t border-border pt-3 text-xs"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">What</dt>
        <dd>
          {row.kind}
          {row.facet ? ` · ${row.facet}` : ''}
          {row.branch ? ` · fork “${row.branch}”` : ''}
        </dd>
        {row.file ? (
          <>
            <dt className="text-muted-foreground">From</dt>
            <dd className="truncate">{row.file}</dd>
          </>
        ) : row.parent ? (
          <>
            <dt className="text-muted-foreground">Made from</dt>
            <dd className="font-mono" title={row.parent}>
              {shortSha(row.parent)}
            </dd>
          </>
        ) : null}
        {row.at ? (
          <>
            <dt className="text-muted-foreground">When</dt>
            <dd title={row.at}>{formatRelativeTime(row.at)}</dd>
          </>
        ) : null}
        {row.ops !== null || row.why ? (
          <>
            <dt className="text-muted-foreground">Changes</dt>
            <dd>
              {[row.ops !== null ? `${row.ops} edits` : null, row.why].filter(Boolean).join(' · ')}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Bytes</dt>
        <dd className="font-mono" title={row.blob ?? undefined}>
          {row.blob ? shortSha(row.blob) : 'not kept'}
        </dd>
        {facts.length ? (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd>{facts.join(' · ')}</dd>
          </>
        ) : null}
      </dl>
      {row.live ? (
        onRender ? (
          <Button type="button" size="sm" className="h-7 self-start text-xs" onClick={onRender}>
            Render from this checkpoint
          </Button>
        ) : null
      ) : (
        <p className="text-muted-foreground">
          Renders use the live checkpoint. To render this one, make it live — publish it, or flip to
          it in a delivery.
        </p>
      )}
    </section>
  );
}

export function TemplateVersionsPanel({
  brandId,
  assetId,
  onSelect,
}: {
  brandId: string;
  assetId: string;
  /**
   * Open Render pinned to the live checkpoint. Omitted, the panel stays read-only — right anywhere
   * there is no render to aim at.
   */
  onSelect?: (ref: string | null) => void;
}) {
  const [view, setView] = useState<ForgeLineageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchTemplateLineage(brandId, assetId)
      .then((answer) => live && setView(answer))
      .catch(
        (cause: unknown) =>
          live && setError(cause instanceof Error ? cause.message : String(cause)),
      );
    return () => {
      live = false;
    };
  }, [brandId, assetId]);

  if (error) {
    return <p className="text-xs text-muted-foreground">Could not read the versions. {error}</p>;
  }
  if (!view) return <p className="text-xs text-muted-foreground">Reading the versions…</p>;
  // A mirrored history still answers; only no forge AND no mirror has nothing to show.
  if (!view.connected && !view.cachedAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Versions are not connected — Template Forge is not configured for this environment.
      </p>
    );
  }

  const graph = checkpointGraph(view);
  if (!graph.rows.length) {
    return (
      <p className="text-xs text-muted-foreground">
        This upload has no checkpoints yet. The first one appears when Template Forge reads it.
      </p>
    );
  }
  const selected =
    graph.rows.find((row) => row.id === selectedId) ?? graph.live ?? graph.rows[0] ?? null;
  const renderLive = onSelect ? () => onSelect(graph.liveRef) : undefined;

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        A template keeps its history like git. Each checkpoint is a saved state — the upload, and
        every change made from it. A fork branches off a checkpoint for a use case: a size, a
        language, a look. Live is the one checkpoint every render uses.
      </p>
      {view.cachedAt ? (
        <p className="text-muted-foreground" title={view.cachedAt}>
          Showing the history Template Forge last reported, from {formatRelativeTime(view.cachedAt)}
          .
        </p>
      ) : null}

      {graph.live ? (
        <section
          aria-label="Live checkpoint"
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
        >
          <Badge>Live</Badge>
          <span className="font-medium">
            {graph.live.kind}
            {graph.live.file ? ` · ${graph.live.file}` : ''}
          </span>
          <span className="font-mono text-muted-foreground" title={graph.live.id}>
            {shortSha(graph.live.id)}
          </span>
          {renderLive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto h-6 px-2 text-xs"
              onClick={renderLive}
            >
              Render from live
            </Button>
          ) : null}
        </section>
      ) : (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          No checkpoint here holds the bytes this template renders. Its live version is not in this
          history, so a render cannot be traced back to one.
        </p>
      )}

      <ol aria-label="Checkpoints" className="flex flex-col">
        {graph.rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setSelectedId(row.id)}
              aria-current={row.id === selected?.id ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left',
                row.id === selected?.id ? 'bg-primary/10' : 'hover:bg-muted/60',
              )}
              style={{ paddingLeft: `${8 + row.depth * 16}px` }}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full border',
                  row.live ? 'border-primary bg-primary' : 'border-muted-foreground bg-background',
                )}
              />
              <span className="font-medium">{row.kind}</span>
              {row.branch ? (
                <Badge variant="outline" className="px-1 py-0 text-2xs font-normal">
                  {row.branch}
                </Badge>
              ) : null}
              {row.refs
                .filter((ref) => ref.includes('@'))
                .map((ref) => (
                  <Badge
                    key={ref}
                    variant="secondary"
                    className="px-1 py-0 text-2xs font-normal"
                    title={ref}
                  >
                    {refLabel(ref)}
                  </Badge>
                ))}
              {row.live ? <Badge className="px-1 py-0 text-2xs">Live</Badge> : null}
              <span className="ml-auto font-mono text-muted-foreground" title={row.id}>
                {shortSha(row.id)}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {view.worktrees.length ? (
        <p className="text-muted-foreground">
          Being worked on:{' '}
          {view.worktrees
            .map((worktree) => `${shortSha(worktree.commit)}${worktree.locked ? ' (locked)' : ''}`)
            .join(', ')}
        </p>
      ) : null}

      {selected ? (
        <Detail row={selected} onRender={selected.live ? renderLive : undefined} />
      ) : null}
    </div>
  );
}
