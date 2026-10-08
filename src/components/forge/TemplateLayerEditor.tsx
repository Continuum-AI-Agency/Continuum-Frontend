'use client';

// The Layers tab editor: a template's layer stack, a live layout preview and the selected layer's
// inspector, in one bounded workspace whose panes scroll on their own. Edits stay temporary until
// saved, and a save never rewrites the golden source: on the original upload it forks a new
// variant; on a variant it writes that variant's next revision (or forks another, if asked).
//
// Loading is staged so nothing waits on what it does not need. The shell paints at once from the
// parse the page already holds; the layer list and the default comp's scene load in parallel,
// each stored per source version so only a first open reaches the forge; fields, fonts and the
// variants list load when they are opened or needed. An edit shows in the preview immediately
// (layerPreviewSvg.ts) and the forge's composed preview replaces that guess after a pause.

import {
  saveTemplateLayerVariantRequestSchema,
  type TemplateEditableLayer,
  type TemplateLayerEdit,
  type TemplateLayerSaveTarget,
  type TemplatePreview,
  templateLayerPreviewRequestSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, GitFork, Loader2, Lock, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DesignLayersPanel } from '@/components/forge/DesignLayersPanel';
import { previewMarkup } from '@/components/forge/layerPreviewSvg';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { TemplateLayerInspector } from '@/components/forge/TemplateLayerInspector';
import { type StackRow, TemplateLayerList } from '@/components/forge/TemplateLayerList';
import { TemplateLayerPreview } from '@/components/forge/TemplateLayerPreview';
import { TemplateWireframe } from '@/components/forge/TemplateWireframe';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import {
  editableTemplateFonts,
  fetchTemplateLayerInventory,
  fetchTemplateLayerScene,
  fetchTemplateLayerVariants,
  fetchTemplateVariables,
  previewTemplateLayers,
  saveTemplateLayerVariant,
} from '@/lib/library/templateSources';

type Edits = Record<number, TemplateLayerEdit>;
type Changes = { edits: TemplateLayerEdit[]; orders: { compId: number; layerIds: number[] }[] };

const NO_CHANGES: Changes = { edits: [], orders: [] };
/** A composed preview asks the forge to rewrite the file, so it waits for a pause. */
const PREVIEW_DELAY_MS = 800;
const EDIT_FIELDS = [
  'fontSize',
  'font',
  'visible',
  'position',
  'rotation',
  'scale',
  'opacity',
] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hasChanges = (c: Changes) => c.edits.length > 0 || c.orders.length > 0;
const byLayer = (list: TemplateLayerEdit[]): Edits =>
  Object.fromEntries(list.map((e) => [e.layerId, e]));

/** A comp's stack, front first (index 0 is the top). */
export function stackOf(layers: readonly TemplateEditableLayer[], compId: number | null) {
  return layers
    .filter((l) => l.compId === compId)
    .sort((a, b) => a.index - b.index)
    .map((l) => l.layerId);
}

/**
 * The pending edits after one change to `layer`. A value equal to the file's drops out, and a
 * layer with nothing left is no longer edited. Visibility on a layer whose Show field is shared
 * across formats moves every layer that field drives.
 */
export function applyLayerChange(
  edits: Edits,
  layers: readonly TemplateEditableLayer[],
  layer: TemplateEditableLayer,
  change: Partial<TemplateLayerEdit>,
): Edits {
  const result = { ...edits };
  const targets =
    change.visible !== undefined && layer.visibilitySlotKeys.length
      ? layers.filter((l) =>
          l.visibilitySlotKeys.some((key) => layer.visibilitySlotKeys.includes(key)),
        )
      : [layer];
  for (const target of targets) {
    const next: TemplateLayerEdit = {
      ...edits[target.layerId],
      compId: target.compId,
      layerId: target.layerId,
      ...change,
    };
    for (const key of EDIT_FIELDS)
      if (next[key] !== undefined && same(next[key], target[key])) delete next[key];
    if (EDIT_FIELDS.some((key) => next[key] !== undefined)) result[target.layerId] = next;
    else delete result[target.layerId];
  }
  return result;
}

const nameSchema = z.object({ name: z.string().trim().min(1, 'Name your variant').max(120) });
const Skeleton = ({ className }: { className: string }) => (
  <span aria-hidden className={`block animate-pulse rounded-md bg-muted/70 ${className}`} />
);

export function TemplateLayerEditor({
  brandId,
  assetId,
  versionId,
  name,
  parse,
  active,
  onSaved,
  onOpenVariant,
}: {
  brandId: string;
  assetId: string;
  versionId: string | null;
  name: string;
  /** The parse the page already holds: the shell paints from it before any layer data arrives. */
  parse?: TemplatePreview | null;
  active: boolean;
  onSaved: () => Promise<void>;
  onOpenVariant?: (assetId: string) => void;
}) {
  const [edits, setEdits] = useState<Edits>({});
  const [orders, setOrders] = useState<Record<number, number[]>>({});
  const [exposures, setExposures] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [compId, setCompId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVariant, setSavedVariant] = useState<{ assetId: string; name: string } | null>(null);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: `${name} variant` },
  });

  const changes = useMemo<Changes>(
    () => ({
      edits: Object.values(edits),
      orders: Object.entries(orders).map(([id, layerIds]) => ({ compId: Number(id), layerIds })),
    }),
    [edits, orders],
  );
  const [settled, setSettled] = useState<Changes>(NO_CHANGES);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(changes), hasChanges(changes) ? PREVIEW_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [changes]);

  const ready = active && !!versionId;
  // The layer list and the default comp's scene are asked for together; each is stored per source
  // version, so a source that was parsed here answers both from the database.
  const inventory = useQuery({
    queryKey: ['forge-layer-inventory', brandId, assetId, versionId],
    queryFn: () => fetchTemplateLayerInventory(brandId, assetId, versionId as string),
    enabled: ready,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const scene = useQuery({
    queryKey: ['forge-layer-scene', brandId, assetId, versionId, compId],
    queryFn: () => fetchTemplateLayerScene(brandId, assetId, versionId as string, compId),
    enabled: ready,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const request = (change: Changes) =>
    templateLayerPreviewRequestSchema.parse({
      brandId,
      expectedVersionId: versionId,
      ...(compId ? { compId } : {}),
      ...change,
    });
  const composed = useQuery({
    queryKey: ['forge-layer-preview', brandId, assetId, versionId, compId, settled],
    queryFn: async () => ({
      view: await previewTemplateLayers(assetId, request(settled)),
      changes: settled,
    }),
    enabled: ready && !!inventory.data && hasChanges(settled),
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const layers = inventory.data?.layers ?? [];
  const byId = new Map(layers.map((l) => [l.layerId, l]));
  const shownComp = compId ?? inventory.data?.compId ?? null;
  const comp = inventory.data?.comps.find((c) => c.id === shownComp);
  const fileStack = stackOf(layers, shownComp);
  const stack = (shownComp !== null && orders[shownComp]) || fileStack;
  const firstEditable = (ids: number[]) =>
    ids.find((id) => byId.get(id)?.kind === 'text' && !byId.get(id)?.textReason) ?? ids[0] ?? null;
  const selectedId = selected ?? firstEditable(fileStack);
  const layer = selectedId === null ? undefined : byId.get(selectedId);

  const fields = useQuery({
    queryKey: forgeQueryKeys.templateVariables(brandId, assetId, versionId ?? ''),
    queryFn: () => fetchTemplateVariables(brandId, assetId),
    enabled: ready && fieldsOpen,
  });
  const fonts = useQuery({
    queryKey: ['forge-layer-fonts', brandId],
    queryFn: () => editableTemplateFonts(brandId),
    // Only Bold reads the font inventory.
    enabled: ready && layer?.kind === 'text' && !layer.textReason,
  });
  const variants = useQuery({
    queryKey: ['forge-layer-variants', brandId, assetId],
    queryFn: () => fetchTemplateLayerVariants(brandId, assetId),
    enabled: ready && variantsOpen,
  });

  // What is on screen: the composed preview of the settled edits when there are any and it is for
  // this comp, else the unedited scene — with every edit made since applied on top, at once.
  const composedView =
    hasChanges(settled) && composed.data?.view.compId === shownComp ? composed.data : null;
  const shownScene =
    composedView?.view ??
    (scene.data && (compId === null || scene.data.compId === compId) ? scene.data : null);
  const renderedFor = composedView?.changes ?? NO_CHANGES;
  const markup = useMemo(() => {
    if (!shownScene) return '';
    const sceneComp = shownScene.compId;
    return previewMarkup(shownScene.svg, {
      compId: sceneComp,
      layers,
      rendered: byLayer(renderedFor.edits),
      current: edits,
      renderedOrder:
        renderedFor.orders.find((o) => o.compId === sceneComp)?.layerIds ??
        stackOf(layers, sceneComp),
      order: orders[sceneComp] ?? stackOf(layers, sceneComp),
    });
  }, [shownScene, layers, renderedFor, edits, orders]);

  const query = search.trim().toLowerCase();
  const listed = query
    ? layers
        .filter((l) => `${l.name} ${l.text ?? ''} ${l.comp}`.toLowerCase().includes(query))
        .map((l) => l.layerId)
    : stack;
  const rows: StackRow[] = listed.flatMap((id) => {
    const l = byId.get(id);
    if (!l) return [];
    return [
      {
        id,
        label: l.text || l.name,
        detail: query ? l.comp : l.text && l.text !== l.name ? l.name : undefined,
        kind: l.kind,
        hidden: !(edits[id]?.visible ?? l.visible),
        visibilityLocked: !!l.visibilityReason,
        edited: !!edits[id],
      },
    ];
  });

  const lineage = inventory.data?.lineage;
  const onVariant = lineage?.role === 'variant';
  const dirty = hasChanges(changes) || Object.keys(exposures).length > 0;
  const previewing =
    scene.isFetching || (hasChanges(changes) && (settled !== changes || composed.isFetching));
  const busy = saving || !inventory.data;
  // Until the layer list lands, the shell stands in for it from the parse the page holds.
  const defaultComp = parse?.comps.find((c) => c.isDelivery) ?? parse?.comps[0];
  // A full parse counts the comp's layers; the compact one the page may hold does not.
  const placeholderRows =
    typeof defaultComp?.layerCount === 'number' && defaultComp.layerCount > 0
      ? defaultComp.layerCount
      : 6;

  const edit = (target: TemplateEditableLayer, change: Partial<TemplateLayerEdit>) =>
    setEdits((current) => applyLayerChange(current, layers, target, change));
  const reorder = (order: number[]) => {
    if (shownComp === null) return;
    setOrders((current) => {
      const next = { ...current };
      if (same(order, fileStack)) delete next[shownComp];
      else next[shownComp] = order;
      return next;
    });
  };
  const reset = () => {
    setEdits({});
    setOrders({});
    setExposures({});
    setError(null);
  };
  const save = async (saveTo: TemplateLayerSaveTarget) => {
    if (busy || !dirty) return;
    let variantName: string | undefined;
    if (saveTo === 'new_variant') {
      if (!(await form.trigger('name'))) return;
      variantName = form.getValues('name').trim();
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTemplateLayerVariant(
        assetId,
        saveTemplateLayerVariantRequestSchema.parse({
          ...request(changes),
          saveTo,
          ...(variantName ? { name: variantName } : {}),
          exposures: Object.entries(exposures).map(([slotKey, exposed]) => ({ slotKey, exposed })),
        }),
      );
      reset();
      if (saveTo === 'this_variant') {
        toast.success('Saved to this variant. Build and test render it before publishing.');
        await onSaved();
        return;
      }
      setSavedVariant({ assetId: saved.assetId, name: variantName ?? 'Variant' });
      try {
        await onSaved();
        if (variantsOpen) await variants.refetch();
        onOpenVariant?.(saved.assetId);
      } catch {
        setError('Variant saved. Refresh the template list to open it.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!versionId)
    return (
      <p className="text-xs text-muted-foreground">
        Import and parse the source to edit its layers.
      </p>
    );
  return (
    <>
      <section
        aria-label="Template layer editor"
        className="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-[min(46rem,calc(100dvh-13rem))]"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {!lineage ? <Skeleton className="h-5 w-28 rounded-full" /> : null}
            {lineage?.role === 'golden' ? (
              <Pill variant="warning">
                <Lock className="size-3" aria-hidden /> Golden source
              </Pill>
            ) : null}
            {onVariant ? (
              <Pill variant="violet">
                <GitFork className="size-3" aria-hidden /> Variant
              </Pill>
            ) : null}
            {onVariant && lineage?.parent ? (
              <Button
                size="xs"
                variant="link"
                className="h-auto px-0"
                disabled={!onOpenVariant}
                onClick={() => lineage.parent && onOpenVariant?.(lineage.parent.assetId)}
              >
                of {lineage.parent.name}
              </Button>
            ) : null}
            {lineage ? (
              <p className="text-xs text-muted-foreground">
                {onVariant
                  ? 'Save writes this variant’s next revision.'
                  : 'Edits never change the original upload. Saving creates a variant.'}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {shownScene ? (
              <span
                role="status"
                className="flex items-center gap-1 text-2xs text-muted-foreground"
              >
                {previewing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                {previewing ? 'Updating preview' : 'Preview up to date'}
              </span>
            ) : null}
            <Button size="sm" variant="ghost" disabled={saving || !dirty} onClick={reset}>
              <RotateCcw data-icon="inline-start" aria-hidden /> Reset
            </Button>
          </div>
        </header>

        {error ? (
          <p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)_17rem]">
          <aside className="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
            <div className="flex flex-col gap-2 border-b border-border p-2">
              <Select
                value={String(shownComp ?? '')}
                disabled={!inventory.data}
                onValueChange={(value) => {
                  setCompId(Number(value));
                  setSelected(firstEditable(stackOf(layers, Number(value))));
                }}
              >
                <SelectTrigger size="sm" aria-label="Composition" className="w-full min-w-0">
                  <SelectValue placeholder="Composition">
                    <span className="truncate">{comp?.name ?? defaultComp?.name}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {inventory.data?.comps.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Search layers"
                placeholder="Search text or layer name"
                className="h-8 text-xs"
                disabled={!inventory.data}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 min-h-0 flex-1 overflow-y-auto p-1 lg:max-h-none">
              {inventory.data ? (
                <TemplateLayerList
                  label="Layers"
                  rows={rows}
                  selectedId={selectedId}
                  onSelect={setSelected}
                  onReorder={query || comp?.orderReason ? undefined : reorder}
                  onToggleVisible={(id) => {
                    const target = byId.get(id);
                    if (target) edit(target, { visible: !(edits[id]?.visible ?? target.visible) });
                  }}
                />
              ) : inventory.isError ? (
                <div
                  role="alert"
                  className="flex flex-col items-start gap-2 p-2 text-xs text-destructive"
                >
                  {inventory.error.message}
                  <Button size="xs" variant="outline" onClick={() => void inventory.refetch()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <div
                  role="status"
                  aria-label="Reading template layers…"
                  className="flex flex-col gap-1 p-1"
                >
                  {Array.from({ length: Math.min(placeholderRows, 12) }, (_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              )}
            </div>
            {comp?.orderReason || query ? (
              <p className="border-t border-border p-2 text-2xs text-muted-foreground">
                {query ? 'Clear the search to re-order layers.' : comp?.orderReason}
              </p>
            ) : null}
          </aside>

          <div className="flex min-h-0 flex-col bg-muted/40">
            <div className="relative flex h-72 items-center justify-center p-4 lg:h-auto lg:min-h-0 lg:flex-1">
              {markup ? (
                <TemplateLayerPreview
                  markup={markup}
                  layers={layers}
                  compId={shownScene!.compId}
                  layer={layer?.compId === shownScene!.compId ? layer : undefined}
                  edit={layer ? edits[layer.layerId] : undefined}
                  edits={edits}
                  fonts={fonts.data ?? []}
                  disabled={saving}
                  onSelect={setSelected}
                  onEdit={edit}
                />
              ) : parse && defaultComp ? (
                <TemplateWireframe
                  brandId={brandId}
                  templateKey={null}
                  parse={parse}
                  comp={defaultComp.name}
                  className="size-full animate-pulse rounded-md"
                />
              ) : (
                <Skeleton className="size-full" />
              )}
            </div>
            <p
              id="template-preview-help"
              className="border-t border-border px-3 py-2 text-2xs text-muted-foreground"
            >
              Click a layer for controls. Drag to move; arrow keys nudge, Shift moves 10 px. Edits
              stay temporary until you save.
            </p>
            {scene.isError || composed.isError || shownScene?.warnings.length ? (
              <div className="max-h-24 overflow-y-auto border-t border-border px-3 py-2">
                {scene.isError || composed.isError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {(composed.error ?? scene.error)?.message}
                  </p>
                ) : null}
                {shownScene?.warnings.map((w) => (
                  <p key={w} className="text-2xs text-muted-foreground">
                    {w}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-border p-3 lg:border-t-0 lg:border-l">
            {layer ? (
              <TemplateLayerInspector
                layer={layer}
                edit={edits[layer.layerId]}
                fonts={fonts.data ?? []}
                disabled={saving}
                onEdit={(change) => edit(layer, change)}
              />
            ) : inventory.data ? (
              <p className="text-xs text-muted-foreground">Select a layer to edit it.</p>
            ) : (
              <div className="flex flex-col gap-3" aria-hidden>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-44" />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-11" />
                  ))}
                </div>
              </div>
            )}
            {fonts.isError ? (
              <p role="alert" className="mt-3 text-xs text-destructive">
                Available font faces could not be loaded.
              </p>
            ) : null}
            <Collapsible
              open={fieldsOpen}
              onOpenChange={setFieldsOpen}
              className="mt-5 border-t border-border pt-3"
            >
              <CollapsibleTrigger className="group flex w-full items-center justify-between text-3xs font-medium uppercase tracking-wide text-muted-foreground">
                Fields each render row asks for
                <ChevronDown
                  className="size-3 transition-transform group-data-[panel-open]:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-2 pt-2">
                {fields.isPending ? <Skeleton className="h-16 w-full" /> : null}
                {fields.isError ? (
                  <p role="alert" className="text-xs text-destructive">
                    Template fields could not be loaded.
                  </p>
                ) : null}
                {fields.data?.variables.map((field) => (
                  <label
                    key={field.key}
                    htmlFor={`expose-${field.key}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Checkbox
                      id={`expose-${field.key}`}
                      disabled={saving || field.reserved}
                      checked={exposures[field.key] ?? field.exposed ?? true}
                      onCheckedChange={(exposed) =>
                        setExposures((previous) => {
                          const next = { ...previous };
                          if (exposed === (field.exposed ?? true)) delete next[field.key];
                          else next[field.key] = exposed;
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 truncate">
                      {field.label} <span className="text-muted-foreground">· {field.kind}</span>
                    </span>
                  </label>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </aside>
        </div>

        <footer className="flex flex-col gap-2 border-t border-border px-3 py-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save('new_variant');
            }}
            className="flex flex-wrap items-start gap-2"
          >
            <div className="min-w-48 flex-1 space-y-1">
              <Input
                aria-label="Variant name"
                className="h-8 text-xs"
                disabled={saving}
                {...form.register('name')}
              />
              {form.formState.errors.name ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            {onVariant ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || !dirty}
                onClick={() => void save('this_variant')}
              >
                {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Save
              </Button>
            ) : null}
            <Button
              type="submit"
              size="sm"
              variant={onVariant ? 'outline' : 'default'}
              disabled={busy || !dirty}
            >
              {saving && !onVariant ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              {onVariant ? 'Save as new variant' : 'Save as variant'}
            </Button>
          </form>
          {savedVariant ? (
            <div role="status" className="flex items-center gap-2 text-xs">
              Saved {savedVariant.name}.
              <Button
                size="xs"
                variant="ghost"
                onClick={async () => {
                  try {
                    await onSaved();
                    onOpenVariant?.(savedVariant.assetId);
                  } catch {
                    setError('Variant saved. The template list could not refresh. Try again.');
                  }
                }}
              >
                Open variant
              </Button>
            </div>
          ) : null}
          <Collapsible open={variantsOpen} onOpenChange={setVariantsOpen}>
            <CollapsibleTrigger className="group flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground">
              Variants of this template
              <ChevronDown
                className="size-3 transition-transform group-data-[panel-open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-wrap items-center gap-1 pt-1 text-2xs text-muted-foreground">
              {variants.isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
              {variants.data && !variants.data.variants.length ? 'None yet.' : null}
              {variants.data?.variants.map((v) => (
                <Button
                  key={v.assetId}
                  variant="ghost"
                  size="xs"
                  disabled={!onOpenVariant}
                  onClick={() => onOpenVariant?.(v.assetId)}
                >
                  {v.name}
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </footer>
      </section>
      {inventory.data?.designImport ? (
        <DesignLayersPanel
          brandId={brandId}
          assetId={assetId}
          onVariant={onVariant}
          onSaved={onSaved}
          onOpenVariant={onOpenVariant}
        />
      ) : null}
    </>
  );
}
