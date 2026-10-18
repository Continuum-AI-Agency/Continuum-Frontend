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
  const form = useForm<z.infer<typeof notesSchema>>({
    resolver: zodResolver(notesSchema),
    defaultValues: { notes },
  });
  return (
    <form onSubmit={form.handleSubmit((values) => onSave(values.notes))}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="presentation-notes">Speaker notes</FieldLabel>
          <Textarea id="presentation-notes" rows={4} disabled={busy} {...form.register('notes')} />
        </Field>
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          Apply notes
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
  const form = useForm<z.infer<typeof titleSchema>>({
    resolver: zodResolver(titleSchema),
    defaultValues: { title },
  });
  return (
    <form
      className="flex min-w-0 items-center gap-2"
      onSubmit={form.handleSubmit((values) => onSave(values.title))}
    >
      <Input aria-label="Presentation title" disabled={busy} {...form.register('title')} />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        Rename
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
              {item.locked ? ' · locked' : ''}
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
          <ArrowLeft data-icon="inline-start" />
          Templates
        </Button>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (query.isError || !document || !query.data)
    return (
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          Templates
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Presentation could not be opened</AlertTitle>
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : 'The template parser has not returned a presentation document yet.'}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Retry
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
            title: `Slide ${document.slides.length + 1}`,
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
      aria-label="Presentation workspace"
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
          <ArrowLeft data-icon="inline-start" />
          Templates
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
          <Presentation data-icon="inline-start" />
          Present
        </Button>
        <Pill>{busy ? 'Working…' : dirty ? 'Unsaved changes' : 'Saved'}</Pill>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !(editor.canUndoLocal || envelope.history?.canUndo)}
          onClick={() => void editor.history('undo')}
        >
          <Undo2 data-icon="inline-start" />
          Undo
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !(editor.canRedoLocal || (!dirty && envelope.history?.canRedo))}
          onClick={() => void editor.history('redo')}
        >
          <Redo2 data-icon="inline-start" />
          Redo
        </Button>
        <Button size="sm" disabled={busy || !dirty} onClick={() => void editor.save()}>
          <Save data-icon="inline-start" />
          Save
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
          <AlertTitle>Presentation changes need attention</AlertTitle>
          <AlertDescription>
            {error}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setError(null)}>
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setReloadOpen(true)}
              >
                Reload saved revision
              </Button>
              {dirty ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void editor.save()}
                >
                  Retry save
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <AlertDialog open={reloadOpen} onOpenChange={setReloadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load the saved presentation?</AlertDialogTitle>
            <AlertDialogDescription>
              This discards unsaved changes in this workspace and loads the latest saved revision.
              Your original source remains preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={async () => {
                editor.discard();
                await query.refetch();
                setReloadOpen(false);
              }}
            >
              Discard local changes and reload
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {document.diagnostics.length ? (
        <Alert variant={blocked ? 'destructive' : 'default'}>
          <AlertTitle>
            {blocked ? 'Resolve import issues before export' : 'Import notes'}
          </AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {document.diagnostics.map((item, index) => (
                <li key={`${item.code}:${index}`}>
                  {item.slideId
                    ? `${document.slides.find((slide) => slide.id === item.slideId)?.title || 'Slide'}: `
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
                        Select affected object
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
                        Remove affected object
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
          aria-label="Slides"
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
                aria-label={`Open slide ${index + 1}: ${item.title}`}
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
                  aria-label={`Select slide ${index + 1} for variants`}
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
                  Select slide {index + 1} for variants
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
            <Plus data-icon="inline-start" />
            Add slide
          </Button>
        </aside>
        <div className="flex min-w-0 flex-col gap-3">
          <div role="toolbar" aria-label="Slide tools" className="flex flex-wrap gap-1">
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
              <Copy data-icon="inline-start" />
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Move slide earlier"
              disabled={busy || !slide || document.slides[0]?.id === slide.id}
              onClick={() => changeSlideOrder(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Move slide later"
              disabled={busy || !slide || document.slides.at(-1)?.id === slide.id}
              onClick={() => changeSlideOrder(1)}
            >
              <ArrowDown />
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Delete slide"
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
                <SelectTrigger aria-label="Slide layout">
                  <SelectValue
                    items={Object.fromEntries([
                      ['none', 'Blank'],
                      ...document.layouts.map((item) => [item.id, item.name]),
                    ])}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">Blank</SelectItem>
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
              aria-label="Add slide image"
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
                  setError(
                    reason instanceof Error ? reason.message : 'The image could not be added.',
                  );
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !slide || !editable}
              onClick={() => imageInput.current?.click()}
            >
              <Plus data-icon="inline-start" />
              Image
            </Button>
            {(['text', 'shape', 'table', 'chart'] as const).map((kind) => (
              <Button
                key={kind}
                size="sm"
                variant="outline"
                disabled={busy || !slide || !editable}
                aria-label={`Add ${kind}`}
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
            <p className="text-sm text-muted-foreground">Add a slide to start authoring.</p>
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
                <Group data-icon="inline-start" />
                Group
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
                <Ungroup data-icon="inline-start" />
                Ungroup
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
                <SelectTrigger aria-label="Align objects">
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
                Bring forward
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
                Send back
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
                <Trash2 data-icon="inline-start" />
                Delete object
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
          aria-label="Presentation inspector"
          className="min-w-0 lg:max-h-[75vh] lg:overflow-y-auto"
        >
          <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
            <TabsList className="w-full">
              <TabsTrigger value="object">Edit</TabsTrigger>
              <TabsTrigger value="agent">Agent</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
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
                  Select an object on the slide to edit its content, position, style, or reusable
                  field. Shift-click to select several objects.
                </p>
              )}
              {slide ? (
                <section aria-label="Slide objects">
                  <h3 className="mb-2 text-sm font-medium">Objects</h3>
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
                  Save your presentation before reviewing a new source revision.
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
                <dt>Source</dt>
                <dd className="break-all">{sourceName}</dd>
                <dt>Revision</dt>
                <dd className="font-mono tabular-nums">{envelope.draftRevision}</dd>
                <dt>Engine</dt>
                <dd className="break-all font-mono">{document.engineVersion}</dd>
              </dl>
              {dirty ? (
                <p className="text-xs text-muted-foreground">
                  Unsaved edits remain local until you save. Undo can restore each edit.
                </p>
              ) : null}
              <ol className="flex flex-col gap-3">
                {envelope.history?.entries.map((item) => (
                  <li key={item.revision} className="flex flex-col gap-1 text-xs">
                    <span className="font-medium">
                      Revision {item.revision} · {item.summary}
                    </span>
                    <time className="text-muted-foreground" dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString()}
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
