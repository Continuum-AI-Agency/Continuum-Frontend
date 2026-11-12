'use client';

import {
  isWebTemplateKey,
  type TemplateSourceSummary,
  templateDisplayName,
  type WorkspaceTemplate,
} from '@continuum/contracts';
import { experimental_streamedQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTemplateMorphSwap } from '@/components/forge/TemplateWireframe';
import { WebComponentTemplateDetail } from '@/components/forge/WebComponentTemplateDetail';
import { UploadStrip } from '@/components/library/UploadStrip';
import { useMediaUpload } from '@/components/library/useMediaUpload';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast-imperative';
import { bulkDeleteAssetsOperation } from '@/lib/library/creativeOperations';
import {
  discoverWorkspaceTemplates,
  renameTemplateSource,
  setTemplateAdoption,
  streamTemplateSources,
  uploadTemplateFontFiles,
} from '@/lib/library/templateSources';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { DesignTemplateImports, useDesignTemplateImports } from './DesignTemplateImports';
import PresentationWorkspace from './presentations/PresentationMessages';
import { useForgeExitGuard } from './useForgeExitGuard';

// The detail and the gallery are the heaviest panels behind the tab shell: load them on first use
// so the shell paints first.
const TemplateDetail = dynamic(
  () => import('@/components/forge/TemplateDetail').then((module) => module.TemplateDetail),
  { loading: () => <Skeleton className="h-40 w-full" /> },
);

const TemplateGallery = dynamic(
  () => import('@/components/forge/TemplateGallery').then((module) => module.TemplateGallery),
  { loading: () => <Skeleton className="h-40 w-full" /> },
);

const NativeHyperframesEditor = dynamic(
  () =>
    import('@/components/forge/native/NativeHyperframesEditor').then(
      (module) => module.NativeHyperframesEditor,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

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
  const translateUi = useUiTranslations('forge');

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
  const [removeBusy, setRemoveBusy] = useState(false);
  // Dropped files named like a template already here, waiting for "revision or new template?".
  const [sameName, setSameName] = useState<Array<{ file: File; source: TemplateSourceSummary }>>(
    [],
  );
  // A file on its way to becoming a template's next source revision, until its panel takes it.
  const [revision, setRevision] = useState<{ assetId: string; file: File } | null>(null);
  const queryClient = useQueryClient();
  const sourceKey = useMemo(() => forgeQueryKeys.templateSources(brandId), [brandId]);
  // Cards roll in a page at a time; a refetch keeps the cards on screen until its list is whole.
  const sourceQuery = useQuery({
    queryKey: sourceKey,
    queryFn: experimental_streamedQuery({
      streamFn: () => streamTemplateSources(brandId),
      reducer: (sources: TemplateSourceSummary[], page: TemplateSourceSummary[]) => [
        ...sources,
        ...page,
      ],
      initialValue: [],
      refetchMode: 'replace',
    }),
    staleTime: FORGE_STALE_MS.lists,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  // Only the first read's later pages are "more on the way"; a refetch swaps in its list whole.
  const firstReadDone = useRef(false);
  if (sourceQuery.fetchStatus === 'idle' && sourceQuery.data !== undefined)
    firstReadDone.current = true;
  const loadingMoreSources =
    !firstReadDone.current && sourceQuery.data !== undefined && sourceQuery.isFetching;
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

  // A source that turns renderable (a web component's parse, a package's promotion) belongs in the
  // Render picker now, not when the picker's cached list goes stale. Compared on whole lists only.
  const renderableKey = sources
    .flatMap((source) => (source.templateKey ? [source.templateKey] : []))
    .sort()
    .join('|');
  const seenRenderable = useRef<string | null>(null);
  useEffect(() => {
    if (!firstReadDone.current || sourceQuery.isFetching) return;
    if (seenRenderable.current !== null && seenRenderable.current !== renderableKey)
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.templates(brandId) });
    seenRenderable.current = renderableKey;
  }, [brandId, queryClient, renderableKey, sourceQuery.isFetching]);

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
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_rename_the_template_ced97fb9'),
      );
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
          ? translateUi('value0_removed_from_value1_1836d8d6', {
              value0: String(name),
              value1: String(brandName ?? translateUi('currentBrandFallback')),
            })
          : translateUi('value0_is_now_available_to_render_dc5af4f2', { value0: String(name) }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translateUi('could_not_change_that_fe705a52'),
      );
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
      // A web component renders from its own bundle: no workspace holds it, so none is switched off.
      const inWorkspace = !isWebTemplateKey(source.templateKey ?? '');
      const published =
        inWorkspace && (source.templateKey || source.forgeRunId)
          ? (await discoverWorkspaceTemplates(brandId)).items.filter(
              (item) => item.sourceAssetId === source.assetId && item.granted,
            )
          : [];
      if (
        inWorkspace &&
        source.templateKey &&
        !published.some((item) => item.templateKey === source.templateKey)
      )
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
      if (selected === source.assetId) setSelected(null);
      setRemoving(null);
      toast.success(
        translateUi('value0_removed_from_value1_1836d8d6', {
          value0: String(sourceDisplayName(source)),
          value1: String(brandName ?? translateUi('currentBrandFallback')),
        }),
      );
    } catch (error) {
      toast.error(
        accessDisabled
          ? translateUi('the_template_file_could_not_be_remo_f20f098a')
          : error instanceof Error
            ? error.message
            : translateUi('could_not_remove_the_template_462f7064'),
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
  const [authoringHandoff, setAuthoringHandoff] = useState<{
    revisionId: string;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    const link = readForgeDeepLink(window.location.search);
    if (!link) return;
    setSelected(link.templateAssetId);
    if (link.hyperframesRevisionId) {
      setAuthoringHandoff({
        revisionId: link.hyperframesRevisionId,
        error:
          link.brandId && link.brandId !== brandId
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
    exitGuard.runGuarded(() =>
      morph(() => setSelectedShared(template ? sharedTemplateId(template) : null)),
    );

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
        toast.info(
          translateUi('already_in_forge_as_value0_8886acd4', {
            value0: String(sourceDisplayName(match.source)),
          }),
        );
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
    if (stored.length)
      toast.success(
        translateUi('fonts_added_value0_664da924', { value0: String(stored.join(', ')) }),
      );
    if (refused.length)
      toast.error(
        translateUi('fonts_not_added_value0_aec8462a', { value0: String(refused.join('; ')) }),
      );
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
      {sourceQuery.isError ? (
        <Alert variant={sourceQuery.data !== undefined ? 'default' : 'destructive'}>
          <AlertTitle>
            {sourceQuery.data !== undefined
              ? translateUi('your_templates_could_not_be_refresh_66513148')
              : translateUi('your_templates_are_unavailable_91d7a56a')}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {sourceQuery.data !== undefined
                ? translateUi('showing_the_last_available_list_ref_16b46539')
                : translateUi('your_uploaded_templates_could_not_b_79f44faa')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void sourceQuery.refetch()}
              disabled={sourceQuery.isFetching}
            >
              {sourceQuery.isFetching
                ? translateUi('retrying_a16c8b1c')
                : translateUi('retry_942087cc')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {workspaceQuery.isPending ? (
        <div
          aria-label={translateUi('loading_shared_templates_56387822')}
          className="flex flex-col gap-2"
          role="status"
        >
          <Skeleton aria-hidden className="h-4 w-40 rounded-md" />
          <Skeleton aria-hidden className="h-10 w-full rounded-md" />
        </div>
      ) : null}
      {authoringHandoff ? (
        <Alert variant={authoringHandoff.error ? 'destructive' : 'default'}>
          <AlertTitle>
            {authoringHandoff.error
              ? translateUi('hyperframes_handoff_paused_e4081cf3')
              : current
                ? translateUi('source_selected_value0_5fbee73a', {
                    value0: String(sourceDisplayName(current)),
                  })
                : translateUi('choose_a_forge_source_f6821875')}
          </AlertTitle>
          <AlertDescription>
            {authoringHandoff.error ??
              (current
                ? translateUi('this_composition_is_queued_for_this_51ff0aa0')
                : translateUi('choose_one_of_your_existing_after_e_1e99e923'))}
          </AlertDescription>
        </Alert>
      ) : null}
      {workspaceQuery.isError ? (
        <Alert variant={workspaceQuery.data ? 'default' : 'destructive'}>
          <AlertTitle>
            {workspaceQuery.data
              ? translateUi('shared_catalog_could_not_be_refresh_85dce8bd')
              : translateUi('shared_catalog_unavailable_3e77a7c8')}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {workspaceQuery.data
                ? workspaceFailures.length > 0
                  ? translateUi('showing_the_last_available_partial__6670709e')
                  : translateUi('showing_the_last_available_catalog__1b988dfb')
                : translateUi('your_uploaded_templates_are_still_a_d5e73682')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void workspaceQuery.refetch()}
              disabled={workspaceQuery.isFetching}
            >
              {workspaceQuery.isFetching
                ? translateUi('retrying_a16c8b1c')
                : translateUi('retry_942087cc')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!workspaceQuery.isPending && !workspaceQuery.isError && workspaceFailures.length > 0 ? (
        <Alert variant={discoveredItems.length > 0 ? 'default' : 'destructive'}>
          <AlertTitle>
            {discoveredItems.length > 0
              ? translateUi('some_shared_workspaces_could_not_be_a26fcdcb')
              : translateUi('shared_catalog_unavailable_3e77a7c8')}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {discoveredItems.length > 0
                ? translateUi('showing_templates_from_workspaces_w_35ffc2a6')
                : translateUi('no_shared_templates_can_be_confirme_c4c96624')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void workspaceQuery.refetch()}
              disabled={workspaceQuery.isFetching}
            >
              {workspaceQuery.isFetching
                ? translateUi('retrying_a16c8b1c')
                : translateUi('retry_942087cc')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!workspaceQuery.isPending &&
      !workspaceQuery.isError &&
      workspaceFailures.length === 0 &&
      discoveredItems.length === 0 ? (
        <Empty
          className="h-auto w-full rounded-lg border border-dashed py-3"
          data-testid="shared-catalog-empty"
        >
          <EmptyHeader>
            <EmptyTitle>{translateUi('no_shared_templates_707fa346')}</EmptyTitle>
            <EmptyDescription>
              {translateUi('no_shared_templates_are_available_t_e4c7e04f')}
            </EmptyDescription>
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

      {authoringHandoff?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {authoringHandoff.error}
        </p>
      ) : null}

      <DesignTemplateImports
        imports={imports}
        onRetry={importDesign}
        sourceIds={sources.map((source) => source.assetId)}
        onOpen={open}
      />

      {current?.family === 'presentation' ? (
        <PresentationWorkspace
          key={`${current.assetId}:${current.versionId}`}
          brandId={brandId}
          source={current}
          onBack={() => open(null)}
          onDraftChange={exitGuard.onDraftChange}
          onOpenVariant={(assetId) => open(assetId)}
          revisionFile={revision?.assetId === current.assetId ? revision.file : undefined}
          onRevisionTaken={() => setRevision(null)}
          onChanged={refreshTemplate}
        />
      ) : current?.family === 'hyperframes' ? (
        <NativeHyperframesEditor
          key={`${brandId}:${current.assetId}`}
          brandId={brandId}
          assetId={current.assetId}
          name={sourceDisplayName(current)}
          onBack={() => open(null)}
          onDraftChange={exitGuard.onDraftChange}
        />
      ) : current?.family === 'blender' ? (
        // A .blend is fields and cameras, not comps and slots: none of the After Effects sheet applies.
        <SceneTemplateDetail
          key={current.assetId}
          brandId={brandId}
          source={current}
          onBack={() => open(null)}
          onRename={(title) => void rename(current.assetId, title)}
          onRemove={() => setRemoving(current)}
        />
      ) : current?.family === 'web_component' ? (
        <WebComponentTemplateDetail
          key={current.assetId}
          brandId={brandId}
          source={current}
          onBack={() => open(null)}
          onRename={(title) => void rename(current.assetId, title)}
          onRemove={() => setRemoving(current)}
          onOpenRender={onOpenRender}
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
          onRemove={() => exitGuard.runGuarded(() => setRemoving(current))}
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
          loading={sourceQuery.isPending}
          loadingMore={loadingMoreSources}
          shared={shared}
          adopting={adopting}
          onOpen={open}
          onOpenShared={openShared}
          onRename={(assetId, title) => void rename(assetId, title)}
          onToggleShared={(template) => void toggleShared(template)}
          onOpenRender={onOpenRender}
          onFiles={(files) => void receive(files)}
          onFonts={receiveFonts}
          onPresentationCreated={async (assetId) => {
            await refreshTemplate();
            open(assetId);
          }}
          onRejected={(files) =>
            toast.error(
              translateUi('value0_use_aep_aepx_aet_zip_psd_ai__0263204d', {
                value0: String(files.map((file) => file.name).join(', ')),
              }),
            )
          }
        />
      )}

      {exitGuard.dialog}

      <AlertDialog open={asking !== undefined} onOpenChange={(next) => !next && answer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {askingName} {translateUi('already_has_this_file_name_61067934')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {' '}
              {translateUi('upload_865e89de')} {asking?.file.name}{' '}
              {translateUi('as_the_next_revision_of_212045ae')} {askingName}{' '}
              {translateUi('you_compare_the_changes_before_it_r_85bfabbd')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('cancel_19766ed6')}</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => answer('template')}>
              {' '}
              {translateUi('new_template_30d87ec4')}{' '}
            </Button>
            <Button type="button" onClick={() => answer('revision')}>
              {' '}
              {translateUi('new_revision_of_e68aa886')} {askingName}
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
              {' '}
              {translateUi('remove_5b7e3a54')}
              {removing ? sourceDisplayName(removing) : ''}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {' '}
              {translateUi('this_removes_the_template_from_3768016e')}{' '}
              {brandName ?? translateUi('this_brand_c31b658a')}{' '}
              {translateUi('and_its_library_existing_renders_an_0fc3d33a')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>
              {translateUi('cancel_19766ed6')}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={removeBusy}
              onClick={() => void removeFromBrand()}
            >
              {removeBusy
                ? translateUi('removing_d4b09919')
                : translateUi('remove_from_brand_6bdc486e')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
