'use client';

import type {
  HyperframesSceneRenderRequest,
  HyperframesSceneRenderStatus,
  HyperframesSceneView,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { OpenInLibrary } from '@/components/forge/libraryState';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { SceneSignedMedia } from '@/components/forge/scene/SceneRenderPanel';
import { Panel } from '@/components/shared/Panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  cancelNativeHyperframesRender,
  fetchNativeHyperframesRender,
  listNativeHyperframesRenders,
  requestNativeHyperframesPreview,
  requestNativeHyperframesRender,
} from '@/lib/library/hyperframesNative';
import { nativeEditorHref } from './nativeEditorEdits';

const terminal = (state: HyperframesSceneRenderStatus['state']) =>
  ['completed', 'failed', 'cancelled'].includes(state);
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'The render request failed.';

export function NativeHyperframesJobs({
  view,
  dirty,
  initialJobId,
}: {
  view: HyperframesSceneView;
  dirty: boolean;
  initialJobId?: string;
}) {
  const client = useQueryClient();
  const { brandId, assetId } = view;
  const [jobId, setJobId] = useState(initialJobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const intent = useRef<{ fingerprint: string; body: HyperframesSceneRenderRequest } | null>(null);
  const schema = z.object({
    frame: z
      .number()
      .int()
      .min(0)
      .max(view.clock.frameCount - 1),
  });
  const form = useForm<{ frame: number }>({
    resolver: zodResolver(schema),
    defaultValues: { frame: 0 },
  });
  const history = useQuery({
    queryKey: forgeQueryKeys.nativeRenders(brandId, assetId),
    queryFn: ({ signal }) => listNativeHyperframesRenders(brandId, assetId, signal),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.jobs.some((job) => !terminal(job.state)) ? 2000 : false,
  });
  const job = useQuery({
    queryKey: forgeQueryKeys.nativeRender(brandId, assetId, jobId ?? ''),
    queryFn: ({ signal }) => fetchNativeHyperframesRender(brandId, assetId, jobId!, signal),
    enabled: !!jobId,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !terminal(query.state.data.state) ? 2000 : false,
  });

  async function submit(preview: boolean) {
    if (dirty || !view.renderer || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (preview && !(await form.trigger())) return;
      const outputs: HyperframesSceneRenderRequest['outputs'] = preview
        ? [{ file: 'png', frame: form.getValues().frame }]
        : [{ file: 'mp4', crf: 18 }];
      const pins = {
        family: 'hyperframes' as const,
        brandId,
        revisionId: view.revision.revisionId,
        sceneSha256: view.sceneSha256,
        ...view.renderer,
        outputs,
      };
      const fingerprint = JSON.stringify(pins);
      if (intent.current?.fingerprint !== fingerprint)
        intent.current = { fingerprint, body: { ...pins, submissionId: crypto.randomUUID() } };
      const accepted = await (preview
        ? requestNativeHyperframesPreview
        : requestNativeHyperframesRender)(assetId, intent.current.body);
      client.setQueryData(forgeQueryKeys.nativeRender(brandId, assetId, accepted.jobId), accepted);
      setJobId(accepted.jobId);
      intent.current = null;
      void client.invalidateQueries({ queryKey: forgeQueryKeys.nativeRenders(brandId, assetId) });
    } catch (cause) {
      setError(message(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (!jobId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const cancelled = await cancelNativeHyperframesRender(brandId, assetId, jobId);
      client.setQueryData(forgeQueryKeys.nativeRender(brandId, assetId, jobId), cancelled);
      void history.refetch();
    } catch (cause) {
      setError(message(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Preview and renders"
      className="min-h-0"
      bodyClassName="flex flex-col gap-3 overflow-y-auto"
    >
      <p className="text-xs text-muted-foreground">
        {dirty
          ? 'Save your changes before previewing or rendering.'
          : 'Preview and render use this saved revision.'}
      </p>
      {!view.renderer ? (
        <p role="status" className="text-xs text-muted-foreground">
          Native rendering is unavailable in this environment.
        </p>
      ) : null}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit(true);
        }}
      >
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.frame}>
            <FieldLabel htmlFor="native-preview-frame">
              Preview frame (0–{view.clock.frameCount - 1})
            </FieldLabel>
            <Input
              id="native-preview-frame"
              type="number"
              min={0}
              max={view.clock.frameCount - 1}
              aria-invalid={!!form.formState.errors.frame}
              {...form.register('frame', { valueAsNumber: true })}
            />
            <FieldError errors={[form.formState.errors.frame]} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={busy || dirty || !view.renderer}>
              Preview frame
            </Button>
            <Button
              type="button"
              disabled={
                busy ||
                dirty ||
                !view.renderer ||
                view.viewport.width % 2 !== 0 ||
                view.viewport.height % 2 !== 0
              }
              onClick={() => void submit(false)}
            >
              Render MP4
            </Button>
          </div>
        </FieldGroup>
      </form>
      {view.viewport.width % 2 !== 0 || view.viewport.height % 2 !== 0 ? (
        <p className="text-xs text-muted-foreground">MP4 requires an even width and height.</p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Render request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {job.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not read this job</AlertTitle>
          <AlertDescription>
            {message(job.error)}{' '}
            <Button variant="outline" size="sm" onClick={() => void job.refetch()}>
              Retry job
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {job.data ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Job: {job.data.state}</span>
            <Link
              className="text-primary hover:underline"
              href={nativeEditorHref(
                brandId,
                assetId,
                job.data.revision.revisionId,
                job.data.jobId,
              )}
            >
              Saved job link
            </Link>
            {!terminal(job.data.state) ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void cancel()}>
                Cancel render
              </Button>
            ) : null}
          </div>
          {job.data.revision.revisionId !== view.revision.revisionId ? (
            <p className="text-xs text-muted-foreground">
              This job uses another saved revision. Open its link to inspect the source.
            </p>
          ) : null}
          {job.data.error ? (
            <Alert variant="destructive">
              <AlertTitle>{job.data.error.code}</AlertTitle>
              <AlertDescription>{job.data.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {job.data.outputs.map((output) => (
            <figure key={output.versionId} className="flex flex-col gap-1">
              <SceneSignedMedia
                brandId={brandId}
                pin={output}
                mediaType={output.file === 'mp4' ? 'video' : 'image'}
                label="saved Hyperframes revision"
              />
              <figcaption className="text-xs">
                <OpenInLibrary brandId={brandId} assetId={output.assetId} />
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {history.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load render history</AlertTitle>
          <AlertDescription>
            {message(history.error)}{' '}
            <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
              Retry history
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {history.data?.jobs.length ? (
        <ul className="divide-y divide-border text-xs" aria-label="Native render history">
          {history.data.jobs.map((item) => (
            <li key={item.jobId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link
                className="text-primary hover:underline"
                href={nativeEditorHref(brandId, assetId, item.revision.revisionId, item.jobId)}
              >
                Job {item.jobId.slice(0, 8)}
              </Link>
              <span>{item.state}</span>
              <Button size="xs" variant="ghost" onClick={() => setJobId(item.jobId)}>
                View output
              </Button>
            </li>
          ))}
        </ul>
      ) : history.isSuccess ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No renders yet</EmptyTitle>
            <EmptyDescription>Preview a frame or render this saved revision.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </Panel>
  );
}
