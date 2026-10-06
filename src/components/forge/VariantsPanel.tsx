'use client';

import {
  type ForgeLineageNode,
  type ForgeLineageView,
  type TemplateRevision,
  type TemplateRevisionVariant,
  type TemplateVariant,
  templateDisplayName,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  archiveTemplateRevisionVariant,
  fetchTemplateRevisionVariants,
  saveTemplateRevision,
} from '@/lib/library/templateSources';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';
import type { ForgeRenderIntent } from './RenderRequestsGrid';
import { variantLabel } from './templateVersion';

export type VariantRow = {
  sha: string;
  refs: string[];
  /** `9:16/base` out of `inyogo/9:16/base` — the repo key is tenant-scoped noise in a list. */
  name: string;
  state: string | null;
  accepted: boolean;
  shippedAs: number | null;
  /** The last pointer move recorded for these bytes, if the store has one. */
  lastPointer: { direction: string; at: string; attachment: number | null } | null;
};

function tagString(tags: Record<string, unknown>, key: string): string | null {
  const value = tags[key];
  return typeof value === 'string' ? value : null;
}

/** Every node in the forest that carries a ref, flattened, deepest last. */
export function variantsOf(view: Pick<ForgeLineageView, 'roots'>): VariantRow[] {
  const out: VariantRow[] = [];
  const walk = (node: ForgeLineageNode) => {
    if (node.refs.length) {
      const tags = (node.tags ?? {}) as Record<string, unknown>;
      const shipped = tags.shipped as { attachmentId?: number } | undefined;
      const pointer = Array.isArray(tags.pointer)
        ? (tags.pointer as Array<{ direction?: string; at?: string; attachment?: number | null }>)
        : [];
      const last = pointer.length ? pointer[pointer.length - 1] : null;
      out.push({
        sha: node.sha,
        refs: node.refs,
        name: variantLabel(node.refs[0]),
        state: tagString(tags, 'state'),
        accepted: tags['ae-accepted'] === true,
        shippedAs: typeof shipped?.attachmentId === 'number' ? shipped.attachmentId : null,
        lastPointer: last
          ? {
              direction: last.direction ?? 'moved',
              at: last.at ?? '',
              attachment: last.attachment ?? null,
            }
          : null,
      });
    }
    for (const child of node.children) walk(child);
  };
  for (const root of view.roots) walk(root);
  return out;
}

// A design import's variants come from its layers; an uploaded After Effects project cannot stand in.
const DESIGN_FILE: Partial<Record<TemplateRevisionVariant['sourceKind'], string>> = {
  photoshop: 'a Photoshop',
  illustrator: 'an Illustrator',
};

export function VariantsPanel({
  brandId,
  assetId,
  expectedVersionId,
  onInspect,
  onCreated,
  onDelete,
  onRender,
  onEditLayers,
}: {
  brandId: string;
  assetId: string;
  expectedVersionId: string;
  /** Where a design import's variants are made: its layers, saved under a new name. */
  onEditLayers?: () => void;
  onInspect?: (assetId: string) => void | Promise<void>;
  onCreated?: (variant: TemplateVariant) => void | Promise<void>;
  onDelete?: (variant: TemplateVariant) => void;
  onRender?: (intent: ForgeRenderIntent) => void;
}) {
  const queryClient = useQueryClient();
  const {
    data: variants,
    error,
    refetch,
  } = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, assetId),
    queryFn: () => fetchTemplateRevisionVariants(brandId, assetId),
    staleTime: FORGE_STALE_MS.active,
  });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [archive, setArchive] = useState<string | null>(null);
  const selectedVariant = variants?.find((item) =>
    item.revisions.some(
      (revision) =>
        revision.sourceAssetId === assetId && revision.sourceVersionId === expectedVersionId,
    ),
  );
  const selectedRevision = selectedVariant?.revisions.find(
    (revision) =>
      revision.sourceAssetId === assetId && revision.sourceVersionId === expectedVersionId,
  );
  const upload = async (file: File | undefined) => {
    if (!file || busy || !selectedRevision || !selectedVariant) return;
    if (/\.aepx$/i.test(file.name)) {
      setFailure('Save the XML project as .aep in After Effects before uploading.');
      return;
    }
    if (!/\.(aep|aet|zip)$/i.test(file.name)) {
      setFailure('Choose an After Effects .aep project, .aet template or ZIP package.');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
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
        edits: { layers: [], slots: [] },
      });
      await queryClient.invalidateQueries({ queryKey: forgeQueryKeys.brand(brandId) });
      await onInspect?.(saved.sourceAssetId);
      setName('');
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Could not upload variant');
    } finally {
      setBusy(false);
    }
  };
  const inspect = (revision: TemplateRevision) => {
    void onInspect?.(revision.sourceAssetId);
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Named variants keep draft and published revisions together. Render sets retain the exact
        revision they selected.
      </p>
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
      <ul aria-label="Template variants" className="space-y-3">
        {variants?.map((variant) => {
          const draft = variant.revisions.find(
            (revision) => revision.id === variant.draftHeadRevisionId,
          );
          const published = variant.revisions.find(
            (revision) => revision.id === variant.publishedHeadRevisionId,
          );
          const parent = variants
            .flatMap((item) => item.revisions.map((revision) => ({ name: item.name, revision })))
            .find((item) => item.revision.id === variant.parentRevisionId);
          return (
            <li key={variant.variantId} className="space-y-2 rounded-md border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="min-w-0 flex-1 truncate">
                  {variant.original ? 'Original' : variant.name}
                </strong>
                <Badge variant="secondary">
                  {published ? 'Published' : 'Draft'}
                  {draft && published && draft.id !== published.id ? ' · newer draft' : ''}
                </Badge>
                {draft && onInspect ? (
                  <Button
                    size="xs"
                    variant={draft.sourceAssetId === assetId ? 'default' : 'outline'}
                    onClick={() => inspect(draft)}
                  >
                    Inspect draft
                  </Button>
                ) : null}
                {!variant.original ? (
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
              {parent ? (
                <p className="text-muted-foreground">
                  Created from {parent.name} · Revision {parent.revision.number}
                </p>
              ) : null}
              <label className="flex items-center gap-2">
                Revision
                <select
                  aria-label={`${variant.name} revision`}
                  className="rounded-md border bg-background p-1"
                  value={
                    variant.revisions.find((revision) => revision.sourceAssetId === assetId)?.id ??
                    draft?.id ??
                    ''
                  }
                  onChange={(event) => {
                    const revision = variant.revisions.find(
                      (item) => item.id === event.target.value,
                    );
                    if (revision) inspect(revision);
                  }}
                >
                  {[...variant.revisions]
                    .sort((a, b) => b.number - a.number)
                    .map((revision) => (
                      <option key={revision.id} value={revision.id}>
                        Revision {revision.number}
                        {revision.id === variant.publishedHeadRevisionId ? ' · published' : ''}
                        {revision.id === variant.draftHeadRevisionId ? ' · draft head' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {published?.publications.map((target) =>
                  onRender ? (
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
                      Render {variant.name} · Revision {published.number}
                      {published.publications.length > 1 ? ` · ${target.templateKey}` : ''}
                    </Button>
                  ) : null,
                )}
              </div>
            </li>
          );
        })}
      </ul>
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
              void upload(file);
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
            Archive this variant? Existing sets keep their saved revision. It will no longer appear
            for new sets.
          </p>
          <div className="flex gap-2">
            <Button size="xs" variant="outline" disabled={busy} onClick={() => setArchive(null)}>
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await archiveTemplateRevisionVariant(brandId, assetId, archive);
                  await queryClient.invalidateQueries({ queryKey: forgeQueryKeys.brand(brandId) });
                  const archivedId = archive;
                  setArchive(null);
                  const refreshed = await refetch();
                  if (selectedVariant?.variantId === archivedId) {
                    const original = refreshed.data?.find((item) => item.original);
                    const head = original?.revisions.find(
                      (item) => item.id === original.draftHeadRevisionId,
                    );
                    if (head) await onInspect?.(head.sourceAssetId);
                  }
                } catch (cause) {
                  setFailure(cause instanceof Error ? cause.message : 'Could not archive variant');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Archive variant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
