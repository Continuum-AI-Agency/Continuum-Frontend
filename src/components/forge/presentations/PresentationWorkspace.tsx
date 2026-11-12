'use client';

import {
  type PresentationCommand,
  type PresentationObject,
  type TemplateSourceSummary,
  templateDisplayName,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Group,
  Plus,
  Presentation,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Ungroup,
} from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { LayerDraftChange } from '@/components/forge/layerDraft';
import { SourceRebindPanel } from '@/components/forge/SourceRebindPanel';
import { Pill } from '@/components/kibo-ui/pill';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { useValidationErrorMap } from '@/i18n/validation';
import { cn } from '@/lib/utils';
import { PresentationAgentPanel } from './PresentationAgentPanel';
import { PresentationCanvas } from './PresentationCanvas';
import { PresentationExportPanel } from './PresentationExportPanel';
import { PresentationFontMapping } from './PresentationFontMapping';
import { PresentationInspector } from './PresentationInspector';
import { PresentationViewer } from './PresentationViewer';
import { readPresentationImage } from './presentationImageFile';
import { usePresentationDocument } from './usePresentationDocument';

const notesSchema = z.object({ notes: z.string().max(100_000) });
function NotesEditor({
  notes,
  busy,
  onSave,
}: {
  notes: string;
  busy: boolean;
  onSave: (notes: string) => void;
}) {
  const validationErrorMap = useValidationErrorMap();

  const translateUi = useUiTranslations('forge');

  const form = useForm<z.infer<typeof notesSchema>>({
    resolver: zodResolver(notesSchema, { error: validationErrorMap }),
    defaultValues: { notes },
  });
  return (
    <form onSubmit={form.handleSubmit((values) => onSave(values.notes))}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="presentation-notes">
            {translateUi('speaker_notes_29e09472')}
          </FieldLabel>
          <Textarea id="presentation-notes" rows={4} disabled={busy} {...form.register('notes')} />
        </Field>
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {' '}
          {translateUi('apply_notes_638f8785')}{' '}
        </Button>
      </FieldGroup>
    </form>
  );
}

const titleSchema = z.object({ title: z.string().trim().min(1).max(2000) });
function TitleEditor({
  title,
  busy,
  onSave,
}: {
  title: string;
  busy: boolean;
  onSave: (title: string) => void;
}) {
  const validationErrorMap = useValidationErrorMap();

  const translateUi = useUiTranslations('forge');

  const form = useForm<z.infer<typeof titleSchema>>({
    resolver: zodResolver(titleSchema, { error: validationErrorMap }),
    defaultValues: { title },
  });
  return (
    <form
      className="flex min-w-0 items-center gap-2"
      onSubmit={form.handleSubmit((values) => onSave(values.title))}
    >
      <Input
        aria-label={translateUi('presentation_title_0fc10a19')}
        disabled={busy}
        {...form.register('title')}
      />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {' '}
        {translateUi('rename_3064d79a')}{' '}
      </Button>
    </form>
  );
}

function findObject(objects: PresentationObject[], id: string): PresentationObject | undefined {
  for (const object of objects) {
    if (object.id === id) return object;
    const child = object.children && findObject(object.children, id);
    if (child) return child;
  }
}

function ObjectTree({
  objects,
  selectedIds,
  onSelect,
}: {
  objects: PresentationObject[];
  selectedIds: string[];
  onSelect: (id: string, extend: boolean) => void;
}) {
  const translateUi = useUiTranslations('forge');

  return (
    <ul className="flex flex-col gap-1">
      {objects.map((item) => (
        <li key={item.id}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            data-object-id={item.id}
            aria-pressed={selectedIds.includes(item.id)}
            onClick={(event) => onSelect(item.id, event.shiftKey || event.ctrlKey || event.metaKey)}
          >
            <span className="truncate">
              {item.name || item.kind}
              {item.locked ? translateUi('locked_d8c626df') : ''}
            </span>
          </Button>
          {item.children?.length ? (
            <div className="pl-3">
              <ObjectTree objects={item.children} selectedIds={selectedIds} onSelect={onSelect} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function PresentationWorkspace({
  brandId,
  source,
  onBack,
  onDraftChange,
  onChanged,
  onOpenVariant,
  revisionFile,
  onRevisionTaken,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  onBack: () => void;
  onDraftChange?: LayerDraftChange;
  onChanged: () => Promise<void>;
  onOpenVariant?: (assetId: string) => void;
  revisionFile?: File;
  onRevisionTaken?: () => void;
}) {
  const displayLocale = useUiLocale();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

  const sourceName = source.displayName ?? templateDisplayName(source.parse?.filename);
  const scope = useMemo(
    () => ({ brandId, assetId: source.assetId, baseVersionId: source.versionId }),
    [brandId, source.assetId, source.versionId],
  );
  const editor = usePresentationDocument(scope, onDraftChange);
  const { document, engine, query, busy, dirty, error, setError, perform } = editor;
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [variantSlideIds, setVariantSlideIds] = useState<string[]>([]);
  const [tab, setTab] = useState(revisionFile ? 'history' : 'object');
  const [reloadOpen, setReloadOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    if (revisionFile) setTab('history');
  }, [revisionFile]);
  const imageInput = useRef<HTMLInputElement>(null);
  const slide = document?.slides.find((item) => item.id === activeSlideId) ?? document?.slides[0];
  const object =
    slide && selectedIds.length === 1 ? findObject(slide.objects, selectedIds[0]) : undefined;
  const blocked = Boolean(document?.diagnostics.some((item) => item.severity === 'error'));
  const chooseSlide = (id: string) => {
    setActiveSlideId(id);
    setSelectedIds([]);
  };
  const selectObject = (id: string, extend: boolean) =>
    setSelectedIds((current) =>
      extend
        ? current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id]
        : [id],
    );
  const command = (value: PresentationCommand) => {
    void perform([value]);
  };
  const selectNext = async (values: PresentationCommand[], id?: string) => {
    if (await perform(values)) {
      setSelectedIds(id ? [id] : []);
    }
  };
  const addObject = (kind: 'text' | 'shape' | 'table' | 'chart') => {
    if (!slide) return;
    const id = crypto.randomUUID();
    const object: PresentationObject = {
      id,
      kind,
      name: kind === 'text' ? 'Text' : kind[0].toUpperCase() + kind.slice(1),
      bounds: { x: 40, y: 40, width: 300, height: kind === 'text' ? 80 : 180, rotation: 0 },
      ...(kind === 'text'
        ? { text: 'Your text', style: { fontSize: 24, color: '#111111' } }
        : kind === 'shape'
          ? { data: { shapeType: 'rect' }, style: { fill: '#e5e7eb' } }
          : kind === 'table'
            ? {
                data: {
                  cells: [
                    ['Heading', 'Value'],
                    ['First', '100'],
                    ['Second', '200'],
                  ],
                },
              }
            : {
                data: {
                  chartType: 'bar',
                  categories: ['First', 'Second'],
                  series: [{ name: 'Series', values: [100, 200] }],
                },
              }),
    };
    void selectNext([{ type: 'object.add', slideId: slide.id, object }], id);
  };

  if (query.isPending)
    return (
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" /> {translateUi('templates_56b564b7')}{' '}
        </Button>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (query.isError || !document || !query.data)
    return (
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" /> {translateUi('templates_56b564b7')}{' '}
        </Button>
        <Alert variant="destructive">
          <AlertTitle>{translateUi('presentation_could_not_be_opened_486869d8')}</AlertTitle>
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : translateUi('the_template_parser_has_not_returne_0abcdbd8')}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {' '}
              {translateUi('retry_942087cc')}{' '}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  const envelope = query.data;
  const editable = document.capabilities.apply !== false && engine !== null;
  const changeSlideOrder = (offset: number) => {
    if (!slide) return;
    const ids = document.slides.map((item) => item.id);
    const index = ids.indexOf(slide.id);
    const other = index + offset;
    if (other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other], ids[index]];
    command({ type: 'slide.reorder', slideIds: ids });
  };
  const addSlide = async () => {
    const id = crypto.randomUUID();
    if (
      await perform([
        {
          type: 'slide.add',
          slide: {
            id,
            title: translateUi('slide_value0_146d308d', {
              value0: String(document.slides.length + 1),
            }),
            layoutId: null,
            notes: '',
            objects: [],
          },
        },
      ])
    )
      chooseSlide(id);
  };

  return (
    <section
      aria-label={translateUi('presentation_workspace_39a6da39')}
      className="flex min-w-0 flex-col gap-4"
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        if (event.key.toLowerCase() === 's') {
          event.preventDefault();
          void editor.save();
        }
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, [contenteditable="true"]')) return;
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          void editor.history(event.shiftKey ? 'redo' : 'undo');
        }
      }}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" /> {translateUi('templates_56b564b7')}{' '}
        </Button>
        <h2 className="mr-auto min-w-0 truncate text-lg font-medium">
          {document.title || sourceName}
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !slide || blocked}
          onClick={() => setPresenting(true)}
        >
          <Presentation data-icon="inline-start" /> {translateUi('present_43f9b89c')}{' '}
        </Button>
        <Pill>
          {busy
            ? translateUi('working_5474eef8')
            : dirty
              ? translateUi('unsaved_changes_a710c2b9')
              : translateUi('saved_b5c120b3')}
        </Pill>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !(editor.canUndoLocal || envelope.history?.canUndo)}
          onClick={() => void editor.history('undo')}
        >
          <Undo2 data-icon="inline-start" /> {translateUi('undo_a8283ade')}{' '}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !(editor.canRedoLocal || (!dirty && envelope.history?.canRedo))}
          onClick={() => void editor.history('redo')}
        >
          <Redo2 data-icon="inline-start" /> {translateUi('redo_74273989')}{' '}
        </Button>
        <Button size="sm" disabled={busy || !dirty} onClick={() => void editor.save()}>
          <Save data-icon="inline-start" /> {translateUi('save_1509f561')}{' '}
        </Button>
      </header>
      {presenting ? (
        <PresentationViewer
          document={document}
          engine={engine}
          initialSlideId={slide?.id}
          onClose={() => setPresenting(false)}
        />
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{translateUi('presentation_changes_need_attention_56f7212b')}</AlertTitle>
          <AlertDescription>
            {error}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setError(null)}>
                {' '}
                {translateUi('dismiss_48845bff')}{' '}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setReloadOpen(true)}
              >
                {' '}
                {translateUi('reload_saved_revision_90fb6eb1')}{' '}
              </Button>
              {dirty ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void editor.save()}
                >
                  {' '}
                  {translateUi('retry_save_71fdfa79')}{' '}
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <AlertDialog open={reloadOpen} onOpenChange={setReloadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translateUi('load_the_saved_presentation_8d1dd55b')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {' '}
              {translateUi('this_discards_unsaved_changes_in_th_3eb3a05a')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('keep_editing_e76fd2ad')}</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={async () => {
                editor.discard();
                await query.refetch();
                setReloadOpen(false);
              }}
            >
              {' '}
              {translateUi('discard_local_changes_and_reload_9cda1d54')}{' '}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {document.diagnostics.length ? (
        <Alert variant={blocked ? 'destructive' : 'default'}>
          <AlertTitle>
            {blocked
              ? translateUi('resolve_import_issues_before_export_87d223d8')
              : translateUi('import_notes_f5544a89')}
          </AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {document.diagnostics.map((item, index) => (
                <li key={`${item.code}:${index}`}>
                  {item.slideId
                    ? `${document.slides.find((slide) => slide.id === item.slideId)?.title || translateUi('slide_6bb4c117')}: `
                    : ''}
                  {item.message}
                  {item.slideId && item.objectId ? (
                    <span className="ml-2 inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (!item.slideId || !item.objectId) return;
                          chooseSlide(item.slideId);
                          setSelectedIds([item.objectId]);
                          setTab('object');
                        }}
                      >
                        {' '}
                        {translateUi('select_affected_object_cb7afb93')}{' '}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (item.slideId && item.objectId)
                            command({
                              type: 'object.remove',
                              slideId: item.slideId,
                              objectId: item.objectId,
                            });
                        }}
                      >
                        {' '}
                        {translateUi('remove_affected_object_ce2dac26')}{' '}
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {document.diagnostics.some((item) => /font/i.test(item.code)) ? (
              <PresentationFontMapping busy={busy} onCommands={perform} />
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[176px_minmax(0,1fr)_300px]">
        <aside
          aria-label={translateUi('slides_a0ffe381')}
          className="flex gap-2 overflow-x-auto lg:max-h-[75vh] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
        >
          {document.slides.map((item, index) => (
            <div key={item.id} className="flex w-40 shrink-0 flex-col gap-1 lg:w-full">
              <Button
                variant="outline"
                className={cn(
                  'h-auto flex-col items-stretch p-1.5',
                  slide?.id === item.id && 'border-primary',
                )}
                onClick={() => chooseSlide(item.id)}
                aria-label={translateUi('open_slide_value0_value1_d4a03fbd', {
                  value0: String(index + 1),
                  value1: String(item.title),
                })}
                aria-current={slide?.id === item.id ? 'true' : undefined}
              >
                <PresentationCanvas
                  document={document}
                  slideId={item.id}
                  engine={engine}
                  thumbnail
                />
                <span className="flex gap-1 overflow-hidden text-left text-xs">
                  <span className="font-mono tabular-nums">{index + 1}.</span>
                  <span className="truncate">{item.title}</span>
                </span>
              </Button>
              <Field orientation="horizontal">
                <Checkbox
                  id={`variant-${item.id}`}
                  aria-label={translateUi('select_slide_value0_for_variants_1975347e', {
                    value0: String(index + 1),
                  })}
                  checked={variantSlideIds.includes(item.id)}
                  onCheckedChange={(checked) =>
                    setVariantSlideIds((current) =>
                      checked
                        ? [...current.filter((id) => id !== item.id), item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                <FieldLabel htmlFor={`variant-${item.id}`} className="text-xs">
                  {' '}
                  {translateUi('select_slide_68bf2dfe')} {index + 1}{' '}
                  {translateUi('for_variants_2aa8bba2')}{' '}
                </FieldLabel>
              </Field>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !editable}
            onClick={() => void addSlide()}
          >
            <Plus data-icon="inline-start" /> {translateUi('add_slide_1115e5d9')}{' '}
          </Button>
        </aside>
        <div className="flex min-w-0 flex-col gap-3">
          <div
            role="toolbar"
            aria-label={translateUi('slide_tools_07ca7610')}
            className="flex flex-wrap gap-1"
          >
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !slide || !editable}
              onClick={async () => {
                if (!slide) return;
                const id = crypto.randomUUID();
                if (await perform([{ type: 'slide.duplicate', slideId: slide.id, newSlideId: id }]))
                  chooseSlide(id);
              }}
            >
              <Copy data-icon="inline-start" /> {translateUi('duplicate_02cdaabf')}{' '}
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={translateUi('move_slide_earlier_12152778')}
              disabled={busy || !slide || document.slides[0]?.id === slide.id}
              onClick={() => changeSlideOrder(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={translateUi('move_slide_later_45c59189')}
              disabled={busy || !slide || document.slides.at(-1)?.id === slide.id}
              onClick={() => changeSlideOrder(1)}
            >
              <ArrowDown />
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={translateUi('delete_slide_931e87ae')}
              disabled={busy || !slide || document.slides.length <= 1}
              onClick={() => slide && command({ type: 'slide.remove', slideId: slide.id })}
            >
              <Trash2 />
            </Button>
            {slide && document.layouts?.length ? (
              <Select
                value={slide.layoutId || 'none'}
                onValueChange={(layoutId) =>
                  command({
                    type: 'slide.layout',
                    slideId: slide.id,
                    layoutId: layoutId === 'none' ? null : layoutId,
                  })
                }
                disabled={busy}
              >
                <SelectTrigger aria-label={translateUi('slide_layout_501bb09a')}>
                  <SelectValue
                    items={Object.fromEntries([
                      ['none', 'Blank'],
                      ...document.layouts.map((item) => [item.id, item.name]),
                    ])}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{translateUi('blank_2c3d371c')}</SelectItem>
                    {document.layouts.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1">
            <input
              className="sr-only"
              ref={imageInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              aria-label={translateUi('add_slide_image_59b4d467')}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file || !slide) return;
                try {
                  const data = await readPresentationImage(file);
                  const id = crypto.randomUUID();
                  await selectNext(
                    [
                      {
                        type: 'object.add',
                        slideId: slide.id,
                        object: {
                          id,
                          kind: 'image',
                          name: file.name,
                          bounds: { x: 40, y: 40, width: 300, height: 180, rotation: 0 },
                          data,
                        },
                      },
                    ],
                    id,
                  );
                } catch (reason) {
                  setError(uiErrorText(reason));
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !slide || !editable}
              onClick={() => imageInput.current?.click()}
            >
              <Plus data-icon="inline-start" /> {translateUi('image_1aa4cb0b')}{' '}
            </Button>
            {(['text', 'shape', 'table', 'chart'] as const).map((kind) => (
              <Button
                key={kind}
                size="sm"
                variant="outline"
                disabled={busy || !slide || !editable}
                aria-label={translateUi('add_value0_641cf336', { value0: String(kind) })}
                onClick={() => addObject(kind)}
              >
                <Plus data-icon="inline-start" />
                {kind[0].toUpperCase() + kind.slice(1)}
              </Button>
            ))}
          </div>
          {slide ? (
            <PresentationCanvas
              document={document}
              slideId={slide.id}
              engine={engine}
              selectedIds={selectedIds}
              onSelect={selectObject}
              onCommand={command}
              disabled={busy || !editable}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {translateUi('add_a_slide_to_start_authoring_73496c64')}
            </p>
          )}
          {slide ? (
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  selectedIds.length < 2 ||
                  selectedIds.some((id) => !slide.objects.some((item) => item.id === id))
                }
                onClick={() =>
                  void selectNext([
                    {
                      type: 'object.group',
                      slideId: slide.id,
                      objectIds: selectedIds,
                      newObjectId: crypto.randomUUID(),
                    },
                  ])
                }
              >
                <Group data-icon="inline-start" /> {translateUi('group_34ca0e76')}{' '}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || object?.kind !== 'group'}
                onClick={() =>
                  object &&
                  void selectNext([
                    { type: 'object.ungroup', slideId: slide.id, objectId: object.id },
                  ])
                }
              >
                <Ungroup data-icon="inline-start" /> {translateUi('ungroup_b57ef478')}{' '}
              </Button>
              <Select<'alignment' | 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'>
                value="alignment"
                onValueChange={(alignment) => {
                  if (alignment === 'alignment') return;
                  command({
                    type: 'object.align',
                    slideId: slide.id,
                    objectIds: selectedIds,
                    alignment,
                  });
                }}
                disabled={
                  busy ||
                  selectedIds.length < 2 ||
                  selectedIds.some((id) => !slide.objects.some((item) => item.id === id))
                }
              >
                <SelectTrigger aria-label={translateUi('align_objects_b4085bf0')}>
                  <SelectValue
                    items={{
                      alignment: 'Align objects',
                      left: 'Left',
                      center: 'Center',
                      right: 'Right',
                      top: 'Top',
                      middle: 'Middle',
                      bottom: 'Bottom',
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          {value[0].toUpperCase() + value.slice(1)}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  selectedIds.length === 0 ||
                  selectedIds.some((id) => !slide.objects.some((item) => item.id === id))
                }
                onClick={() =>
                  command({
                    type: 'object.order',
                    slideId: slide.id,
                    objectIds: [
                      ...slide.objects
                        .map((item) => item.id)
                        .filter((id) => !selectedIds.includes(id)),
                      ...selectedIds,
                    ],
                  })
                }
              >
                {' '}
                {translateUi('bring_forward_2a3d681d')}{' '}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  selectedIds.length === 0 ||
                  selectedIds.some((id) => !slide.objects.some((item) => item.id === id))
                }
                onClick={() =>
                  command({
                    type: 'object.order',
                    slideId: slide.id,
                    objectIds: [
                      ...selectedIds,
                      ...slide.objects
                        .map((item) => item.id)
                        .filter((id) => !selectedIds.includes(id)),
                    ],
                  })
                }
              >
                {' '}
                {translateUi('send_back_a7b87f68')}{' '}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || selectedIds.length === 0}
                onClick={() =>
                  void selectNext(
                    selectedIds.map((objectId) => ({
                      type: 'object.remove',
                      slideId: slide.id,
                      objectId,
                    })),
                  )
                }
              >
                <Trash2 data-icon="inline-start" /> {translateUi('delete_object_0b1bbb00')}{' '}
              </Button>
            </div>
          ) : null}
          {slide ? (
            <NotesEditor
              key={`${slide.id}:${document.revision}`}
              notes={slide.notes}
              busy={busy}
              onSave={(notes) => command({ type: 'slide.notes', slideId: slide.id, notes })}
            />
          ) : null}
        </div>
        <aside
          aria-label={translateUi('presentation_inspector_ad4b1736')}
          className="min-w-0 lg:max-h-[75vh] lg:overflow-y-auto"
        >
          <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
            <TabsList className="w-full">
              <TabsTrigger value="object">{translateUi('edit_464c4ffd')}</TabsTrigger>
              <TabsTrigger value="agent">{translateUi('agent_11b39c93')}</TabsTrigger>
              <TabsTrigger value="export">{translateUi('export_36648955')}</TabsTrigger>
              <TabsTrigger value="history">{translateUi('history_0e769600')}</TabsTrigger>
            </TabsList>
            <TabsContent value="object" className="flex flex-col gap-4 pt-3">
              {object && slide ? (
                <PresentationInspector
                  key={`${object.id}:${document.revision}`}
                  document={document}
                  slideId={slide.id}
                  object={object}
                  insideGroup={!slide.objects.some((item) => item.id === object.id)}
                  busy={busy}
                  onCommands={perform}
                  onError={setError}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {' '}
                  {translateUi('select_an_object_on_the_slide_to_ed_28898628')}{' '}
                </p>
              )}
              {slide ? (
                <section aria-label={translateUi('slide_objects_029460ce')}>
                  <h3 className="mb-2 text-sm font-medium">{translateUi('objects_de5236ee')}</h3>
                  <ObjectTree
                    objects={slide.objects}
                    selectedIds={selectedIds}
                    onSelect={selectObject}
                  />
                </section>
              ) : null}
            </TabsContent>
            <TabsContent value="agent" className="pt-3">
              <PresentationAgentPanel
                scope={scope}
                envelope={envelope}
                document={document}
                engine={engine}
                slideId={slide?.id || ''}
                selectedSlideIds={variantSlideIds.filter((id) =>
                  document.slides.some((item) => item.id === id),
                )}
                dirty={dirty}
                save={editor.save}
                adopt={editor.adopt}
                onError={setError}
                onChanged={onChanged}
                onOpenVariant={onOpenVariant}
                onCommands={perform}
                editorBusy={busy}
              />
            </TabsContent>
            <TabsContent value="export" className="pt-3">
              <PresentationExportPanel
                scope={scope}
                revision={envelope.draftRevision}
                title={document.title}
                dirty={dirty}
                blocked={blocked}
                save={editor.save}
                onError={setError}
              />
            </TabsContent>
            <TabsContent value="history" className="flex flex-col gap-4 pt-3">
              {dirty ? (
                <p className="text-sm text-muted-foreground">
                  {' '}
                  {translateUi('save_your_presentation_before_revie_a43a3133')}{' '}
                </p>
              ) : tab === 'history' ? (
                <SourceRebindPanel
                  brandId={brandId}
                  assetId={source.assetId}
                  expectedVersionId={source.versionId}
                  sourceFamily="presentation"
                  initialFile={revisionFile}
                  onInitialFileTaken={onRevisionTaken}
                  onConfirmed={onChanged}
                />
              ) : null}
              <TitleEditor
                key={document.title}
                title={document.title}
                busy={busy}
                onSave={(title) => command({ type: 'title', title })}
              />
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-xs">
                <dt>{translateUi('source_0e570ca6')}</dt>
                <dd className="break-all">{sourceName}</dd>
                <dt>{translateUi('revision_2e516d68')}</dt>
                <dd className="font-mono tabular-nums">{envelope.draftRevision}</dd>
                <dt>{translateUi('engine_8e75ebbd')}</dt>
                <dd className="break-all font-mono">{document.engineVersion}</dd>
              </dl>
              {dirty ? (
                <p className="text-xs text-muted-foreground">
                  {' '}
                  {translateUi('unsaved_edits_remain_local_until_yo_743679de')}{' '}
                </p>
              ) : null}
              <ol className="flex flex-col gap-3">
                {envelope.history?.entries.map((item) => (
                  <li key={item.revision} className="flex flex-col gap-1 text-xs">
                    <span className="font-medium">
                      {' '}
                      {translateUi('revision_2e516d68')} {item.revision} · {item.summary}
                    </span>
                    <time className="text-muted-foreground" dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString(displayLocale)}
                    </time>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </section>
  );
}
