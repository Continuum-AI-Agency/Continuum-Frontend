'use client';

import {
  type TemplateSourceSummary,
  templateDisplayName,
  type WorkspaceTemplate,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileSha256, matchDroppedFile, uploadRefusal } from '@/components/forge/ForgeProjectDrop';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { SharedTemplateDetail } from '@/components/forge/SharedTemplateDetail';
import {
  type SharedTemplate,
  sharedTemplateId,
  sourceDisplayName,
} from '@/components/forge/TemplateCard';
import { TemplateDetail } from '@/components/forge/TemplateDetail';
import { TemplateGallery } from '@/components/forge/TemplateGallery';
import { useTemplateMorphSwap } from '@/components/forge/TemplateWireframe';
import { UploadStrip } from '@/components/library/UploadStrip';
import { useMediaUpload } from '@/components/library/useMediaUpload';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { bulkDeleteAssetsOperation } from '@/lib/library/creativeOperations';
import {
  discoverWorkspaceTemplates,
  fetchTemplateSources,
  renameTemplateSource,
  setTemplateAdoption,
  uploadTemplateFontFiles,
} from '@/lib/library/templateSources';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Forge — bring your own After Effects project.
//
// The Library still OWNS the file: an upload here goes through the same resumable path into the
// same `media-source` bucket and becomes the same `media.assets` row. This screen is where you
// work on it — find it in the gallery, open it, and say what its variables mean.

/**
 * What the brand's workspaces hold, split in two.
 *
 * Templates built from this brand's own uploads lend their build name to the matching card, so a
 * template nobody titled still reads as what it was built as. Everything else is "shared": discovery
 * ends at an intersection — what the workspace holds ∩ what this brand has been granted — so a brand
 * nobody granted anything sees an empty picker however much is really there, and this is that list
 * with the grant as a button.
 *
 * ONE read, whatever the brand's topology. This used to list the brand's workspaces and fan a
 * discover call out per workspace from the browser; the server merges them now, and each row
 * carries the binding it came from so adoption still names the right one.
 */
async function loadWorkspaceTemplates(brandId: string): Promise<WorkspaceTemplate[]> {
  // Advisory: a brand with no binding yet has no workspace to read, which is a normal state for a
  // new tenant and must not put an error on the page.
  return discoverWorkspaceTemplates(brandId)
    .then((result) => result.items)
    .catch(() => []);
}

function splitWorkspaceTemplates(
  items: WorkspaceTemplate[],
  ownAssetIds: Set<string>,
): { shared: SharedTemplate[]; buildNames: Map<string, string> } {
  const buildNames = new Map<string, string>();
  const shared: SharedTemplate[] = [];
  for (const item of items) {
    if (item.sourceAssetId && ownAssetIds.has(item.sourceAssetId)) {
      buildNames.set(item.sourceAssetId, templateDisplayName(item.name));
      continue;
    }
    shared.push({
      templateKey: item.templateKey,
      name: item.name,
      displayName: item.displayName ?? null,
      draft: item.draft,
      granted: item.granted,
      updatedAt: item.updatedAt,
      workspaceId: item.bindingId,
    });
  }
  return { shared, buildNames };
}

export function ForgeWorkbench({
  brandId,
  brandName,
  onOpenRender,
}: {
  brandId: string;
  brandName?: string;
  /** Jump to the Render tab with a template (and optionally a render set) loaded. */
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // The `sharedTemplateId` of the open shared template. Keyed by id, not held as an object, so a
  // grant switched off elsewhere drops the detail back to the gallery on the next list read.
  const [selectedShared, setSelectedShared] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TemplateSourceSummary | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  // Dropped files named like a template already here, waiting for "revision or new template?".
  const [sameName, setSameName] = useState<Array<{ file: File; source: TemplateSourceSummary }>>(
    [],
  );
  // A file on its way to becoming a template's next source revision, until its panel takes it.
  const [revision, setRevision] = useState<{ assetId: string; file: File } | null>(null);
  const queryClient = useQueryClient();
  const sourceKey = useMemo(() => forgeQueryKeys.templateSources(brandId), [brandId]);
  const sourceQuery = useQuery({
    queryKey: sourceKey,
    queryFn: () => fetchTemplateSources(brandId),
    staleTime: FORGE_STALE_MS.lists,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const workspaceQuery = useQuery({
    queryKey: forgeQueryKeys.workspaceTemplates(brandId),
    queryFn: () => loadWorkspaceTemplates(brandId),
    staleTime: FORGE_STALE_MS.lists,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const rawSources = sourceQuery.data ?? [];
  const { shared, buildNames } = useMemo(
    () =>
      splitWorkspaceTemplates(
        workspaceQuery.data ?? [],
        new Set(rawSources.map((source) => source.assetId)),
      ),
    [rawSources, workspaceQuery.data],
  );
  // A title wins; the build name stands in only where nobody has typed one.
  const sources = useMemo(
    () =>
      rawSources.map((source) =>
        source.displayName || !buildNames.has(source.assetId)
          ? source
          : { ...source, displayName: buildNames.get(source.assetId) ?? null },
      ),
    [buildNames, rawSources],
  );

  useEffect(() => {
    if (sourceQuery.error)
      toast.error(
        sourceQuery.error instanceof Error
          ? sourceQuery.error.message
          : 'Could not list your templates',
      );
  }, [sourceQuery.error]);

  const refreshSources = useCallback(
    () => queryClient.invalidateQueries({ queryKey: sourceKey, exact: true }),
    [queryClient, sourceKey],
  );
  const refreshTemplate = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.workspaceTemplates(brandId) }),
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.templates(brandId) }),
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.contracts(brandId) }),
      ]).then(() => undefined),
    [brandId, queryClient, sourceKey],
  );

  const uploaded = useCallback(() => void refreshSources(), [refreshSources]);

  const { uploads, uploadFiles, pauseUpload, resumeUpload, cancelUpload } = useMediaUpload(
    brandId,
    {
      onUploaded: uploaded,
    },
  );

  // Registration creates the pending card; parsing fills that same card a few seconds later.
  // Stop after two minutes so a broken parser does not poll forever—the pending state stays honest.
  const pendingKey = sources
    .filter((source) => source.parseState === 'pending')
    .map((source) => source.assetId)
    .sort()
    .join('|');
  useEffect(() => {
    if (!pendingKey) return;
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      if (polls >= 40) window.clearInterval(timer);
      void sourceQuery.refetch();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pendingKey, sourceQuery.refetch]);

  const setDisplayName = (assetId: string, displayName: string | null) =>
    queryClient.setQueryData<TemplateSourceSummary[]>(sourceKey, (current = []) =>
      current.map((source) => (source.assetId === assetId ? { ...source, displayName } : source)),
    );

  // Optimistic: the new name shows at once and is put back if the server refuses it.
  const rename = async (assetId: string, title: string) => {
    const previous = sources.find((source) => source.assetId === assetId)?.displayName ?? null;
    setDisplayName(assetId, title);
    try {
      const saved = await renameTemplateSource(brandId, assetId, title);
      setDisplayName(assetId, saved.displayName ?? title);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.workspaceTemplates(brandId) }),
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.templates(brandId) }),
      ]);
    } catch (error) {
      setDisplayName(assetId, previous);
      toast.error(error instanceof Error ? error.message : 'Could not rename the template');
    }
  };

  const toggleShared = async (template: SharedTemplate) => {
    const name = template.displayName ?? templateDisplayName(template.name);
    setAdopting(sharedTemplateId(template));
    try {
      await setTemplateAdoption({
        brandId,
        templateKey: template.templateKey,
        enabled: !template.granted,
        workspaceId: template.workspaceId,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.workspaceTemplates(brandId) }),
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.templates(brandId) }),
      ]);
      toast.success(
        template.granted
          ? `${name} removed from ${brandName ?? 'this brand'}`
          : `${name} is now available to render`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change that');
    } finally {
      setAdopting(null);
    }
  };

  const removeFromBrand = async () => {
    if (!removing || removeBusy) return;
    const source = removing;
    setRemoveBusy(true);
    let accessDisabled = false;
    try {
      if (source.templateKey) {
        const workspaceId =
          (workspaceQuery.data ?? []).find((item) => item.sourceAssetId === source.assetId)
            ?.bindingId ??
          (await discoverWorkspaceTemplates(brandId)).items.find(
            (item) => item.sourceAssetId === source.assetId,
          )?.bindingId;
        if (!workspaceId)
          throw new Error(
            'Could not find this template’s render workspace. Refresh and try again.',
          );
        const disabled = await setTemplateAdoption({
          brandId,
          templateKey: source.templateKey,
          enabled: false,
          workspaceId,
        });
        if (!disabled.granted) throw new Error('Could not turn off render access for this template.');
        accessDisabled = true;
      }
      const removed = await bulkDeleteAssetsOperation(createSupabaseBrowserClient(), {
        brandId,
        assetIds: [source.assetId],
      });
      if (!removed.includes(source.assetId)) throw new Error('The template file was not removed.');
      setSelected(null);
      setRemoving(null);
      toast.success(`${sourceDisplayName(source)} removed from ${brandName ?? 'this brand'}`);
    } catch (error) {
      toast.error(
        accessDisabled
          ? 'The template file could not be removed. Render access is off; try removing it again.'
          : error instanceof Error
            ? error.message
            : 'Could not remove the template.',
      );
    } finally {
      setRemoveBusy(false);
      void refreshTemplate();
    }
  };

  const morph = useTemplateMorphSwap();
  const open = (assetId: string | null) => morph(() => setSelected(assetId));
  const openShared = (template: SharedTemplate | null) =>
    morph(() => setSelectedShared(template ? sharedTemplateId(template) : null));

  const current = sources.find((source) => source.assetId === selected) ?? null;
  const currentShared = current
    ? null
    : (shared.find((template) => sharedTemplateId(template) === selectedShared) ?? null);

  // A drop never makes a second copy by accident: the same bytes open the template that holds them,
  // and a known file name asks whether this is its next revision.
  const receive = async (files: File[]) => {
    const fresh: File[] = [];
    const named: typeof sameName = [];
    let existing: TemplateSourceSummary | null = null;
    const anyChecksum = sources.some((source) => source.sourceChecksum);
    for (const file of files) {
      const match = matchDroppedFile(
        file.name,
        anyChecksum ? await fileSha256(file) : null,
        sources,
      );
      if (match.kind === 'same') {
        toast.info(`Already in Forge as ${sourceDisplayName(match.source)}`);
        existing ??= match.source;
      } else if (match.kind === 'named') named.push({ file, source: match.source });
      else fresh.push(file);
    }
    if (fresh.length) void uploadFiles(fresh);
    if (named.length) setSameName((queue) => [...queue, ...named]);
    if (existing) open(existing.assetId);
  };

  const receiveFonts = async (files: File[]) => {
    const { stored, refused } = await uploadTemplateFontFiles(brandId, files);
    if (stored.length) toast.success(`Fonts added: ${stored.join(', ')}`);
    if (refused.length) toast.error(`Fonts not added: ${refused.join('; ')}`);
  };

  const asking = sameName[0];
  const answer = (choice: 'revision' | 'template' | null) => {
    if (!asking) return;
    setSameName((queue) => queue.slice(1));
    if (choice === 'template') void uploadFiles([asking.file]);
    if (choice === 'revision') {
      setRevision({ assetId: asking.source.assetId, file: asking.file });
      open(asking.source.assetId);
    }
  };
  const askingName = asking ? sourceDisplayName(asking.source) : '';

  const refusals = uploads.flatMap((upload) => {
    const sentence = upload.status === 'error' ? uploadRefusal(upload, upload.error) : null;
    return sentence ? [{ id: upload.id, sentence }] : [];
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {uploads.length ? (
        <div className="flex flex-col gap-1.5">
          <UploadStrip
            uploads={uploads}
            onPause={pauseUpload}
            onResume={resumeUpload}
            onRetry={resumeUpload}
            onCancel={cancelUpload}
          />
          {refusals.map(({ id, sentence }) => (
            <p key={id} role="alert" className="text-xs text-destructive">
              {sentence}
            </p>
          ))}
        </div>
      ) : null}

      {current ? (
        <TemplateDetail
          key={current.assetId}
          brandId={brandId}
          source={current}
          onBack={() => open(null)}
          onRename={(title) => void rename(current.assetId, title)}
          onRemove={() => setRemoving(current)}
          onOpenRender={onOpenRender}
          onChanged={refreshTemplate}
          revisionFile={revision?.assetId === current.assetId ? revision.file : undefined}
          onRevisionTaken={() => setRevision(null)}
        />
      ) : currentShared ? (
        <SharedTemplateDetail
          key={sharedTemplateId(currentShared)}
          brandId={brandId}
          brandName={brandName}
          template={currentShared}
          busy={adopting === sharedTemplateId(currentShared)}
          onBack={() => openShared(null)}
          onToggle={() => void toggleShared(currentShared)}
          onOpenRender={onOpenRender}
        />
      ) : (
        <TemplateGallery
          brandId={brandId}
          brandName={brandName}
          sources={sources}
          shared={shared}
          adopting={adopting}
          onOpen={open}
          onOpenShared={openShared}
          onRename={(assetId, title) => void rename(assetId, title)}
          onToggleShared={(template) => void toggleShared(template)}
          onOpenRender={onOpenRender}
          onFiles={(files) => void receive(files)}
          onFonts={receiveFonts}
          onRejected={(files) =>
            toast.error(
              `${files.map((file) => file.name).join(', ')}: use .aep, .aepx, .aet or .zip, and .ttf or .otf for fonts.`,
            )
          }
        />
      )}

      <AlertDialog open={asking !== undefined} onOpenChange={(next) => !next && answer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{askingName} already has this file name</AlertDialogTitle>
            <AlertDialogDescription>
              Upload {asking?.file.name} as the next revision of {askingName} — you compare the
              changes before it replaces anything — or as a separate template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => answer('template')}>
              New template
            </Button>
            <Button type="button" onClick={() => answer('revision')}>
              New revision of {askingName}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => !next && !removeBusy && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{removing ? sourceDisplayName(removing) : ''}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the template from {brandName ?? 'this brand'} and its Library. Existing
              renders and file history are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={removeBusy}
              onClick={() => void removeFromBrand()}
            >
              {removeBusy ? 'Removing…' : 'Remove from brand'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
