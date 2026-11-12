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
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedUiError, useUiErrorMessage } from '@/i18n/errors';
import { Link } from '@/i18n/navigation';
import { useValidationErrorMap } from '@/i18n/validation';
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
  const validationErrorMap = useValidationErrorMap();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

  const client = useQueryClient();
  const form = useForm<z.infer<typeof uploadNameSchema>>({
    resolver: zodResolver(uploadNameSchema, { error: validationErrorMap }),
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
      fetchNativeHyperframesUploads(view.brandId, view.assetId, {
        cursor: pageParam,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => pending(page)) ? 2000 : false,
    retry: false,
  });
  const selected = useQuery({
    queryKey: forgeQueryKeys.nativeUpload(view.brandId, view.assetId, jobId ?? 'none'),
    queryFn: ({ signal }) =>
      fetchNativeHyperframesUploads(view.brandId, view.assetId, {
        jobId,
        signal,
      }),
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
      setError(translateUi('use_a_variant_name_of_at_most_120_c_7c3ec603'));
      return;
    }
    if (active.current) return;
    if (!/\.(html?|zip)$/i.test(file.name)) {
      setError(translateUi('choose_a_native_html_file_or_html_z_641ddc2f'));
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
      if (!result.ingestJobId) throw new LocalizedUiError(translateUi('nativeUploadAckIncomplete'));
      setJobId(result.ingestJobId);
      setWatched({
        assetId: result.assetId,
        versionId: result.versionId,
        parentId: view.revision.revisionId,
      });
      form.reset();
    } catch (cause) {
      console.error('[NativeUploadedVariants] Upload failed', cause);
      setError(uiErrorText(cause));
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
    <section
      className="space-y-3 border-t pt-3"
      aria-label={translateUi('uploaded_native_variants_a56aaba9')}
    >
      <p className="text-sm font-medium">
        {translateUi('upload_a_native_source_variant_18112a07')}
      </p>
      <p className="text-xs text-muted-foreground">
        {' '}
        {translateUi('upload_html_or_an_html_zip_it_becom_78aa4372')}{' '}
      </p>
      <Input
        aria-label={translateUi('uploaded_native_variant_name_04272c91')}
        placeholder={translateUi('variant_name_0f204472')}
        maxLength={120}
        {...form.register('name')}
        aria-invalid={!!form.formState.errors.name}
        disabled={!canUpload || dirty || saving || uploading}
      />
      <input
        type="file"
        aria-label={translateUi('upload_native_variant_f852bdf8')}
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
          {' '}
          {translateUi('uploaded_source_variants_are_unavai_642e2788')}{' '}
        </p>
      ) : null}
      {dirty ? (
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('save_or_discard_the_current_edits_b_a10b6edf')}{' '}
        </p>
      ) : null}
      {uploading ? <p role="status">{translateUi('uploading_native_source_318af512')}</p> : null}
      {error || history.error || selected.error ? (
        <Alert variant="destructive">
          <AlertTitle>{translateUi('native_upload_needs_attention_97ae2337')}</AlertTitle>
          <AlertDescription>
            {error ?? translateUi('upload_status_could_not_be_read_c056736b')}{' '}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void history.refetch();
                if (jobId) void selected.refetch();
              }}
            >
              {' '}
              {translateUi('refresh_uploads_e73ecc73')}{' '}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ul
        className="divide-y divide-border text-xs"
        aria-label={translateUi('native_source_uploads_12e0a1e5')}
      >
        {items.map((item) => (
          <li key={item.jobId} className="space-y-1 py-2">
            <p className="font-medium">
              {item.intent.name} ·{' '}
              {item.ingest.state === 'pending' && item.parseState !== 'parsed'
                ? translateUi('parsing_pending_b5b7ebf4')
                : item.ingest.state}
            </p>
            {item.ingest.error ? (
              <p role="alert">{translateUi('nativeUploadIngestFailed')}</p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Link
                href={`${nativeEditorHref(view.brandId, view.assetId, item.intent.parentRevisionId)}&uploadJobId=${item.jobId}`}
              >
                {' '}
                {translateUi('upload_job_5c6293ff')}{' '}
              </Link>
              {item.revisionId ? (
                <Link href={nativeEditorHref(view.brandId, view.assetId, item.revisionId)}>
                  {' '}
                  {translateUi('open_saved_variant_a4026a5e')}{' '}
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
          {' '}
          {translateUi('older_uploads_8389340e')}{' '}
        </Button>
      ) : null}
    </section>
  );
}
