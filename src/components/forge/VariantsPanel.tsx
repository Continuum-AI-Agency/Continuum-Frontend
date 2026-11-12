'use client';

import type { TemplateRevision, TemplateRevisionVariant } from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
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
const day = (at: string, locale: UiLocale = 'en') =>
  new Date(at).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

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
  const calendarLocale = useUiLocale();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

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
      setFailure(uiErrorText(cause));
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
                aria-label={translateUi('compare_value0_bbd48f16', {
                  value0: String(label),
                })}
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
            {isDefault && !archived ? (
              <Badge variant="violet">{translateUi('default_21b111cb')}</Badge>
            ) : null}
            {archived ? (
              <Badge variant="muted">{translateUi('archived_bdb86505')}</Badge>
            ) : (
              <Badge variant={published ? 'success' : 'secondary'}>
                {published
                  ? translateUi('published_revision_value0_3e5bc076', {
                      value0: String(published.number),
                    })
                  : translateUi('draft_ebf12ef4')}
                {head && published && head.id !== published.id
                  ? translateUi('newer_draft_4b5c26a0')
                  : ''}
              </Badge>
            )}
            {node.behindOriginal ? (
              <Badge
                variant="warning"
                title={translateUi('branched_from_original_revision_val_09cbd032', {
                  value0: String(node.from?.revision.number ?? '?'),
                })}
              >
                {' '}
                {translateUi('behind_original_a3a2dbc1')}{' '}
              </Badge>
            ) : null}
            {variant.tags.includes('brand_aligned') ? (
              <Badge variant="violet">{translateUi('brand_aligned_809b4434')}</Badge>
            ) : null}
          </div>
          {node.from ? (
            <p className="text-muted-foreground">
              {' '}
              {translateUi('from_21819769')} {variantName(node.from.variant)}{' '}
              {translateUi('revision_8d8560f7')} {node.from.revision.number}
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
                {published ? translateUi('open_ed077f3d') : translateUi('open_to_publish_bde5a63b')}
              </Button>
            ) : null}
            {head && onBranch && !archived ? (
              <Button size="xs" variant="outline" onClick={() => void onBranch(head.sourceAssetId)}>
                {' '}
                {translateUi('branch_from_here_35ed2154')}{' '}
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
                  {' '}
                  {translateUi('render_6d89eb7d')} {label} {translateUi('revision_8d8560f7')}{' '}
                  {published.number}
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
                {' '}
                {translateUi('make_default_f43b9425')}{' '}
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
                {' '}
                {translateUi('restore_a76e13b9')}{' '}
              </Button>
            ) : !variant.original ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => setArchive(variant.variantId)}
              >
                {' '}
                {translateUi('archive_66f4804e')}{' '}
              </Button>
            ) : null}
          </div>
          {(published ?? head)?.sources ? (
            // Outputs here run different After Effects files; naming one would misdescribe the rest.
            <ul
              aria-label={translateUi('value0_source_files_47ad75a3', {
                value0: String(label),
              })}
              className="space-y-0.5 text-2xs text-muted-foreground"
            >
              {(published ?? head)?.sources?.map((source) => (
                <li key={source.fileId}>
                  {source.outputs.join(', ')} {translateUi('worker_file_16dd0e3f')} {source.fileId}
                </li>
              ))}
            </ul>
          ) : null}
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              {translateUi('revisionCount', { count: revisions.length })}
            </summary>
            <ol
              aria-label={translateUi('value0_revisions_d2dd917f', {
                value0: String(label),
              })}
              className="mt-1 space-y-1"
            >
              {revisions.map((revision) => {
                const parent = variant.revisions.find(
                  (item) => item.id === revision.parentRevisionId,
                );
                const changes = parent ? revisionChanges(parent.edits, revision.edits) : [];
                return (
                  <li key={revision.id} className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">
                      {translateUi('revision_2e516d68')} {revision.number}
                    </span>
                    <span className="text-muted-foreground">
                      {day(revision.createdAt, calendarLocale)}
                      {revision.id === variant.publishedHeadRevisionId
                        ? translateUi('published_894efbc7')
                        : ''}
                      {changes.length ? ` · ${changes.join(' · ')}` : ''}
                    </span>
                    {onInspect ? (
                      <Button
                        size="xs"
                        variant={viewing(revision) ? 'default' : 'ghost'}
                        onClick={() => void onInspect(revision.sourceAssetId)}
                      >
                        {viewing(revision)
                          ? translateUi('viewing_9dc859e8')
                          : translateUi('open_ed077f3d')}
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
            aria-label={translateUi('variants_of_value0_92dd1ead', {
              value0: String(label),
            })}
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
          {' '}
          {translateUi('the_original_is_never_edited_branch_f8ae1077')}{' '}
        </p>
        <fieldset className="flex gap-1">
          <legend className="sr-only">{translateUi('family_view_baf916d0')}</legend>
          {(['tree', 'graph'] as const).map((option) => (
            <Button
              key={option}
              size="xs"
              variant={view === option ? 'default' : 'outline'}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === 'tree' ? translateUi('tree_b85f5fab') : translateUi('graph_32ab018f')}
            </Button>
          ))}
        </fieldset>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {' '}
          {translateUi('could_not_read_variants_3bcdbb4e')}{' '}
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            {' '}
            {translateUi('retry_942087cc')}{' '}
          </Button>
        </p>
      ) : !variants ? (
        <p className="text-xs text-muted-foreground">{translateUi('reading_variants_aac7b65e')}</p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-xs text-destructive">
          {failure}
        </p>
      ) : null}
      {compared.length >= 2 ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs">
            <strong className="flex-1">
              {translateUi('compare_e888155d')} {compared.map(variantName).join(' · ')}
            </strong>
            <Button size="xs" variant="ghost" onClick={() => setComparing([])}>
              {' '}
              {translateUi('close_7d9eb7ac')}{' '}
            </Button>
          </div>
          <VariantCompare brandId={brandId} variants={compared} />
        </div>
      ) : comparing.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          {translateUi('tick_one_more_published_variant_to__7909c06a')}
        </p>
      ) : null}
      {view === 'tree' ? (
        <ul aria-label={translateUi('template_variants_402aa7c6')} className="space-y-2">
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
            {' '}
            {translateUi('this_template_is_built_from_8d44d0ff')}{' '}
            {DESIGN_FILE[selectedVariant.sourceKind]}{' '}
            {translateUi('file_make_a_variant_by_changing_its_bbfd99c9')}{' '}
          </p>
          {onEditLayers ? (
            <Button size="xs" variant="outline" onClick={onEditLayers}>
              {' '}
              {translateUi('edit_layers_589e52a5')}{' '}
            </Button>
          ) : null}
        </div>
      ) : (
        <fieldset className="space-y-2 border-t pt-3">
          <legend className="text-xs">
            {translateUi('upload_an_authored_after_effects_va_c44739bc')}
          </legend>
          <Input
            aria-label={translateUi('uploaded_variant_name_4ba6f56e')}
            placeholder={translateUi('variant_name_0f204472')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
          <input
            type="file"
            aria-label={translateUi('upload_after_effects_variant_cd864015')}
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
          aria-label={translateUi('archive_template_variant_62b5fa24')}
          className="space-y-2 rounded-md border p-3"
        >
          <p className="text-xs"> {translateUi('archive_this_variant_existing_sets__24d5128a')} </p>
          <div className="flex gap-2">
            <Button size="xs" variant="outline" disabled={busy} onClick={() => setArchive(null)}>
              {' '}
              {translateUi('cancel_19766ed6')}{' '}
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
              {' '}
              {translateUi('archive_variant_f774d5b8')}{' '}
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
  const translateUi = useUiTranslations('forge');

  const calendarLocale = useUiLocale();

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
      <ol aria-label={translateUi('template_revisions_a4eab904')} className="min-w-0 flex-1">
        {dots.map((dot) => {
          const { variant } = lanes[dot.lane]!;
          const text = translateUi('variantRevision', {
            variant: variantName(variant),
            revision: dot.revision.number,
          });
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
                {day(dot.revision.createdAt, calendarLocale)}
                {dot.revision.id === variant.publishedHeadRevisionId
                  ? translateUi('published_894efbc7')
                  : ''}
                {variant.archivedAt ? translateUi('archived_736ced99') : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
