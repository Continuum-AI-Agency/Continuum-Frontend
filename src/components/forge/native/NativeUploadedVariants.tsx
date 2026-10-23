'use client';

import type {
  HyperframesSceneView,
  NativeTemplateUploadCursor,
  NativeTemplateUploadHistory,
  TemplateRevision,
  TemplateRevisionVariant,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchNativeHyperframesUploads } from '@/lib/library/hyperframesNative';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { nativeEditorHref } from './nativeEditorEdits';

const pending = (history?: NativeTemplateUploadHistory) =>
  history?.items.some(
    (item) => item.ingest.state === 'pending' || item.ingest.state === 'compiling',
  );
const uploadNameSchema = z.object({ name: z.string().trim().max(120) });

export function NativeUploadedVariants({
  view,
  variant,
  parent,
  dirty,
  saving,
  initialJobId,
  onBusyChange,
  onSaved,
}: {
  view: HyperframesSceneView;
  variant?: TemplateRevisionVariant;
  parent?: TemplateRevision;
  dirty: boolean;
  saving: boolean;
  initialJobId?: string;
  onBusyChange: (value: boolean) => void;
  onSaved: (revisionId: string) => void;
}) {
  const client = useQueryClient();
  const form = useForm<z.infer<typeof uploadNameSchema>>({
    resolver: zodResolver(uploadNameSchema),
    defaultValues: { name: '' },
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState(initialJobId);
  const [watched, setWatched] = useState<{
    assetId: string;
    versionId: string;
    parentId: string;
  } | null>(null);
  const active = useRef<AbortController | null>(null);
  const history = useInfiniteQuery({
    queryKey: forgeQueryKeys.nativeUploads(view.brandId, view.assetId),
    initialPageParam: undefined as NativeTemplateUploadCursor | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchNativeHyperframesUploads(view.brandId, view.assetId, { cursor: pageParam, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => pending(page)) ? 2000 : false,
    retry: false,
  });
  const selected = useQuery({
    queryKey: forgeQueryKeys.nativeUpload(view.brandId, view.assetId, jobId ?? 'none'),
    queryFn: ({ signal }) =>
      fetchNativeHyperframesUploads(view.brandId, view.assetId, { jobId, signal }),
    enabled: !!jobId,
    refetchInterval: (query) => (pending(query.state.data) ? 2000 : false),
    retry: false,
  });
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const child = selected.data?.items[0];
    if (
      !dirty &&
      !saving &&
      watched &&
      child?.revisionId &&
      child.uploadedAssetId === watched.assetId &&
      child.uploadedVersionId === watched.versionId &&
      child.intent.parentRevisionId === watched.parentId
    ) {
      setWatched(null);
      void client.invalidateQueries({
        queryKey: forgeQueryKeys.revisionVariants(view.brandId, view.assetId),
      });
      onSaved(child.revisionId);
    }
  }, [client, dirty, onSaved, saving, selected.data, view.assetId, view.brandId, watched]);
  const enabled = history.data?.pages[0]?.enabled === true;
  const canUpload =
    enabled &&
    !!parent &&
    !!variant &&
    !variant.archivedAt &&
    variant.draftHeadRevisionId === parent.id &&
    parent.id === view.revision.revisionId &&
    parent.variantId === view.revision.variantId &&
    parent.templateId === view.assetId &&
    parent.sourceVersionId === view.sourceVersionId &&
    parent.native?.sceneSha256 === view.sceneSha256 &&
    !!view.sourceSceneSha256;
  const upload = async (file: File) => {
    if (!canUpload || !parent || dirty || saving || active.current) return;
    if (!(await form.trigger())) {
      setError('Use a variant name of at most 120 characters.');
      return;
    }
    if (active.current) return;
    if (!/\.(html?|zip)$/i.test(file.name)) {
      setError('Choose a native HTML file or HTML ZIP package.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setUploading(true);
    onBusyChange(true);
    setError(null);
    try {
      const result = await uploadMediaAsset({
        file,
        brandId: view.brandId,
        signal: controller.signal,
        nativeVariant: {
          schemaVersion: 'hyperframes.upload-variant/1',
          templateId: view.assetId,
          variantId: view.revision.variantId,
          parentRevisionId: view.revision.revisionId,
          sourceAssetId: parent.sourceAssetId,
          sourceVersionId: parent.sourceVersionId,
          sourceSha256: parent.checksum.replace(/^sha256:/i, '').toLowerCase(),
          sceneSha256: view.sceneSha256,
          name:
            form.getValues('name').trim() ||
            file.name.replace(/\.[^.]+$/, '').slice(0, 120) ||
            'Uploaded variant',
        },
      });
      if (!result.ingestJobId)
        throw Error('The native upload acknowledgement is incomplete. Retry the upload.');
      setJobId(result.ingestJobId);
      setWatched({
        assetId: result.assetId,
        versionId: result.versionId,
        parentId: view.revision.revisionId,
      });
      form.reset();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The native upload could not be registered.',
      );
    } finally {
      active.current = null;
      setUploading(false);
      onBusyChange(false);
      // A response/signing failure can follow a committed registration. Discover
      // that durable intent even when this call did not return its job identity.
      void client.invalidateQueries({
        queryKey: forgeQueryKeys.nativeUploads(view.brandId, view.assetId),
      });
    }
  };
  const items = [
    ...new Map(
      [
        ...(history.data?.pages.flatMap((page) => page.items) ?? []),
        ...(selected.data?.items ?? []),
      ].map((item) => [item.jobId, item]),
    ).values(),
  ];
  return (
    <section className="space-y-3 border-t pt-3" aria-label="Uploaded native variants">
      <p className="text-sm font-medium">Upload a native source variant</p>
      <p className="text-xs text-muted-foreground">
        Upload HTML or an HTML ZIP. It becomes a saved child of this revision after parsing and
        compilation succeed.
      </p>
      <Input
        aria-label="Uploaded native variant name"
        placeholder="Variant name"
        maxLength={120}
        {...form.register('name')}
        aria-invalid={!!form.formState.errors.name}
        disabled={!canUpload || dirty || saving || uploading}
      />
      <input
        type="file"
        aria-label="Upload native variant"
        accept=".html,.htm,.zip"
        disabled={!canUpload || dirty || saving || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      {!enabled && history.isSuccess ? (
        <p className="text-xs text-muted-foreground">
          Uploaded source variants are unavailable right now.
        </p>
      ) : null}
      {dirty ? (
        <p className="text-xs text-muted-foreground">
          Save or discard the current edits before uploading a source variant.
        </p>
      ) : null}
      {uploading ? <p role="status">Uploading native source…</p> : null}
      {error || history.error || selected.error ? (
        <Alert variant="destructive">
          <AlertTitle>Native upload needs attention</AlertTitle>
          <AlertDescription>
            {error ?? 'Upload status could not be read.'}{' '}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void history.refetch();
                if (jobId) void selected.refetch();
              }}
            >
              Refresh uploads
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ul className="divide-y divide-border text-xs" aria-label="Native source uploads">
        {items.map((item) => (
          <li key={item.jobId} className="space-y-1 py-2">
            <p className="font-medium">
              {item.intent.name} ·{' '}
              {item.ingest.state === 'pending' && item.parseState !== 'parsed'
                ? 'Parsing pending'
                : item.ingest.state}
            </p>
            {item.ingest.error ? <p role="alert">{item.ingest.error}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Link
                href={`${nativeEditorHref(view.brandId, view.assetId, item.intent.parentRevisionId)}&uploadJobId=${item.jobId}`}
              >
                Upload job
              </Link>
              {item.revisionId ? (
                <Link href={nativeEditorHref(view.brandId, view.assetId, item.revisionId)}>
                  Open saved variant
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Older uploads
        </Button>
      ) : null}
    </section>
  );
}
