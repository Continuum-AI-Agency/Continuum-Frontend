'use client';

import {
  type TemplateSourceSummary,
  templateDisplayName,
  type WorkspaceTemplate,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fileSha256,
  isForgeDesignFile,
  matchDroppedFile,
  uploadRefusal,
} from '@/components/forge/ForgeProjectDrop';
import { type ForgeDeepLink, readForgeDeepLink } from '@/components/forge/forgeDeepLink';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent, ForgeTemplateIntent } from '@/components/forge/RenderRequestsGrid';
import { SceneTemplateDetail } from '@/components/forge/SceneTemplateDetail';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
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
import { DesignTemplateImports, useDesignTemplateImports } from './DesignTemplateImports';
import { useForgeExitGuard } from './useForgeExitGuard';

// Forge — bring your own After Effects project.
//
// The Library still OWNS the file: an upload here goes through the same resumable path into the
// same `media-source` bucket and becomes the same `media.assets` row. This screen is where you
// work on it — find it in the gallery, open it, and say what its variables mean.

function splitWorkspaceTemplates(
  items: WorkspaceTemplate[],
  ownSources: TemplateSourceSummary[],
): { shared: SharedTemplate[]; buildNames: Map<string, string> } {
  const buildNames = new Map<string, string>();
  const shared: SharedTemplate[] = [];
  const sourceById = new Map(ownSources.map((source) => [source.assetId, source]));
  for (const item of items) {
    const ownSource = item.sourceAssetId ? sourceById.get(item.sourceAssetId) : null;
    if (
      item.sourceAssetId &&
      ownSource &&
      (ownSource.templateKey === item.templateKey || (!ownSource.templateKey && !item.granted))
    ) {
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
      sourceAssetId: item.sourceAssetId,
    });
  }
  return { shared, buildNames };
}

export function ForgeWorkbench({
  brandId,
  brandName,
  onOpenRender,
  templateIntent,
  onTemplateIntentConsumed,
}: {
  brandId: string;
  brandName?: string;
  /** Jump to the Render tab with a template (and optionally a render set) loaded. */
  onOpenRender?: (intent: ForgeRenderIntent) => void;
  /** A template to open from elsewhere on the page — its settings unless it names a tab. */
  templateIntent?: ForgeTemplateIntent;
  /** The workbench has taken `templateIntent`; the shell drops it so a remount never replays it. */
  onTemplateIntentConsumed?: () => void;
}) {
  const exitGuard = useForgeExitGuard();
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<string | undefined>();
  // The composition to land on in Edit layers — an output row's Edit names its own.
  const [detailComp, setDetailComp] = useState<string | undefined>();
  // The `sharedTemplateId` of the open shared template. Keyed by id, not held as an object, so a
  // grant switched off elsewhere drops the detail back to the gallery on the next list read.
  const [selectedShared, setSelectedShared] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TemplateSourceSummary | null>(null);
  const [removalReturn, setRemovalReturn] = useState<string | null>(null);
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
    queryFn: () => discoverWorkspaceTemplates(brandId),
    staleTime: FORGE_STALE_MS.lists,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const discoveredItems = workspaceQuery.data?.items ?? [];
  const workspaceFailures = workspaceQuery.data?.failures ?? [];
  const rawSources = sourceQuery.data ?? [];
  const { shared, buildNames } = useMemo(
    () => splitWorkspaceTemplates(discoveredItems, rawSources),
    [discoveredItems, rawSources],
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
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.templateVariants(brandId) }),
        // The gallery nests uploads by family; a stale registry would list a new variant as a row.
        queryClient.invalidateQueries({ queryKey: ['forge', brandId, 'revision-variants'] }),
      ]).then(() => undefined),
    [brandId, queryClient, sourceKey],
  );

  const { imports, start: importDesign } = useDesignTemplateImports(brandId, refreshTemplate);

  const uploaded = useCallback(
    ({ file, uploaded: result }: { file: File; uploaded: { assetId: string } }) => {
      void refreshSources();
      if (isForgeDesignFile(file.name)) void importDesign(file.name, result.assetId);
    },
    [importDesign, refreshSources],
  );

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
      const published =
        source.templateKey || source.forgeRunId
          ? (await discoverWorkspaceTemplates(brandId)).items.filter(
              (item) => item.sourceAssetId === source.assetId && item.granted,
            )
          : [];
      if (source.templateKey && !published.some((item) => item.templateKey === source.templateKey))
        throw new Error('Could not find this template’s render workspace. Refresh and try again.');
      for (const item of published) {
        const disabled = await setTemplateAdoption({
          brandId,
          templateKey: item.templateKey,
          enabled: false,
          workspaceId: item.bindingId,
        });
        if (!disabled.granted)
          throw new Error('Could not turn off render access for this template.');
        accessDisabled = true;
      }
      const removed = await bulkDeleteAssetsOperation(createSupabaseBrowserClient(), {
        brandId,
        assetIds: [source.assetId],
      });
      if (!removed.includes(source.assetId)) throw new Error('The template file was not removed.');
      if (selected === source.assetId) setSelected(removalReturn);
      setRemovalReturn(null);
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

  // A link from the Library (`/forge?template=…&set=…&row=…`), read after mount the way the tab
  // shell reads `#approvals`, and taken once: the template opens here, and its set opens in Render
  // once the template's key is known.
  const [deepLink, setDeepLink] = useState<ForgeDeepLink | null>(null);
  const [authoringHandoff, setAuthoringHandoff] = useState<{ revisionId: string; error: string | null } | null>(null);
  useEffect(() => {
    const link = readForgeDeepLink(window.location.search);
    if (!link) return;
    setSelected(link.templateAssetId);
    if (link.hyperframesRevisionId) {
      setAuthoringHandoff({
        revisionId: link.hyperframesRevisionId,
        error: link.brandId && link.brandId !== brandId
          ? 'This composition was opened for a different brand. Switch to that brand and open the handoff again.'
          : null,
      });
    }
    if (link.templateAssetId && link.tab) setDetailTab(link.tab);
    if (link.renderSetId) setDeepLink(link);
  }, []);

  const morph = useTemplateMorphSwap();
  const open = (assetId: string | null, tab?: string, comp?: string) =>
    exitGuard.runGuarded(() =>
      morph(() => {
        setDetailTab(tab);
        setDetailComp(comp);
        setSelected(assetId);
      }),
    );
  const openShared = (template: SharedTemplate | null) =>
    exitGuard.runGuarded(() => morph(() => setSelectedShared(template ? sharedTemplateId(template) : null)));

  // An intent is an event, taken once and handed back, the way the Render grid takes its own.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new intent is an event.
  useEffect(() => {
    if (!templateIntent) return;
    onTemplateIntentConsumed?.();
    open(templateIntent.assetId, templateIntent.tab ?? 'layers');
  }, [templateIntent]);

  const current = sources.find((source) => source.assetId === selected) ?? null;
  const currentShared = current
    ? null
    : (shared.find((template) => sharedTemplateId(template) === selectedShared) ?? null);

  useEffect(() => {
    if (!deepLink?.renderSetId || current?.assetId !== deepLink.templateAssetId) return;
    if (!current.templateKey) return;
    setDeepLink(null);
    onOpenRender?.({
      templateKey: current.templateKey,
      renderSetId: deepLink.renderSetId,
      ...(deepLink.rowId ? { rowId: deepLink.rowId, rerender: deepLink.rerender } : {}),
    });
  }, [current, deepLink, onOpenRender]);

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
      {sourceQuery.isPending ? (
        <div aria-label="Loading your templates" className="flex flex-col gap-2" role="status">
          <span aria-hidden className="h-4 w-40 animate-pulse rounded-md bg-muted/70" />
          <span aria-hidden className="h-10 w-full animate-pulse rounded-md bg-muted/70" />
        </div>
      ) : null}
      {sourceQuery.isError ? (
        <Alert variant={sourceQuery.data !== undefined ? 'default' : 'destructive'}>
          <AlertTitle>
            {sourceQuery.data !== undefined
              ? 'Your templates could not be refreshed'
              : 'Your templates are unavailable'}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {sourceQuery.data !== undefined
                ? 'Showing the last available list. Refresh to check for changes.'
                : 'Your uploaded templates could not be loaded. Shared templates may still be available.'}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => void sourceQuery.refetch()} disabled={sourceQuery.isFetching}>
              {sourceQuery.isFetching ? 'Retrying…' : 'Retry'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {workspaceQuery.isPending ? (
        <div aria-label="Loading shared templates" className="flex flex-col gap-2" role="status">
          <span aria-hidden className="h-4 w-40 animate-pulse rounded-md bg-muted/70" />
          <span aria-hidden className="h-10 w-full animate-pulse rounded-md bg-muted/70" />
        </div>
      ) : null}
      {authoringHandoff ? (
        <Alert variant={authoringHandoff.error ? 'destructive' : 'default'}>
          <AlertTitle>
            {authoringHandoff.error
              ? 'HyperFrames handoff paused'
              : current
                ? `Source selected · ${sourceDisplayName(current)}`
                : 'Choose a Forge source'}
          </AlertTitle>
          <AlertDescription>
            {authoringHandoff.error ??
              (current
                ? 'This composition is queued for this source’s private Layers workspace. Forge will keep it private while verifying the workspace package path.'
                : 'Choose one of your existing After Effects templates below. The composition stays private while Forge verifies the workspace package path for that source version.')}
          </AlertDescription>
        </Alert>
      ) : null}
      {workspaceQuery.isError ? (
        <Alert variant={workspaceQuery.data ? 'default' : 'destructive'}>
          <AlertTitle>
            {workspaceQuery.data
              ? 'Shared catalog could not be refreshed'
              : 'Shared catalog unavailable'}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {workspaceQuery.data
                ? workspaceFailures.length > 0
                  ? 'Showing the last available partial catalog. Some workspaces may be missing.'
                  : 'Showing the last available catalog. Refresh to check for changes.'
                : 'Your uploaded templates are still available. The shared catalog could not be loaded.'}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => void workspaceQuery.refetch()} disabled={workspaceQuery.isFetching}>
              {workspaceQuery.isFetching ? 'Retrying…' : 'Retry'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!workspaceQuery.isPending && !workspaceQuery.isError && workspaceFailures.length > 0 ? (
        <Alert variant={discoveredItems.length > 0 ? 'default' : 'destructive'}>
          <AlertTitle>
            {discoveredItems.length > 0
              ? 'Some shared workspaces could not be checked'
              : 'Shared catalog unavailable'}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {discoveredItems.length > 0
                ? 'Showing templates from workspaces we could read. Other shared templates may be missing.'
                : 'No shared templates can be confirmed until the workspace catalog loads. Your uploaded templates remain available.'}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => void workspaceQuery.refetch()} disabled={workspaceQuery.isFetching}>
              {workspaceQuery.isFetching ? 'Retrying…' : 'Retry'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!workspaceQuery.isPending && !workspaceQuery.isError && workspaceFailures.length === 0 && discoveredItems.length === 0 ? (
        <Empty className="h-auto w-full rounded-lg border border-dashed py-3" data-testid="shared-catalog-empty">
          <EmptyHeader>
            <EmptyTitle>No shared templates</EmptyTitle>
            <EmptyDescription>No shared templates are available to this brand yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
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

      {authoringHandoff?.error ? <p role="alert" className="text-xs text-destructive">{authoringHandoff.error}</p> : null}

      <DesignTemplateImports
        imports={imports}
        onRetry={importDesign}
        sourceIds={sources.map((source) => source.assetId)}
        onOpen={open}
      />

      {current?.family === 'blender' ? (
        // A .blend is fields and cameras, not comps and slots: none of the After Effects sheet applies.
        <SceneTemplateDetail
          key={current.assetId}
          brandId={brandId}
          source={current}
          onBack={() => open(null)}
          onRename={(title) => void rename(current.assetId, title)}
          onRemove={() => {
            setRemovalReturn(null);
            setRemoving(current);
          }}
        />
      ) : current ? (
        <TemplateDetail
          key={current.assetId}
          brandId={brandId}
          source={current}
          initialTab={detailTab}
          initialComp={detailComp}
          onBack={() => open(null)}
          onDraftChange={exitGuard.onDraftChange}
          hyperframesRevisionId={authoringHandoff?.error ? undefined : authoringHandoff?.revisionId}
          onOpenVariant={async (assetId, tab) => {
            await refreshTemplate();
            open(assetId, tab);
          }}
          onRename={(title) => void rename(current.assetId, title)}
          onDeleteVariant={(variant) =>
            exitGuard.runGuarded(() => {
              setRemovalReturn(variant.rootAssetId);
              setRemoving(variant.source);
            })
          }
          onRemove={() =>
            exitGuard.runGuarded(() => {
              setRemovalReturn(null);
              setRemoving(current);
            })
          }
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
          onOpenSource={
            currentShared.sourceAssetId
              ? () => {
                  openShared(null);
                  open(currentShared.sourceAssetId!);
                }
              : undefined
          }
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
              `${files.map((file) => file.name).join(', ')}: use .aep, .aepx, .aet, .zip, .psd, .ai or .blend, and .ttf or .otf for fonts.`,
            )
          }
        />
      )}

      {exitGuard.dialog}

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
