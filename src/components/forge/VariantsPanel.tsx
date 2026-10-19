'use client';

import type { TemplateRevision, TemplateRevisionVariant } from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  archiveTemplateRevisionVariant,
  fetchTemplateRevisionVariants,
  fetchTemplateVariantDefaults,
  saveTemplateRevision,
  setTemplateVariantDefault,
  unarchiveTemplateRevisionVariant,
} from '@/lib/library/templateSources';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { FORGE_STALE_MS, forgeQueryKeys, invalidateForgeBrand } from './queryKeys';
import type { ForgeRenderIntent } from './RenderRequestsGrid';
import { VariantCompare } from './VariantCompare';
import { revisionChanges, type VariantNode, variantLanes, variantTree } from './variantTree';

// A design import's variants come from its layers; an uploaded After Effects project cannot stand in.
const DESIGN_FILE: Partial<Record<TemplateRevisionVariant['sourceKind'], string>> = {
  photoshop: 'a Photoshop',
  illustrator: 'an Illustrator',
};

const variantName = (variant: TemplateRevisionVariant) =>
  variant.original ? 'Original' : variant.name;
const headOf = (variant: TemplateRevisionVariant) =>
  variant.revisions.find((revision) => revision.id === variant.draftHeadRevisionId);
const publishedOf = (variant: TemplateRevisionVariant) =>
  variant.revisions.find((revision) => revision.id === variant.publishedHeadRevisionId);
const day = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function VariantsPanel({
  brandId,
  assetId,
  expectedVersionId,
  onInspect,
  onBranch,
  onRender,
  onEditLayers,
}: {
  brandId: string;
  assetId: string;
  expectedVersionId: string;
  /** Where a design import's variants are made: its layers, saved under a new name. */
  onEditLayers?: () => void;
  onInspect?: (assetId: string) => void | Promise<void>;
  /** Open a revision in Edit layers, where "Save as new variant" branches a child from it. */
  onBranch?: (assetId: string) => void | Promise<void>;
  onRender?: (intent: ForgeRenderIntent) => void;
}) {
  const queryClient = useQueryClient();
  // Archived variants stay in the family so they can be restored and their children still hang
  // somewhere; the catalog other tabs read leaves them out.
  const {
    data: variants,
    error,
    refetch,
  } = useQuery({
    queryKey: [...forgeQueryKeys.revisionVariants(brandId, assetId), 'history'],
    queryFn: () => fetchTemplateRevisionVariants(brandId, assetId, true),
    staleTime: FORGE_STALE_MS.active,
  });
  const { data: defaults } = useQuery({
    queryKey: forgeQueryKeys.variantDefaults(brandId),
    queryFn: () => fetchTemplateVariantDefaults(brandId),
    staleTime: FORGE_STALE_MS.lists,
  });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [archive, setArchive] = useState<string | null>(null);
  const [view, setView] = useState<'tree' | 'graph'>('tree');
  const [comparing, setComparing] = useState<string[]>([]);
  const tree = useMemo(() => (variants ? variantTree(variants) : []), [variants]);
  const original = variants?.find((item) => item.original);
  const defaultId =
    defaults?.find((item) => item.templateId === original?.templateId)?.variantId ??
    original?.variantId;
  const viewing = (revision: TemplateRevision) =>
    revision.sourceAssetId === assetId && revision.sourceVersionId === expectedVersionId;
  const selectedVariant = variants?.find((item) => item.revisions.some(viewing));
  const selectedRevision = selectedVariant?.revisions.find(viewing);

  const refresh = async () => {
    await invalidateForgeBrand(queryClient, brandId);
    return refetch();
  };
  const act = async (what: string, run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await run();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : `Could not ${what}`);
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (!file || busy || !selectedRevision || !selectedVariant) return;
    if (/\.aepx$/i.test(file.name)) {
      setFailure('Save the XML project as .aep in After Effects before uploading.');
      return;
    }
    if (!/\.(aep|aet|zip)$/i.test(file.name)) {
      setFailure('Choose an After Effects .aep project, .aet template or ZIP package.');
      return;
    }
    void act('upload variant', async () => {
      const uploaded = await uploadMediaAsset({
        brandId,
        file,
        templateVariantOf: selectedRevision.sourceAssetId,
      });
      const saved = await saveTemplateRevision(assetId, {
        brandId,
        parentRevisionId: selectedRevision.id,
        expectedHeadRevisionId: selectedRevision.id,
        idempotencyKey: crypto.randomUUID(),
        name: name.trim() || file.name.replace(/\.[^.]+$/, ''),
        uploadAssetId: uploaded.assetId,
        edits: { layers: [], slots: [], orders: [] },
      });
      await invalidateForgeBrand(queryClient, brandId);
      await onInspect?.(saved.sourceAssetId);
      setName('');
    });
  };

  const renderNode = (node: VariantNode) => {
    const { variant } = node;
    const head = headOf(variant);
    const published = publishedOf(variant);
    const archived = Boolean(variant.archivedAt);
    const isDefault = variant.variantId === defaultId;
    const label = variantName(variant);
    const revisions = [...variant.revisions].sort((a, b) => b.number - a.number);
    const comparable = Boolean(published && !archived && onRender);
    return (
      <li key={variant.variantId} className="space-y-2">
        <div
          data-variant={variant.variantId}
          className={`space-y-2 rounded-md border px-3 py-2 text-xs ${
            selectedVariant?.variantId === variant.variantId ? 'border-primary' : ''
          } ${archived ? 'opacity-60' : ''}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {comparable ? (
              <input
                type="checkbox"
                aria-label={`Compare ${label}`}
                checked={comparing.includes(variant.variantId)}
                onChange={(event) =>
                  setComparing((current) =>
                    event.target.checked
                      ? [...current, variant.variantId].slice(-4)
                      : current.filter((id) => id !== variant.variantId),
                  )
                }
              />
            ) : null}
            <strong className="min-w-0 flex-1 truncate">{label}</strong>
            {isDefault && !archived ? <Badge variant="violet">Default</Badge> : null}
            {archived ? (
              <Badge variant="muted">Archived</Badge>
            ) : (
              <Badge variant={published ? 'success' : 'secondary'}>
                {published ? `Published · Revision ${published.number}` : 'Draft'}
                {head && published && head.id !== published.id ? ' · newer draft' : ''}
              </Badge>
            )}
            {node.behindOriginal ? (
              <Badge
                variant="warning"
                title={`Branched from Original revision ${node.from?.revision.number ?? '?'}; the Original has moved on since.`}
              >
                Behind original
              </Badge>
            ) : null}
            {variant.tags.includes('brand_aligned') ? (
              <Badge variant="violet">Brand-aligned</Badge>
            ) : null}
          </div>
          {node.from ? (
            <p className="text-muted-foreground">
              From {variantName(node.from.variant)} · Revision {node.from.revision.number}
              {node.changes.length ? ` — ${node.changes.join(' · ')}` : ''}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {head && onInspect ? (
              <Button
                size="xs"
                variant={head.sourceAssetId === assetId ? 'default' : 'outline'}
                onClick={() => void onInspect(head.sourceAssetId)}
              >
                {published ? 'Open' : 'Open to publish'}
              </Button>
            ) : null}
            {head && onBranch && !archived ? (
              <Button size="xs" variant="outline" onClick={() => void onBranch(head.sourceAssetId)}>
                Branch from here
              </Button>
            ) : null}
            {published?.publications.map((target) =>
              onRender && !archived ? (
                <Button
                  key={`${target.bindingId}:${target.templateKey}`}
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    onRender({
                      templateKey: target.templateKey,
                      bindingId: target.bindingId,
                      templateRevision: {
                        templateId: variant.templateId,
                        variantId: variant.variantId,
                        revisionId: published.id,
                      },
                    })
                  }
                >
                  Render {label} · Revision {published.number}
                  {published.publications.length > 1 ? ` · ${target.templateKey}` : ''}
                </Button>
              ) : null,
            )}
            {!isDefault && !archived && (variant.original || published) ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act('make default', async () => {
                    await setTemplateVariantDefault(brandId, assetId, variant.variantId);
                    await queryClient.invalidateQueries({
                      queryKey: forgeQueryKeys.variantDefaults(brandId),
                    });
                  })
                }
              >
                Make default
              </Button>
            ) : null}
            {archived ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act('restore variant', async () => {
                    await unarchiveTemplateRevisionVariant(brandId, assetId, variant.variantId);
                    await refresh();
                  })
                }
              >
                Restore
              </Button>
            ) : !variant.original ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => setArchive(variant.variantId)}
              >
                Archive
              </Button>
            ) : null}
          </div>
          {(published ?? head)?.sources ? (
            // Outputs here run different After Effects files; naming one would misdescribe the rest.
            <ul
              aria-label={`${label} source files`}
              className="space-y-0.5 text-2xs text-muted-foreground"
            >
              {(published ?? head)?.sources?.map((source) => (
                <li key={source.fileId}>
                  {source.outputs.join(', ')} · worker file {source.fileId}
                </li>
              ))}
            </ul>
          ) : null}
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              {revisions.length} {revisions.length === 1 ? 'revision' : 'revisions'}
            </summary>
            <ol aria-label={`${label} revisions`} className="mt-1 space-y-1">
              {revisions.map((revision) => {
                const parent = variant.revisions.find(
                  (item) => item.id === revision.parentRevisionId,
                );
                const changes = parent ? revisionChanges(parent.edits, revision.edits) : [];
                return (
                  <li key={revision.id} className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">Revision {revision.number}</span>
                    <span className="text-muted-foreground">
                      {day(revision.createdAt)}
                      {revision.id === variant.publishedHeadRevisionId ? ' · published' : ''}
                      {changes.length ? ` · ${changes.join(' · ')}` : ''}
                    </span>
                    {onInspect ? (
                      <Button
                        size="xs"
                        variant={viewing(revision) ? 'default' : 'ghost'}
                        onClick={() => void onInspect(revision.sourceAssetId)}
                      >
                        {viewing(revision) ? 'Viewing' : 'Open'}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </details>
        </div>
        {node.children.length ? (
          <ul
            aria-label={`Variants of ${label}`}
            className="ml-3 space-y-2 border-l border-border pl-3"
          >
            {node.children.map(renderNode)}
          </ul>
        ) : null}
      </li>
    );
  };

  const compared = (variants ?? []).filter((item) => comparing.includes(item.variantId));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          The Original is never edited. Branch a variant from any revision, change its layers and
          save it under a new name; publish a variant to render it. Render sets keep the exact
          revision they picked.
        </p>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Family view</legend>
          {(['tree', 'graph'] as const).map((option) => (
            <Button
              key={option}
              size="xs"
              variant={view === option ? 'default' : 'outline'}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === 'tree' ? 'Tree' : 'Graph'}
            </Button>
          ))}
        </fieldset>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not read variants.{' '}
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      ) : !variants ? (
        <p className="text-xs text-muted-foreground">Reading variants…</p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-xs text-destructive">
          {failure}
        </p>
      ) : null}
      {compared.length >= 2 ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs">
            <strong className="flex-1">Compare {compared.map(variantName).join(' · ')}</strong>
            <Button size="xs" variant="ghost" onClick={() => setComparing([])}>
              Close
            </Button>
          </div>
          <VariantCompare brandId={brandId} variants={compared} />
        </div>
      ) : comparing.length === 1 ? (
        <p className="text-xs text-muted-foreground">Tick one more published variant to compare.</p>
      ) : null}
      {view === 'tree' ? (
        <ul aria-label="Template variants" className="space-y-2">
          {tree.map(renderNode)}
        </ul>
      ) : variants ? (
        <VariantGraph
          variants={variants}
          isViewing={viewing}
          onOpen={onInspect ? (revision) => void onInspect(revision.sourceAssetId) : undefined}
        />
      ) : null}
      {selectedVariant && DESIGN_FILE[selectedVariant.sourceKind] ? (
        <div className="space-y-2 border-t pt-3 text-xs">
          <p>
            This template is built from {DESIGN_FILE[selectedVariant.sourceKind]} file. Make a
            variant by changing its layers and saving them as a new variant.
          </p>
          {onEditLayers ? (
            <Button size="xs" variant="outline" onClick={onEditLayers}>
              Edit layers
            </Button>
          ) : null}
        </div>
      ) : (
        <fieldset className="space-y-2 border-t pt-3">
          <legend className="text-xs">Upload an authored After Effects variant</legend>
          <Input
            aria-label="Uploaded variant name"
            placeholder="Variant name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
          <input
            type="file"
            aria-label="Upload After Effects variant"
            accept=".aep,.aet,.zip"
            disabled={busy || !selectedRevision}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              upload(file);
            }}
          />
        </fieldset>
      )}
      {archive ? (
        <div
          role="alertdialog"
          aria-label="Archive template variant"
          className="space-y-2 rounded-md border p-3"
        >
          <p className="text-xs">
            Archive this variant? Existing sets keep their saved revision, and you can restore it
            later. It will no longer appear for new sets.
          </p>
          <div className="flex gap-2">
            <Button size="xs" variant="outline" disabled={busy} onClick={() => setArchive(null)}>
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={busy}
              onClick={() =>
                void act('archive variant', async () => {
                  await archiveTemplateRevisionVariant(brandId, assetId, archive);
                  setArchive(null);
                  const refreshed = await refresh();
                  if (selectedVariant?.variantId === archive) {
                    const fallback = refreshed.data?.find((item) => item.original);
                    const head = fallback ? headOf(fallback) : undefined;
                    if (head) await onInspect?.(head.sourceAssetId);
                  }
                })
              }
            >
              Archive variant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const LANE = 18;
const ROW = 30;

/**
 * The family drawn like `git log --graph`: a lane per variant, newest revision on top, and a line
 * from each revision to the one it was saved from. The labels are real buttons beside the drawing.
 */
function VariantGraph({
  variants,
  isViewing,
  onOpen,
}: {
  variants: TemplateRevisionVariant[];
  isViewing: (revision: TemplateRevision) => boolean;
  onOpen?: (revision: TemplateRevision) => void;
}) {
  const { lanes, dots, edges } = useMemo(() => variantLanes(variants), [variants]);
  const x = (lane: number) => lane * LANE + LANE / 2;
  const y = (row: number) => row * ROW + ROW / 2;
  const width = Math.max(1, lanes.length) * LANE;
  return (
    <div className="flex gap-2 text-xs">
      <svg
        aria-hidden="true"
        width={width}
        height={dots.length * ROW}
        className="shrink-0 text-muted-foreground"
      >
        {edges.map(({ from, to }) => (
          <path
            key={`${from.lane}:${from.row}-${to.lane}:${to.row}`}
            d={
              from.lane === to.lane
                ? `M${x(from.lane)} ${y(from.row)} L${x(to.lane)} ${y(to.row)}`
                : `M${x(from.lane)} ${y(from.row)} L${x(from.lane)} ${y(to.row) - ROW / 2} Q${x(from.lane)} ${y(to.row)} ${x(to.lane)} ${y(to.row)}`
            }
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            opacity={lanes[from.lane]?.variant.archivedAt ? 0.35 : 0.8}
          />
        ))}
        {dots.map((dot) => {
          const { variant } = lanes[dot.lane]!;
          const published = dot.revision.id === variant.publishedHeadRevisionId;
          return (
            <circle
              key={dot.revision.id}
              cx={x(dot.lane)}
              cy={y(dot.row)}
              r={published ? 5 : 4}
              className={isViewing(dot.revision) ? 'text-primary' : undefined}
              fill={published ? 'currentColor' : 'var(--background)'}
              stroke="currentColor"
              strokeWidth={1.5}
              opacity={variant.archivedAt ? 0.4 : 1}
            />
          );
        })}
      </svg>
      <ol aria-label="Template revisions" className="min-w-0 flex-1">
        {dots.map((dot) => {
          const { variant } = lanes[dot.lane]!;
          const text = `${variantName(variant)} · Revision ${dot.revision.number}`;
          return (
            <li key={dot.revision.id} className="flex items-center gap-2" style={{ height: ROW }}>
              {onOpen ? (
                <Button
                  size="xs"
                  variant={isViewing(dot.revision) ? 'default' : 'ghost'}
                  onClick={() => onOpen(dot.revision)}
                >
                  {text}
                </Button>
              ) : (
                <span>{text}</span>
              )}
              <span className="truncate text-muted-foreground">
                {day(dot.revision.createdAt)}
                {dot.revision.id === variant.publishedHeadRevisionId ? ' · published' : ''}
                {variant.archivedAt ? ' · archived' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
