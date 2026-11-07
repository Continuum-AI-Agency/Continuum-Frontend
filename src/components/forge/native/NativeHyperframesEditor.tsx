'use client';

import type {
  HyperframesSceneView,
  SaveHyperframesRevisionRequest,
  TemplateRevisionVariant,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { LayerDraftChange } from '@/components/forge/layerDraft';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { useForgeExitGuard } from '@/components/forge/useForgeExitGuard';
import { PageHeader } from '@/components/shared/PageHeader';
import { Panel } from '@/components/shared/Panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchNativeHyperframesOrder,
  fetchNativeHyperframesScene,
  fetchNativeHyperframesVariants,
  saveNativeHyperframesRevision,
} from '@/lib/library/hyperframesNative';
import { VersionControlPanel } from '../VersionControlPanel';
import { HyperframesFilmPanel } from './HyperframesFilmPanel';
import { NativeHyperframesJobs } from './NativeHyperframesJobs';
import { NativeHyperframesOrder } from './NativeHyperframesOrder';
import { NativeUploadedVariants } from './NativeUploadedVariants';
import { useNativeWorkingCopy } from './useNativeWorkingCopy';
import {
  type NativeEditorForm,
  nativeEditorDefaults,
  nativeEditorFormSchema,
  nativeEditorHref,
  nativeOrderDefaults,
  nativeSaveRequest,
  nativeTextFields,
} from './nativeEditorEdits';

type Props = {
  brandId: string;
  assetId: string;
  name?: string;
  initialRevisionId?: string;
  initialJobId?: string;
  initialUploadJobId?: string;
  onBack?: () => void;
  onDraftChange?: LayerDraftChange;
};
const problem = (error: unknown) =>
  error instanceof Error ? error.message : 'The saved native scene could not be read.';

export function NativeHyperframesPage(props: Omit<Props, 'onDraftChange' | 'onBack'>) {
  const guard = useForgeExitGuard();
  return (
    <>
      <NativeHyperframesEditor {...props} onDraftChange={guard.onDraftChange} />
      {guard.dialog}
    </>
  );
}

/** Hyperframes always stays on this path, including pending ingestion and named native refusals. */
export function NativeHyperframesEditor(props: Props) {
  return (
    <NativeHyperframesSession
      key={`${props.brandId}:${props.assetId}:${props.initialRevisionId ?? 'original'}:${props.initialJobId ?? ''}:${props.initialUploadJobId ?? ''}`}
      {...props}
    />
  );
}

function NativeHyperframesSession({
  brandId,
  assetId,
  name = 'Hyperframes template',
  initialRevisionId,
  initialJobId,
  initialUploadJobId,
  onBack,
  onDraftChange,
}: Props) {
  const [revisionId, setRevisionId] = useState(initialRevisionId);
  const view = useQuery({
    queryKey: forgeQueryKeys.nativeScene(brandId, assetId, revisionId),
    queryFn: ({ signal }) => fetchNativeHyperframesScene(brandId, assetId, revisionId, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const variants = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, assetId),
    queryFn: ({ signal }) => fetchNativeHyperframesVariants(brandId, assetId, signal),
    retry: false,
  });
  // No native scene (ingest off or still compiling): the upload still renders, on the Chrome lane.
  if (view.isError)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Alert>
          <AlertTitle>Native editor unavailable</AlertTitle>
          <AlertDescription>{problem(view.error)}</AlertDescription>
        </Alert>
        <HyperframesFilmPanel brandId={brandId} assetId={assetId} name={name} onBack={onBack} />
      </div>
    );
  if (!view.data)
    return (
      <div
        role="status"
        aria-label="Reading the native scene"
        className="grid min-h-0 flex-1 gap-3 md:grid-cols-2"
      >
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  return (
    <NativeEditorBody
      key={`${brandId}:${assetId}:${view.data.revision.revisionId}`}
      view={view.data}
      variants={variants.data ?? []}
      historyError={variants.error}
      reloadHistory={() => void variants.refetch()}
      name={name}
      initialJobId={initialJobId}
      initialUploadJobId={initialUploadJobId}
      onBack={onBack}
      onDraftChange={onDraftChange}
      onSelectRevision={setRevisionId}
    />
  );
}

function NativeEditorBody({
  view: requestedView,
  variants,
  historyError,
  reloadHistory,
  name,
  initialJobId,
  initialUploadJobId,
  onBack,
  onDraftChange,
  onSelectRevision,
}: {
  view: HyperframesSceneView;
  variants: TemplateRevisionVariant[];
  historyError: unknown;
  reloadHistory: () => void;
  name: string;
  initialJobId?: string;
  initialUploadJobId?: string;
  onBack?: () => void;
  onDraftChange?: LayerDraftChange;
  onSelectRevision: (revisionId: string) => void;
}) {
  const client = useQueryClient();
  const variant = variants.find((item) => item.variantId === requestedView.revision.variantId);
  const selectedRevision = variant?.revisions.find(item => item.id === requestedView.revision.revisionId);
  const [defaults] = useState(() => nativeEditorDefaults(requestedView, variant));
  const [textPage, setTextPage] = useState(0);
  const firstText = textPage * 20;
  const form = useForm<NativeEditorForm>({ resolver: zodResolver(nativeEditorFormSchema), defaultValues: defaults });
  const copy = useNativeWorkingCopy({ brandId: requestedView.brandId, family: 'hyperframes',
    selection: variant && selectedRevision ? { variant, revision: selectedRevision } : undefined,
    initial: defaults, restore: snapshot => form.reset(snapshot) });
  const capturedBase = copy.state?.base.baseRevisionId;
  const retained = useQuery({
    queryKey: forgeQueryKeys.nativeScene(requestedView.brandId, requestedView.assetId, capturedBase),
    queryFn: ({ signal }) => fetchNativeHyperframesScene(requestedView.brandId, requestedView.assetId, capturedBase, signal),
    enabled: !!capturedBase && capturedBase !== requestedView.revision.revisionId,
    staleTime: Infinity, retry: false,
  });
  const view = capturedBase && capturedBase !== requestedView.revision.revisionId ? retained.data ?? requestedView : requestedView;
  const fields = useMemo(() => nativeTextFields(view), [view]);
  const order = useQuery({
    queryKey: [
      ...forgeQueryKeys.nativeScene(view.brandId, view.assetId, view.revision.revisionId),
      'order',
      view.sceneSha256,
    ],
    queryFn: ({ signal }) => fetchNativeHyperframesOrder(view, signal),
    enabled: view.sourceSceneSha256 !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  useEffect(() => {
    if (order.data) {
      const orders = nativeOrderDefaults(order.data);
      form.resetField('orders', { defaultValue: orders });
      void copy.hydrate(snapshot => snapshot.orders.length ? snapshot : { ...snapshot, orders });
    }
  }, [order.data, copy.ready]);
  const [error, setError] = useState<string | null>(null);
  const saving = copy.saving;
  const [uploading, setUploading] = useState(false);
  const busy = useRef(false);
  const uploadBusy = useCallback((value: boolean) => {
    busy.current = value;
    setUploading(value);
  }, []);
  const dirty = copy.dirty || form.formState.isDirty;
  const canEdit = view.sourceSceneSha256 !== null && copy.ready && !copy.readOnly &&
    (!capturedBase || capturedBase === requestedView.revision.revisionId || !!retained.data);
  const canUpdate =
    !!variant && !variant.original && !copy.readOnly;
  const target = form.watch('target');

  useEffect(() => {
    const subscription = form.watch((_value, event) => {
      if (event.type !== 'change' || !event.name || !canEdit) return;
      const control = event.name === 'width' ? 'Width' : event.name === 'height' ? 'Height'
        : event.name.startsWith('texts.') ? `Text ${Number(event.name.split('.')[1]) + 1}`
        : event.name === 'orders' ? 'Source element order' : event.name === 'name' ? 'Variant name' : 'Save to';
      copy.change(form.getValues(), { tool: 'Forge native inspector', control },
        [`hyperframes:${event.name}`], event.name);
    });
    return () => subscription.unsubscribe();
  }, [canEdit, copy.change, form]);
  const save = useCallback(async () => {
    if (busy.current || !canEdit) return false;
    if (!(await form.trigger())) { setError('Check the highlighted fields before saving.'); return false; }
    setError(null);
    const result = await copy.save((base, snapshot, id) => {
      if (base.baseRevisionId !== view.revision.revisionId) throw new Error('The captured source revision is still loading. Your edits are preserved.');
      return { ...nativeSaveRequest(view, variant && { ...variant, draftHeadRevisionId: base.baseRevisionId }, snapshot, id, order.data),
        origin: { tool: 'Forge native editor', button: 'Save variant' } };
    }, intent => saveNativeHyperframesRevision(intent.assetId, intent.body as SaveHyperframesRevisionRequest, undefined, intent.userId),
    { tool: 'Forge native editor', button: 'Save variant' });
    if (!result) return false;
    await client.invalidateQueries({ queryKey: forgeQueryKeys.revisionVariants(view.brandId, view.assetId) });
    onSelectRevision(result.revision.id);
    return !result.state.pending && JSON.stringify(result.state.history.present) === JSON.stringify(result.state.history.baseline);
  }, [canEdit, client, copy.save, form, onSelectRevision, order.data, variant, view]);
  const discard = useCallback(() => { void copy.history('discard', { tool: 'Forge native editor', button: 'Discard changes' }); setError(null); }, [copy.history]);
  useEffect(() => {
    onDraftChange?.({
      dirty,
      busy: saving || uploading,
      saveLabel: 'Save native variant',
      save,
      discard,
    });
  }, [dirty, discard, onDraftChange, save, saving, uploading]);
  useEffect(() => () => onDraftChange?.(null), [onDraftChange]);

  if (!copy.ready) return <div role="status" className="space-y-2 p-3 text-sm">Opening private native copy… {copy.error && <p role="alert">{copy.error}</p>}</div>;
  const blocked = view.capabilities.filter(
    (capability) =>
      capability.state !== 'editable' || (capability.operation === 'text' && !capability.text),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--app-shell-gap)]">
      <PageHeader
        title={name}
        description={`${view.viewport.width} × ${view.viewport.height} · ${view.clock.frameCount} frames · ${variant?.name ?? 'Saved revision'}`}
        action={
          <>
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                Back to templates
              </Button>
            ) : (
              <Link className="text-sm text-primary hover:underline" href="/forge">
                Templates
              </Link>
            )}
            <Link
              className="text-sm text-primary hover:underline"
              href={nativeEditorHref(view.brandId, view.assetId, view.revision.revisionId)}
            >
              Saved revision link
            </Link>
          </>
        }
      />
      <div data-working-copy-id={copy.state?.workingCopyId} data-base-revision-id={copy.state?.base.baseRevisionId} className="space-y-1 text-xs">
        {copy.readOnly ? <p>This revision is read-only. Branch it in Variant control before editing.</p> : !copy.ready ? <p role="status">Opening private native copy…</p> : <p>Private browser copy · base {capturedBase?.slice(0, 8)}. Saved revisions and releases remain separate.</p>}
        {capturedBase && variant && capturedBase !== variant.draftHeadRevisionId && <p role="alert">The branch advanced. Your private edits remain on their captured base; save will require conflict review.</p>}
        {(copy.error || retained.error) && <p role="alert">{copy.error ?? problem(retained.error)} <Button size="xs" onClick={() => void copy.retry()}>Retry native history</Button></p>}
        {copy.state?.pending && <p role="status">The exact native save is retained. <Button size="xs" disabled={saving} onClick={() => void copy.dismissSave()}>Stop retrying native request</Button></p>}
      </div>
      <details className="border-b border-border p-[var(--card-pad)]">
        <summary className="cursor-pointer text-sm font-medium">
          Variant control and releases
        </summary>
        <div className="pt-3">
          <VersionControlPanel
            brandId={view.brandId}
            assetId={view.assetId}
            versionId={view.sourceVersionId}
            variants={variants}
            revisionId={view.revision.revisionId}
            onOpenRevision={(revision) => {
              void copy.park().then(() => onSelectRevision(revision.id)).catch(cause => setError(problem(cause)));
            }}
          />
        </div>
      </details>
      <div className="grid min-h-0 flex-1 divide-y divide-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
        <Panel title="Edit saved source" bodyClassName="flex flex-col gap-3 overflow-y-auto">
          {!canEdit ? (
            <p role="status" className="text-sm text-muted-foreground">
              This revision uses an older upload and is read-only. Its saved preview and render
              remain available.
            </p>
          ) : null}
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={uploading || !canEdit}>
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="target"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="native-save-target">Save to</FieldLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="native-save-target">
                          <SelectValue items={{ new: 'New variant', current: 'Current variant' }} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="new">New variant</SelectItem>
                            <SelectItem value="current" disabled={!canUpdate}>
                              Current variant
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                {target === 'new' ? (
                  <Field data-invalid={!!form.formState.errors.name}>
                    <FieldLabel htmlFor="native-variant-name">Variant name</FieldLabel>
                    <Input
                      id="native-variant-name"
                      maxLength={120}
                      aria-invalid={!!form.formState.errors.name}
                      {...form.register('name')}
                    />
                    <FieldError errors={[form.formState.errors.name]} />
                  </Field>
                ) : null}
                {fields.slice(firstText, firstText + 20).map((field, offset) => {
                  const index = firstText + offset;
                  return (
                    <Field
                      key={field.fieldId}
                      data-invalid={!!form.formState.errors.texts?.[index]?.value}
                    >
                      <FieldLabel htmlFor={`native-copy-${index}`}>Text {index + 1}</FieldLabel>
                      <Textarea
                        id={`native-copy-${index}`}
                        rows={2}
                        maxLength={65_536}
                        aria-invalid={!!form.formState.errors.texts?.[index]?.value}
                        {...form.register(`texts.${index}.value`)}
                      />
                      {field.reveal ? (
                        <FieldDescription>
                          Preserves the source’s text reveal timing.
                        </FieldDescription>
                      ) : null}
                      <FieldError errors={[form.formState.errors.texts?.[index]?.value]} />
                    </Field>
                  );
                })}
                {fields.length > 20 ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={textPage === 0}
                      onClick={() => setTextPage((page) => page - 1)}
                    >
                      Previous text fields
                    </Button>
                    <span>
                      Text {firstText + 1}–{Math.min(firstText + 20, fields.length)} of{' '}
                      {fields.length}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={firstText + 20 >= fields.length}
                      onClick={() => setTextPage((page) => page + 1)}
                    >
                      Next text fields
                    </Button>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  {(['width', 'height'] as const).map((dimension) => (
                    <Field key={dimension} data-invalid={!!form.formState.errors[dimension]}>
                      <FieldLabel htmlFor={`native-${dimension}`}>
                        {dimension === 'width' ? 'Width' : 'Height'}
                      </FieldLabel>
                      <Input
                        id={`native-${dimension}`}
                        type="number"
                        min={1}
                        max={8192}
                        aria-invalid={!!form.formState.errors[dimension]}
                        {...form.register(dimension, { valueAsNumber: true })}
                      />
                      <FieldError errors={[form.formState.errors[dimension]]} />
                    </Field>
                  ))}
                </div>
                <Controller
                  control={form.control}
                  name="orders"
                  render={({ field }) => (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Source element order</p>
                      {order.isPending && view.sourceSceneSha256 ? (
                        <p role="status" className="text-xs text-muted-foreground">
                          Loading saved element order…
                        </p>
                      ) : null}
                      {order.isError ? (
                        <p role="status" className="text-xs text-muted-foreground">
                          Element order is unavailable for this source. Copy and size edits remain
                          available.
                        </p>
                      ) : null}
                      {order.data ? (
                        <NativeHyperframesOrder
                          view={order.data}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      ) : null}
                      {order.data?.groups.length ? (
                        <FieldDescription>
                          Earlier elements come first in the source. Layout, CSS stacking, and
                          scripts can affect the visible result. Saving recompiles and verifies the
                          order across the delivery timeline.
                        </FieldDescription>
                      ) : null}
                    </div>
                  )}
                />
                <FieldDescription>
                  Saving compiles the original source with these edits. A source script that
                  overwrites an edit must be resolved before it can be saved.
                </FieldDescription>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={!copy.state?.history.past.length} onClick={() => void copy.history('undo', { tool: 'Forge native editor', button: 'Undo native change' })}>Undo native change</Button>
                  <Button type="button" variant="outline" disabled={!copy.state?.history.future.length} onClick={() => void copy.history('redo', { tool: 'Forge native editor', button: 'Redo native change' })}>Redo native change</Button>
                  <Button type="submit" disabled={saving || !dirty && !copy.state?.pending}>{saving ? 'Compiling and saving…' : 'Save variant'}</Button>
                  <Button type="button" variant="outline" disabled={!dirty} onClick={discard}>
                    Discard changes
                  </Button>
                </div>
              </FieldGroup>
            </fieldset>
          </form>
          {error || copy.error ? (
            <Alert variant="destructive">
              <AlertTitle>Variant was not saved</AlertTitle>
              <AlertDescription>{error ?? copy.error} Your changes are still here.</AlertDescription>
            </Alert>
          ) : null}
          {blocked.length ? (
            <details className="text-xs text-muted-foreground">
              <summary>Source capability limits ({blocked.length})</summary>
              <ul className="mt-2 space-y-1">
                {blocked.map((capability, index) => (
                  <li key={`${capability.nodeId}:${capability.operation}:${index}`}>
                    {capability.operation}:{' '}
                    {capability.reason ??
                      (capability.state === 'editable'
                        ? 'Recompile this source to expose its saved value.'
                        : capability.state)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="text-xs text-muted-foreground">
            This inspector exposes copy, viewport, and source element order edits. Typography,
            palette, media, and motion controls are still being qualified.
          </p>
          <Panel title="Variants and revisions" bodyClassName="p-0">
            {historyError ? (
              <Alert variant="destructive">
                <AlertTitle>Revision history unavailable</AlertTitle>
                <AlertDescription>
                  {problem(historyError)}{' '}
                  <Button variant="outline" size="sm" onClick={reloadHistory}>
                    Retry revisions
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            <ul className="divide-y divide-border text-xs" aria-label="Native variants">
              {variants
                .filter((item) => item.templateId === view.assetId)
                .map((item) => (
                  <li key={item.variantId} className="py-2">
                    <p className="font-medium">{item.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {item.revisions
                        .filter((revision) => revision.native?.family === 'hyperframes')
                        .map((revision) => (
                          <Link
                            key={revision.id}
                            className="text-primary hover:underline"
                            aria-current={
                              revision.id === view.revision.revisionId ? 'page' : undefined
                            }
                            href={nativeEditorHref(view.brandId, view.assetId, revision.id)}
                          >
                            Revision {revision.number}
                            {revision.id === item.draftHeadRevisionId ? ' · latest' : ''}
                          </Link>
                        ))}
                    </div>
                  </li>
                ))}
            </ul>
          </Panel>
          <NativeUploadedVariants
            view={view}
            variant={variant}
            parent={variant?.revisions.find((item) => item.id === view.revision.revisionId)}
            dirty={dirty}
            saving={saving}
            initialJobId={initialUploadJobId}
            onBusyChange={uploadBusy}
            onSaved={onSelectRevision}
          />
        </Panel>
        <NativeHyperframesJobs
          view={view}
          dirty={dirty || saving || uploading}
          initialJobId={initialJobId}
        />
      </div>
    </div>
  );
}
