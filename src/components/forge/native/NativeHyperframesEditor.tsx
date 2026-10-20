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
  fetchNativeHyperframesScene,
  fetchNativeHyperframesVariants,
  saveNativeHyperframesRevision,
} from '@/lib/library/hyperframesNative';
import { NativeHyperframesJobs } from './NativeHyperframesJobs';
import { NativeUploadedVariants } from './NativeUploadedVariants';
import {
  type NativeEditorForm,
  nativeEditorDefaults,
  nativeEditorFormSchema,
  nativeEditorHref,
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
  if (view.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>Native scene is unavailable</AlertTitle>
        <AlertDescription>
          {problem(view.error)}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void view.refetch();
              }}
            >
              Retry native scene
            </Button>
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                Back to templates
              </Button>
            ) : null}
          </div>
        </AlertDescription>
      </Alert>
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
  view,
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
  const variant = variants.find((item) => item.variantId === view.revision.variantId);
  // Defaults belong to the saved scene; a catalog refresh must never reset unsaved copy.
  const [defaults] = useState(() => nativeEditorDefaults(view, variant));
  const fields = useMemo(() => nativeTextFields(view), [view]);
  const [textPage, setTextPage] = useState(0);
  const firstText = textPage * 20;
  const form = useForm<NativeEditorForm>({
    resolver: zodResolver(nativeEditorFormSchema),
    defaultValues: defaults,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busy = useRef(false);
  const uploadBusy = useCallback((value: boolean) => {
    busy.current = value;
    setUploading(value);
  }, []);
  const replay = useRef<{ fingerprint: string; body: SaveHyperframesRevisionRequest } | null>(null);
  const dirty = form.formState.isDirty;
  const canEdit = view.sourceSceneSha256 !== null;
  const canUpdate =
    !!variant && !variant.original && variant.draftHeadRevisionId === view.revision.revisionId;
  const target = form.watch('target');

  const save = useCallback(async () => {
    if (busy.current || !canEdit) return false;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      if (!(await form.trigger())) {
        const invalidText = fields.findIndex(
          (_, index) => form.getFieldState(`texts.${index}.value`).invalid,
        );
        if (invalidText >= 0) setTextPage(Math.floor(invalidText / 20));
        setError('Check the highlighted fields before saving.');
        return false;
      }
      const candidate = nativeSaveRequest(view, variant, form.getValues(), 'pending-intent');
      const fingerprint = JSON.stringify(candidate);
      if (replay.current?.fingerprint !== fingerprint)
        replay.current = {
          fingerprint,
          body: { ...candidate, idempotencyKey: crypto.randomUUID() },
        };
      const saved = await saveNativeHyperframesRevision(view.assetId, replay.current.body);
      form.reset(form.getValues());
      replay.current = null;
      void client.invalidateQueries({
        queryKey: forgeQueryKeys.revisionVariants(view.brandId, view.assetId),
      });
      onSelectRevision(saved.id);
      return true;
    } catch (cause) {
      setError(problem(cause));
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [canEdit, client, fields, form, onSelectRevision, variant, view]);
  const discard = useCallback(() => {
    form.reset(defaults);
    setError(null);
  }, [defaults, form]);
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
            <fieldset disabled={saving || uploading || !canEdit}>
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
                <FieldDescription>
                  Saving compiles the original source with these edits. A source script that
                  overwrites an edit must be resolved before it can be saved.
                </FieldDescription>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">{saving ? 'Compiling and saving…' : 'Save variant'}</Button>
                  <Button type="button" variant="outline" disabled={!dirty} onClick={discard}>
                    Discard changes
                  </Button>
                </div>
              </FieldGroup>
            </fieldset>
          </form>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Variant was not saved</AlertTitle>
              <AlertDescription>{error} Your changes are still here.</AlertDescription>
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
            This inspector currently exposes copy and viewport edits. Typography, palette, media,
            ordering, and motion controls are still being qualified.
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
