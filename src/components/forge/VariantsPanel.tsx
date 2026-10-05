'use client';

import { type TemplateVariant, templateDisplayName } from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createTemplateVariant,
  fetchTemplateVariants,
  loadWorkspaceTemplates,
} from '@/lib/library/templateSources';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';
import type { ForgeRenderIntent } from './RenderRequestsGrid';

export function VariantsPanel({
  brandId,
  assetId,
  expectedVersionId,
  onInspect,
  onCreated,
  onDelete,
  onRender,
}: {
  brandId: string;
  assetId: string;
  expectedVersionId: string;
  onInspect?: (assetId: string) => void | Promise<void>;
  onCreated?: (variant: TemplateVariant) => void | Promise<void>;
  onDelete?: (variant: TemplateVariant) => void;
  onRender?: (intent: ForgeRenderIntent) => void;
}) {
  const queryClient = useQueryClient();
  const {
    data: catalog,
    error,
    refetch,
  } = useQuery({
    queryKey: forgeQueryKeys.templateVariants(brandId),
    queryFn: () => fetchTemplateVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });
  const { data: published = [] } = useQuery({
    queryKey: forgeQueryKeys.workspaceTemplates(brandId),
    queryFn: () => loadWorkspaceTemplates(brandId),
    staleTime: FORGE_STALE_MS.lists,
  });
  const selected = catalog?.find((item) => item.assetId === assetId);
  const rootId = selected?.rootAssetId ?? assetId;
  const variants = catalog?.filter((item) => item.rootAssetId === rootId) ?? [];
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<{ id: string; key: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!/\.(aep|aepx|aet|zip)$/i.test(file.name)) {
      setUploadError('Choose an After Effects project or ZIP package.');
      return;
    }
    setBusy(true);
    setUploadError(null);
    try {
      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      let uploadedId = uploaded?.key === fileKey ? uploaded.id : null;
      if (!uploadedId) {
        uploadedId = (await uploadMediaAsset({ brandId, file })).assetId;
        setUploaded({ id: uploadedId, key: fileKey });
      }
      const created = await createTemplateVariant(assetId, {
        brandId,
        expectedVersionId,
        name: name.trim() || file.name.replace(/\.[^.]+$/, ''),
        uploadAssetId: uploadedId,
      });
      setUploaded(null);
      setName('');
      await queryClient.invalidateQueries({ queryKey: forgeQueryKeys.templateVariants(brandId) });
      await onCreated?.(created);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'Could not create the variant');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Choose a variant to inspect its source, checks and layers. Publish it after its test render
        to use it in render sets.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not read variants.{' '}
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      ) : !catalog ? (
        <p className="text-xs text-muted-foreground">Reading variants…</p>
      ) : null}
      <ul className="flex flex-col gap-2" aria-label="Template variants">
        {variants.map((variant) => {
          const targets = published.filter(
            (item) => item.sourceAssetId === variant.assetId && item.granted,
          );
          return (
            <li
              key={variant.assetId}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {variant.parentAssetId ? variant.name : 'Original'}
                </p>
                <p className="truncate text-muted-foreground">{variant.originalFileName}</p>
              </div>
              <Badge variant="secondary">
                {variant.source.templateKey || targets.length
                  ? 'Published'
                  : variant.source.parseState !== 'parsed'
                    ? variant.source.parseState
                    : 'Draft'}
              </Badge>
              {onInspect ? (
                <Button
                  size="xs"
                  variant={variant.assetId === assetId ? 'default' : 'outline'}
                  onClick={() => void onInspect(variant.assetId)}
                >
                  {variant.assetId === assetId ? 'Inspecting' : 'Inspect'}
                </Button>
              ) : null}
              {onRender
                ? (targets.length
                    ? targets
                    : variant.source.templateKey
                      ? [
                          {
                            templateKey: variant.source.templateKey,
                            bindingId: undefined,
                            name: variant.name,
                            displayName: variant.name,
                          },
                        ]
                      : []
                  ).map((target) => (
                    <Button
                      key={`${target.bindingId}:${target.templateKey}`}
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        onRender({ templateKey: target.templateKey, bindingId: target.bindingId })
                      }
                    >
                      Render this variant
                      {targets.length > 1 ? ` · ${templateDisplayName(target.name)}` : ''}
                    </Button>
                  ))
                : null}
              {variant.parentAssetId && onDelete ? (
                <Button
                  size="xs"
                  variant="outline"
                  aria-label={`Delete variant ${variant.name}`}
                  onClick={() => onDelete(variant)}
                >
                  Delete
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <section
        aria-label="Upload a variant"
        className="flex flex-col gap-2 rounded-md border border-dashed p-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void upload(event.dataTransfer.files[0]);
        }}
      >
        <p className="text-xs font-medium">Upload an After Effects variant</p>
        <Input
          aria-label="New variant name"
          placeholder="Variant name"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
        <Input
          aria-label="After Effects variant file"
          type="file"
          accept=".aep,.aepx,.aet,.zip"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            void upload(file);
            event.target.value = '';
          }}
        />
        <p className="text-xs text-muted-foreground">
          Drop a project here or choose a file. Photoshop and Illustrator variants are created in
          Edit layers.
        </p>
        {busy ? (
          <p className="text-xs text-muted-foreground">Uploading and reading the variant…</p>
        ) : null}
        {uploadError ? (
          <p role="alert" className="text-xs text-destructive">
            {uploadError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
