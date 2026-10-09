'use client';

// The Layers tab editor: a revision's layer stack, a live layout preview and the selected layer's
// inspector, in one bounded workspace whose panes scroll on their own. Edits stay pending until
// saved as an immutable revision: "Save revision" advances the open variant, "Save as new
// variant" branches a named one. The Original is never rewritten; it only branches.
//
// Loading is staged so nothing waits on what it does not need. The shell paints at once from the
// parse the page already holds; the layer list and the default comp's scene load in parallel,
// each stored per source version so only a first open reaches the forge; render fields and fonts
// load when opened or needed. An edit shows in the preview at once (layerPreviewSvg.ts, which
// rebuilds the forge SVG from an allowlist before it is inlined) and the forge's composed preview
// replaces that guess after a pause.

import {
  saveTemplateRevisionRequestSchema,
  type TemplateEditableLayer,
  type TemplateLayerEdit,
  type TemplateLayerOrder,
  type TemplatePreview,
  type TemplateRevision,
  type TemplateSourceSlotEdit,
  templateSlotDefaultValueSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, GitFork, Loader2, Lock, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { previewMarkup } from '@/components/forge/layerPreviewSvg';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { TemplateColourFields } from '@/components/forge/TemplateColourFields';
import { TemplateLayerInspector } from '@/components/forge/TemplateLayerInspector';
import { type StackRow, TemplateLayerList } from '@/components/forge/TemplateLayerList';
import { TemplateWireframe } from '@/components/forge/TemplateWireframe';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  editableTemplateFonts,
  fetchTemplateLayerInventory,
  fetchTemplateLayerScene,
  fetchTemplateRevisionVariants,
  fetchTemplateVariables,
  previewTemplateRevision,
  saveTemplateRevision,
} from '@/lib/library/templateSources';
import { DefaultValueControl } from './VariableEditor';

type Edits = Record<string, TemplateLayerEdit>;
type Changes = { layers: TemplateLayerEdit[]; orders: TemplateLayerOrder[] };

const NO_CHANGES: Changes = { layers: [], orders: [] };
/** A composed preview asks the forge to rewrite the file, so it waits for a pause. */
const PREVIEW_DELAY_MS = 800;
const EDIT_FIELDS = [
  'font',
  'fontSize',
  'text',
  'visible',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scale',
  'opacity',
] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hasChanges = (c: Changes) => c.layers.length > 0 || c.orders.length > 0;
const layerKey = (layer: Pick<TemplateEditableLayer, 'compId' | 'layerId'>) =>
  `${layer.compId}:${layer.layerId}`;

/** A comp's stack, front first (index 0 is the top). */
export function stackOf(layers: readonly TemplateEditableLayer[], compId: number | null) {
  return layers
    .filter((l) => l.compId === compId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
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
    const key = layerKey(target);
    const next: TemplateLayerEdit = {
      ...edits[key],
      compId: target.compId,
      layerId: target.layerId,
      ...(target.designLayerId != null
        ? { designLayerId: target.designLayerId, artboardId: target.artboardId }
        : {}),
      ...change,
    };
    for (const field of EDIT_FIELDS)
      if (next[field] !== undefined && same(next[field], target[field])) delete next[field];
    if (EDIT_FIELDS.some((field) => next[field] !== undefined)) result[key] = next;
    else delete result[key];
  }
  return result;
}

/** The revision that pins this exact file, alone or as one of several packages. */
const pins = (revision: TemplateRevision, assetId: string, versionId: string | null) =>
  (revision.sourceAssetId === assetId && revision.sourceVersionId === versionId) ||
  !!revision.sources?.some(
    (source) => source.assetId === assetId && source.versionId === versionId,
  );

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
  initialComp,
  templateKey,
}: {
  brandId: string;
  assetId: string;
  versionId: string | null;
  name: string;
  /** The parse the page already holds: the shell paints from it before any layer data arrives. */
  parse?: TemplatePreview | null;
  active: boolean;
  onSaved: () => Promise<void>;
  onOpenVariant?: (assetId: string) => void | Promise<void>;
  /** A composition to open on, by name — an output row's Edit in the gallery. */
  initialComp?: string;
  /** The published render template, once promoted: its fields can be marked as colours. */
  templateKey?: string | null;
}) {
  const catalog = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, assetId),
    queryFn: () => fetchTemplateRevisionVariants(brandId, assetId),
    enabled: active && !!versionId,
  });
  const variant = catalog.data?.find((item) =>
    item.revisions.some((revision) => pins(revision, assetId, versionId)),
  );
  const revision = variant?.revisions.find((item) => pins(item, assetId, versionId));
  // An upload the registry never took in — its file version has no recorded checksum — has no
  // revision to edit from, and waiting will not change that.
  const unregistered =
    (catalog.isSuccess && !revision) ||
    /template_revision_source_missing/.test(String(catalog.error ?? ''));
  // The Backend builds edits from one parent file; a revision rendering from several cannot be one.
  const multiSource = !!revision?.sources?.length;

  const [edits, setEdits] = useState<Edits>({});
  const [orders, setOrders] = useState<Record<number, number[]>>({});
  const [slots, setSlots] = useState<Record<string, TemplateSourceSlotEdit>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [compId, setCompId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layerValidity, setLayerValidity] = useState<Record<string, string[]>>({});
  const [layerInputs, setLayerInputs] = useState<Record<string, Record<string, string>>>({});
  const [resetCount, setResetCount] = useState(0);
  const retryKey = useRef<string | null>(null);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: `${name} variant` },
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a different file starts a clean slate.
  useEffect(() => {
    setEdits({});
    setOrders({});
    setSlots({});
    setSelected(null);
    setCompId(null);
    setSearch('');
    setError(null);
    setLayerValidity({});
    setLayerInputs({});
    retryKey.current = null;
  }, [assetId, versionId]);

  const changes = useMemo<Changes>(
    () => ({
      layers: Object.values(edits),
      orders: Object.entries(orders).map(([id, layerIds]) => ({ compId: Number(id), layerIds })),
    }),
    [edits, orders],
  );
  const [settled, setSettled] = useState<Changes>(NO_CHANGES);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(changes), hasChanges(changes) ? PREVIEW_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [changes]);

  const ready = active && !!versionId && !unregistered;
  // The layer list and the default comp's scene are asked for together; each is stored per source
  // version, so a source the Backend has seen answers both from the database.
  const inventory = useQuery({
    queryKey: forgeQueryKeys.layerInventory(brandId, assetId, versionId ?? ''),
    queryFn: () => fetchTemplateLayerInventory(brandId, assetId, versionId ?? ''),
    enabled: ready,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const startComp = inventory.data?.comps.find((c) => c.name === initialComp)?.id ?? null;
  const sceneComp = compId ?? startComp;
  const shownComp = sceneComp ?? inventory.data?.compId ?? null;
  const scene = useQuery({
    queryKey: forgeQueryKeys.layerScene(brandId, assetId, versionId ?? '', sceneComp),
    queryFn: () => fetchTemplateLayerScene(brandId, assetId, versionId ?? '', sceneComp),
    // A named comp is resolved from the list first, rather than drawing the default comp too.
    enabled: ready && (!initialComp || !!inventory.data),
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const composed = useQuery({
    queryKey: forgeQueryKeys.layerPreview(brandId, revision?.id ?? '', shownComp, settled),
    queryFn: async () => ({
      view: await previewTemplateRevision(assetId, {
        brandId,
        parentRevisionId: revision?.id ?? '',
        edits: { layers: settled.layers, orders: settled.orders, slots: [] },
        ...(shownComp ? { compId: shownComp } : {}),
      }),
      changes: settled,
    }),
    enabled: ready && !!revision && !multiSource && !!inventory.data && hasChanges(settled),
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const layers = inventory.data?.layers ?? [];
  const byId = new Map(layers.map((l) => [l.layerId, l]));
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
    // Only a text layer's face and Bold read the font inventory.
    enabled: ready && layer?.kind === 'text' && !layer.textReason,
  });

  // What is on screen: the composed preview of the settled edits when there are any and it is for
  // this comp, else the unedited scene — with every edit made since applied on top, at once.
  const composedView =
    hasChanges(settled) && composed.data?.view.compId === shownComp ? composed.data : null;
  const shownScene =
    composedView?.view ??
    (scene.data && (sceneComp === null || scene.data.compId === sceneComp) ? scene.data : null);
  const renderedFor = composedView?.changes ?? NO_CHANGES;
  const markup = useMemo(() => {
    if (!shownScene) return '';
    const drawn = shownScene.compId;
    const ofComp = (list: TemplateLayerEdit[]) =>
      Object.fromEntries(list.filter((e) => e.compId === drawn).map((e) => [e.layerId, e]));
    return previewMarkup(shownScene.svg, {
      compId: drawn,
      layers,
      rendered: ofComp(renderedFor.layers),
      current: ofComp(changes.layers),
      renderedOrder:
        renderedFor.orders.find((o) => o.compId === drawn)?.layerIds ?? stackOf(layers, drawn),
      order: orders[drawn] ?? stackOf(layers, drawn),
    });
  }, [shownScene, layers, renderedFor, changes, orders]);

  const query = search.trim().toLowerCase();
  const listed = query
    ? layers
        .filter((l) => `${l.name} ${l.text ?? ''} ${l.comp}`.toLowerCase().includes(query))
        .map((l) => l.layerId)
    : stack;
  const rows: StackRow[] = listed.flatMap((id) => {
    const l = byId.get(id);
    if (!l) return [];
    const pending = edits[layerKey(l)];
    return [
      {
        id,
        label: l.text || l.name,
        detail: query ? l.comp : l.text && l.text !== l.name ? l.name : undefined,
        kind: l.kind,
        hidden: !(pending?.visible ?? l.visible),
        visibilityLocked: !!l.visibilityReason,
        edited: !!pending,
      },
    ];
  });

  const valid = Object.values(layerValidity).every((invalid) => invalid.length === 0);
  const dirty = hasChanges(changes) || Object.keys(slots).length > 0;
  const unsaved = dirty || !valid;
  const previewing =
    scene.isFetching || (hasChanges(changes) && (settled !== changes || composed.isFetching));
  const canSave =
    !!revision && !!variant && !!inventory.data && !saving && valid && dirty && !multiSource;
  // Until the layer list lands, the shell stands in for it from the parse the page holds.
  const defaultComp =
    parse?.comps.find((c) => c.name === initialComp) ??
    parse?.comps.find((c) => c.isDelivery) ??
    parse?.comps[0];
  // A full parse counts the comp's layers; the compact one the page may hold does not.
  const layerCount = defaultComp?.layerCount;
  const placeholderRows =
    typeof layerCount === 'number' && layerCount > 0 ? Math.min(layerCount, 12) : 6;

  useEffect(() => {
    if (!unsaved) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);

  /** Any change makes a different revision, so a retry key only survives an unchanged retry. */
  const touch = () => {
    retryKey.current = null;
  };
  const edit = (target: TemplateEditableLayer, change: Partial<TemplateLayerEdit>) => {
    touch();
    setEdits((current) => applyLayerChange(current, layers, target, change));
  };
  const reorder = (order: number[]) => {
    if (shownComp === null) return;
    touch();
    setOrders((current) => {
      const next = { ...current };
      if (same(order, fileStack)) delete next[shownComp];
      else next[shownComp] = order;
      return next;
    });
  };
  const patchSlot = (slotKey: string, patch: Partial<TemplateSourceSlotEdit>) => {
    touch();
    setSlots((current) => ({ ...current, [slotKey]: { ...current[slotKey], slotKey, ...patch } }));
  };
  const reset = () => {
    touch();
    setEdits({});
    setOrders({});
    setSlots({});
    setError(null);
    setLayerValidity({});
    setLayerInputs({});
    setResetCount((count) => count + 1);
  };
  const save = async (branch: boolean, values: { name: string }) => {
    if (!canSave || !revision || !variant) return;
    setSaving(true);
    setError(null);
    retryKey.current ??= crypto.randomUUID();
    let saved: TemplateRevision;
    try {
      saved = await saveTemplateRevision(
        assetId,
        saveTemplateRevisionRequestSchema.parse({
          brandId,
          parentRevisionId: revision.id,
          expectedHeadRevisionId: branch ? revision.id : variant.draftHeadRevisionId,
          idempotencyKey: retryKey.current,
          ...(branch ? { name: values.name } : { variantId: variant.variantId }),
          edits: { ...changes, slots: Object.values(slots) },
          ...(shownComp ? { compId: shownComp } : {}),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save revision');
      setSaving(false);
      return;
    }
    reset();
    try {
      await onSaved();
      await catalog.refetch();
      await onOpenVariant?.(saved.sourceAssetId);
    } catch {
      setError('Saved. Refresh the template list to open it.');
    } finally {
      setSaving(false);
    }
  };

  if (!versionId)
    return (
      <p className="text-xs text-muted-foreground">Import and parse the source to edit layers.</p>
    );
  return (
    <section
      aria-label="Template revision editor"
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-[min(46rem,calc(100dvh-13rem))]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {!variant && !unregistered ? <Skeleton className="h-5 w-28 rounded-full" /> : null}
          {variant?.original ? (
            <Pill variant="warning">
              <Lock className="size-3" aria-hidden /> Original
            </Pill>
          ) : null}
          {variant && !variant.original ? (
            <Pill variant="violet">
              <GitFork className="size-3" aria-hidden /> Variant
            </Pill>
          ) : null}
          <h3 className="truncate text-sm font-medium">
            {variant?.name ?? name}
            {revision ? ` · Revision ${revision.number}` : ''}
          </h3>
          {variant ? (
            <p className="text-xs text-muted-foreground">
              {variant.original
                ? 'The original is preserved. Save changes as a named variant.'
                : 'Save a new revision or branch into another named variant.'}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {shownScene ? (
            <span role="status" className="flex items-center gap-1 text-2xs text-muted-foreground">
              {previewing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
              {previewing ? 'Updating preview' : 'Preview up to date'}
            </span>
          ) : null}
          <Button size="sm" variant="ghost" disabled={saving || !unsaved} onClick={reset}>
            <RotateCcw data-icon="inline-start" aria-hidden /> Reset
          </Button>
        </div>
      </header>

      {!valid ? (
        <p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">
          Correct invalid layer values before saving, or Reset to discard them.
        </p>
      ) : null}
      {error || (catalog.error && !unregistered) ? (
        <p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">
          {error ?? String(catalog.error)}
        </p>
      ) : null}
      {multiSource ? (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          This revision renders from several files; it cannot be edited as one file yet.
        </p>
      ) : null}

      {unregistered ? (
        <p className="p-3 text-xs text-muted-foreground">
          This upload is not registered as a template revision — its file has no recorded checksum —
          so its layers cannot be edited here. Upload the file again to edit them.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          <aside className="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
            <div className="flex flex-col gap-2 border-b border-border p-2">
              <select
                aria-label="Composition"
                className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-xs"
                disabled={!inventory.data}
                value={shownComp ?? ''}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  setCompId(id);
                  setSelected(firstEditable(stackOf(layers, id)));
                }}
              >
                {inventory.data ? null : (
                  <option value="">{defaultComp?.name ?? 'Composition'}</option>
                )}
                {inventory.data?.comps.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Input
                aria-label="Search layers"
                placeholder="Search text or layer name"
                className="h-8 text-xs"
                disabled={!inventory.data}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-72 min-h-0 flex-1 overflow-y-auto p-1 lg:max-h-none">
              {inventory.data ? (
                <TemplateLayerList
                  label="Layers"
                  rows={rows}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    const target = byId.get(id);
                    if (target && target.compId !== shownComp) setCompId(target.compId);
                    setSelected(id);
                  }}
                  onReorder={query || comp?.orderReason || saving ? undefined : reorder}
                  onToggleVisible={(id) => {
                    const target = byId.get(id);
                    if (target)
                      edit(target, {
                        visible: !(edits[layerKey(target)]?.visible ?? target.visible),
                      });
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
                  {Array.from({ length: placeholderRows }, (_, i) => (
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
                <div
                  role="img"
                  aria-label="Layout preview of template edits"
                  className={`size-full transition-opacity ${previewing ? 'opacity-80' : ''}`}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: rebuilt from an element and attribute allowlist in layerPreviewSvg.safeSvg.
                  dangerouslySetInnerHTML={{ __html: markup }}
                />
              ) : shownScene ? (
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(shownScene.svg)}`}
                  alt="Layout preview of template edits"
                  className="size-full object-contain"
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
            {scene.isError || composed.isError || shownScene?.warnings.length ? (
              <div className="max-h-24 overflow-y-auto border-t border-border px-3 py-2">
                {scene.isError || composed.isError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {(composed.error ?? scene.error)?.message}
                  </p>
                ) : null}
                {shownScene?.warnings.map((warning) => (
                  <p key={warning} className="text-2xs text-muted-foreground">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-border p-3 lg:border-t-0 lg:border-l">
            {layer ? (
              <TemplateLayerInspector
                key={`${layerKey(layer)}:${resetCount}`}
                layer={layer}
                edit={edits[layerKey(layer)]}
                fonts={fonts.data ?? []}
                disabled={saving}
                inputValues={layerInputs[layerKey(layer)] ?? {}}
                invalidFields={layerValidity[layerKey(layer)] ?? []}
                onInputValue={(field, value) => {
                  touch();
                  setLayerInputs((current) => ({
                    ...current,
                    [layerKey(layer)]: { ...current[layerKey(layer)], [field]: value },
                  }));
                }}
                onValidity={(invalid) =>
                  setLayerValidity((current) => ({ ...current, [layerKey(layer)]: invalid }))
                }
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
                Template defaults and render fields
                <ChevronDown
                  className="size-3 transition-transform group-data-[panel-open]:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3 pt-2">
                {fields.isPending ? <Skeleton className="h-16 w-full" /> : null}
                {fields.isError ? (
                  <p role="alert" className="text-xs text-destructive">
                    Template fields could not be loaded.
                  </p>
                ) : null}
                {fields.data?.variables.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1.5 text-xs">
                    <label htmlFor={`expose-${field.key}`} className="flex items-center gap-2">
                      <Checkbox
                        id={`expose-${field.key}`}
                        checked={slots[field.key]?.exposed ?? field.exposed ?? true}
                        disabled={saving || field.reserved}
                        onCheckedChange={(exposed) => patchSlot(field.key, { exposed })}
                      />
                      {field.label} · editable per render
                    </label>
                    <DefaultValueControl
                      variable={field}
                      label={field.label}
                      brandId={brandId}
                      value={
                        slots[field.key]?.defaultValue !== undefined
                          ? slots[field.key].defaultValue
                          : fields.data?.edits.find((item) => item.slotKey === field.key)
                              ?.defaultValue
                      }
                      onChange={(value) => {
                        const parsed = templateSlotDefaultValueSchema.safeParse(value);
                        if (parsed.success) patchSlot(field.key, { defaultValue: parsed.data });
                      }}
                    />
                  </div>
                ))}
                {templateKey ? (
                  <TemplateColourFields
                    brandId={brandId}
                    assetId={assetId}
                    templateKey={templateKey}
                  />
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          </aside>
        </div>
      )}

      <form
        onSubmit={form.handleSubmit((values) => save(true, values))}
        className="flex flex-wrap items-start gap-2 border-t border-border px-3 py-2"
      >
        <label htmlFor={`variant-name-${assetId}`} className="min-w-48 flex-1 space-y-1 text-xs">
          New variant name
          <Input
            id={`variant-name-${assetId}`}
            className="h-8 text-xs"
            disabled={saving}
            {...form.register('name')}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 self-end">
          <Button
            type="submit"
            size="sm"
            variant={variant?.original ? 'default' : 'outline'}
            disabled={!canSave}
          >
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Save as new variant
          </Button>
          {variant && !variant.original && revision?.id === variant.draftHeadRevisionId ? (
            <Button
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={() => void save(false, form.getValues())}
            >
              Save revision
            </Button>
          ) : null}
          {unsaved ? (
            <span role="status" className="text-xs text-muted-foreground">
              Unsaved template changes
            </span>
          ) : null}
        </div>
        {form.formState.errors.name ? (
          <p role="alert" className="w-full text-xs text-destructive">
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
