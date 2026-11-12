'use client';

import type {
  HyperframesSceneView,
  SaveHyperframesRevisionRequest,
  TemplateRevisionVariant,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations as useUiTranslations } from 'next-intl';
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
import { Link } from '@/i18n/navigation';
import { useValidationErrorMap } from '@/i18n/validation';
import {
  fetchNativeHyperframesOrder,
  fetchNativeHyperframesScene,
  fetchNativeHyperframesVariants,
  saveNativeHyperframesRevision,
} from '@/lib/library/hyperframesNative';
import { HyperframesFilmPanel } from './HyperframesFilmPanel';
import { NativeHyperframesJobs } from './NativeHyperframesJobs';
import { NativeHyperframesOrder } from './NativeHyperframesOrder';
import { NativeUploadedVariants } from './NativeUploadedVariants';
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
  const translateUi = useUiTranslations('forge');

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
          <AlertTitle>{translateUi('native_editor_unavailable_49a3c8ce')}</AlertTitle>
          <AlertDescription>{problem(view.error)}</AlertDescription>
        </Alert>
        <HyperframesFilmPanel brandId={brandId} assetId={assetId} name={name} onBack={onBack} />
      </div>
    );
  if (!view.data)
    return (
      <div
        role="status"
        aria-label={translateUi('reading_the_native_scene_bcd6d5d7')}
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
  const validationErrorMap = useValidationErrorMap();

  const translateUi = useUiTranslations('forge');

  const client = useQueryClient();
  const variant = variants.find((item) => item.variantId === view.revision.variantId);
  // Defaults belong to the saved scene; a catalog refresh must never reset unsaved copy.
  const [defaults] = useState(() => nativeEditorDefaults(view, variant));
  const fields = useMemo(() => nativeTextFields(view), [view]);
  const [textPage, setTextPage] = useState(0);
  const firstText = textPage * 20;
  const form = useForm<NativeEditorForm>({
    resolver: zodResolver(nativeEditorFormSchema, { error: validationErrorMap }),
    defaultValues: defaults,
  });
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
    if (order.data) form.resetField('orders', { defaultValue: nativeOrderDefaults(order.data) });
  }, [form, order.data]);
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
        setError(translateUi('check_the_highlighted_fields_before_d0e36f27'));
        return false;
      }
      const candidate = nativeSaveRequest(
        view,
        variant,
        form.getValues(),
        'pending-intent',
        order.data,
      );
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
  }, [canEdit, client, fields, form, onSelectRevision, order.data, variant, view, translateUi]);
  const discard = useCallback(() => {
    form.reset({ ...defaults, orders: nativeOrderDefaults(order.data) });
    setError(null);
  }, [defaults, form, order.data]);
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
        description={translateUi('value0_value1_value2_frames_value3_8a367c50', {
          value0: String(view.viewport.width),
          value1: String(view.viewport.height),
          value2: String(view.clock.frameCount),
          value3: String(variant?.name ?? 'Saved revision'),
        })}
        action={
          <>
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                {' '}
                {translateUi('back_to_templates_1b58f427')}{' '}
              </Button>
            ) : (
              <Link className="text-sm text-primary hover:underline" href="/forge">
                {' '}
                {translateUi('templates_56b564b7')}{' '}
              </Link>
            )}
            <Link
              className="text-sm text-primary hover:underline"
              href={nativeEditorHref(view.brandId, view.assetId, view.revision.revisionId)}
            >
              {' '}
              {translateUi('saved_revision_link_f75ab4ae')}{' '}
            </Link>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 divide-y divide-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
        <Panel
          title={translateUi('edit_saved_source_dbf84a94')}
          bodyClassName="flex flex-col gap-3 overflow-y-auto"
        >
          {!canEdit ? (
            <p role="status" className="text-sm text-muted-foreground">
              {' '}
              {translateUi('this_revision_uses_an_older_upload__f6bf8d4a')}{' '}
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
                      <FieldLabel htmlFor="native-save-target">
                        {translateUi('save_to_1daa7df7')}
                      </FieldLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="native-save-target">
                          <SelectValue items={{ new: 'New variant', current: 'Current variant' }} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="new">
                              {translateUi('new_variant_a5ad40f9')}
                            </SelectItem>
                            <SelectItem value="current" disabled={!canUpdate}>
                              {' '}
                              {translateUi('current_variant_e3460250')}{' '}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                {target === 'new' ? (
                  <Field data-invalid={!!form.formState.errors.name}>
                    <FieldLabel htmlFor="native-variant-name">
                      {translateUi('variant_name_0f204472')}
                    </FieldLabel>
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
                      <FieldLabel htmlFor={`native-copy-${index}`}>
                        {translateUi('text_71988c4d')} {index + 1}
                      </FieldLabel>
                      <Textarea
                        id={`native-copy-${index}`}
                        rows={2}
                        maxLength={65_536}
                        aria-invalid={!!form.formState.errors.texts?.[index]?.value}
                        {...form.register(`texts.${index}.value`)}
                      />
                      {field.reveal ? (
                        <FieldDescription>
                          {' '}
                          {translateUi('preserves_the_source_s_text_reveal__524bef47')}{' '}
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
                      {' '}
                      {translateUi('previous_text_fields_28d83be8')}{' '}
                    </Button>
                    <span>
                      {' '}
                      {translateUi('text_71988c4d')} {firstText + 1}–
                      {Math.min(firstText + 20, fields.length)} {translateUi('of_28391d3b')}{' '}
                      {fields.length}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={firstText + 20 >= fields.length}
                      onClick={() => setTextPage((page) => page + 1)}
                    >
                      {' '}
                      {translateUi('next_text_fields_d21c2075')}{' '}
                    </Button>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  {(['width', 'height'] as const).map((dimension) => (
                    <Field key={dimension} data-invalid={!!form.formState.errors[dimension]}>
                      <FieldLabel htmlFor={`native-${dimension}`}>
                        {dimension === 'width'
                          ? translateUi('width_3019947b')
                          : translateUi('height_bfe2eca4')}
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
                      <p className="text-sm font-medium">
                        {translateUi('source_element_order_70e4c46c')}
                      </p>
                      {order.isPending && view.sourceSceneSha256 ? (
                        <p role="status" className="text-xs text-muted-foreground">
                          {' '}
                          {translateUi('loading_saved_element_order_7a181f3b')}{' '}
                        </p>
                      ) : null}
                      {order.isError ? (
                        <p role="status" className="text-xs text-muted-foreground">
                          {' '}
                          {translateUi('element_order_is_unavailable_for_th_d81c1b5e')}{' '}
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
                          {' '}
                          {translateUi('earlier_elements_come_first_in_the__fed6aead')}{' '}
                        </FieldDescription>
                      ) : null}
                    </div>
                  )}
                />
                <FieldDescription>
                  {' '}
                  {translateUi('saving_compiles_the_original_source_147768c1')}{' '}
                </FieldDescription>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">
                    {saving
                      ? translateUi('compiling_and_saving_fa53658a')
                      : translateUi('save_variant_dd7b39f1')}
                  </Button>
                  <Button type="button" variant="outline" disabled={!dirty} onClick={discard}>
                    {' '}
                    {translateUi('discard_changes_f9bfa3dc')}{' '}
                  </Button>
                </div>
              </FieldGroup>
            </fieldset>
          </form>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{translateUi('variant_was_not_saved_4eb2b1a5')}</AlertTitle>
              <AlertDescription>
                {error} {translateUi('your_changes_are_still_here_7cc54870')}
              </AlertDescription>
            </Alert>
          ) : null}
          {blocked.length ? (
            <details className="text-xs text-muted-foreground">
              <summary>
                {translateUi('source_capability_limits_a5f787ac')}
                {blocked.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {blocked.map((capability, index) => (
                  <li key={`${capability.nodeId}:${capability.operation}:${index}`}>
                    {capability.operation}:{' '}
                    {capability.reason ??
                      (capability.state === 'editable'
                        ? translateUi('recompile_this_source_to_expose_its_3bc6c12e')
                        : capability.state)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {' '}
            {translateUi('this_inspector_exposes_copy_viewpor_364ab636')}{' '}
          </p>
          <Panel title={translateUi('variants_and_revisions_b7baa6d5')} bodyClassName="p-0">
            {historyError ? (
              <Alert variant="destructive">
                <AlertTitle>{translateUi('revision_history_unavailable_4b08a875')}</AlertTitle>
                <AlertDescription>
                  {problem(historyError)}{' '}
                  <Button variant="outline" size="sm" onClick={reloadHistory}>
                    {' '}
                    {translateUi('retry_revisions_95e8bf97')}{' '}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            <ul
              className="divide-y divide-border text-xs"
              aria-label={translateUi('native_variants_731bc86c')}
            >
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
                            {' '}
                            {translateUi('revision_2e516d68')} {revision.number}
                            {revision.id === item.draftHeadRevisionId
                              ? translateUi('latest_7c912ed3')
                              : ''}
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
