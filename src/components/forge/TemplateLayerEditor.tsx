'use client';

import {
  type DesignArrangement,
  type DesignLayersResponse,
  type FontInventoryRow,
  saveTemplateRevisionRequestSchema,
  type TemplateEditableLayer,
  type TemplateLayerEdit,
  type TemplateLayerPreviewResponse,
  type TemplateRevision,
  type TemplateRevisionVariant,
  type TemplateSourceSlotEdit,
  templateSlotDefaultValueSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  editableTemplateFonts,
  fetchDesignLayers,
  fetchTemplateRevisionVariants,
  fetchTemplateVariables,
  previewTemplateRevision,
  saveTemplateRevision,
} from '@/lib/library/templateSources';
import { moveLayer } from './DesignLayersPanel';
import { DefaultValueControl } from './VariableEditor';

/** Bold uses an available face of the same family and style, preserving the source font. */
export function boldFaceFor(font: string | null, fonts: FontInventoryRow[]) {
  const face = fonts.find((f) => f.postScriptName === font);
  const bold = face?.weight != null ? face.weight >= 600 : /bold|black|heavy/i.test(font ?? '');
  const target = face
    ? fonts
        .filter(
          (f) =>
            f.familyKey === face.familyKey &&
            f.style === face.style &&
            f.postScriptName &&
            f.weight != null &&
            (bold ? f.weight < 600 : f.weight >= 600),
        )
        .sort(
          (a, b) =>
            Math.abs((a.weight ?? 400) - (bold ? 400 : 700)) -
            Math.abs((b.weight ?? 400) - (bold ? 400 : 700)),
        )[0]
    : undefined;
  return { bold, target };
}

const layerKey = (layer: Pick<TemplateEditableLayer, 'compId' | 'layerId'>) =>
  `${layer.compId}:${layer.layerId}`;

const sizeSchema = z.object({ size: z.number().finite().min(1).max(1000) });
export function LayerControls({
  layer,
  edit,
  fonts,
  disabled,
  onEdit,
  onValidity,
  inputValues,
  invalidFields,
  onInputValue,
}: {
  layer: TemplateEditableLayer;
  edit?: TemplateLayerEdit;
  fonts: FontInventoryRow[];
  disabled: boolean;
  onEdit: (change: Partial<TemplateLayerEdit>) => void;
  onValidity: (invalidFields: string[]) => void;
  inputValues: Record<string, string>;
  invalidFields: string[];
  onInputValue: (field: string, value: string) => void;
}) {
  const geometryErrors = invalidFields.filter((name) => name !== 'size');
  const reportValidity = (field: string, valid: boolean) => {
    const next = new Set(invalidFields);
    if (valid) next.delete(field);
    else next.add(field);
    onValidity([...next]);
  };
  const size = edit?.fontSize ?? layer.fontSize ?? 1;
  const form = useForm<{ size: number }>({
    resolver: zodResolver(sizeSchema),
    mode: 'onChange',
    defaultValues: { size },
  });
  const font = edit?.font ?? layer.font;
  const weight = boldFaceFor(font, fonts);
  const sizeField = form.register('size', { valueAsNumber: true });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`visible-${layer.compId}-${layer.layerId}`} className="text-xs">
          Visible in template
        </label>
        <Switch
          id={`visible-${layer.compId}-${layer.layerId}`}
          size="sm"
          checked={edit?.visible ?? layer.visible}
          disabled={disabled || !!layer.visibilityReason}
          onCheckedChange={(visible) => onEdit({ visible })}
        />
      </div>
      {layer.visibilitySlotKeys.length ? (
        <p className="text-xs text-muted-foreground">
          Visibility follows this layer’s shared Show field across formats.
        </p>
      ) : null}
      {layer.visibilityReason ? (
        <p className="text-xs text-muted-foreground">{layer.visibilityReason}</p>
      ) : null}
      {layer.kind === 'text' ? (
        <>
          <label htmlFor={`text-${layer.compId}-${layer.layerId}`} className="space-y-1 text-xs">
            Text
            <Input
              id={`text-${layer.compId}-${layer.layerId}`}
              aria-label="Layer text"
              value={edit?.text ?? layer.text ?? ''}
              disabled={disabled || !!layer.textReason}
              onChange={(event) => onEdit({ text: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs">
            Font face
            <select
              aria-label="Font face"
              className="h-8 w-full rounded-md border bg-background px-2"
              value={font ?? ''}
              disabled={disabled || !!layer.textReason}
              onChange={(event) => onEdit({ font: event.target.value })}
            >
              <option value={font ?? ''}>{font || 'Source font'}</option>
              {fonts
                .filter((face) => face.postScriptName && face.postScriptName !== font)
                .map((face) => (
                  <option key={face.id} value={face.postScriptName!}>
                    {face.familyKey || face.postScriptName} · {face.style}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-24 space-y-1">
              <label htmlFor={`size-${layer.compId}-${layer.layerId}`} className="text-xs">
                Text size (pt)
              </label>
              <Input
                id={`size-${layer.compId}-${layer.layerId}`}
                type="number"
                min={1}
                max={1000}
                step="0.5"
                disabled={disabled || !!layer.textReason}
                {...sizeField}
                value={inputValues.size ?? size}
                onChange={(e) => {
                  void sizeField.onChange(e);
                  onInputValue('size', e.currentTarget.value);
                  const parsed = sizeSchema.safeParse({ size: e.currentTarget.valueAsNumber });
                  reportValidity('size', parsed.success);
                  if (parsed.success) onEdit({ fontSize: parsed.data.size });
                }}
                aria-invalid={!!form.formState.errors.size}
              />
            </div>
            <label
              htmlFor={`bold-${layer.compId}-${layer.layerId}`}
              className="flex h-8 items-center gap-2 text-xs"
            >
              <Checkbox
                id={`bold-${layer.compId}-${layer.layerId}`}
                checked={weight.bold}
                disabled={disabled || !!layer.textReason || !weight.target}
                onCheckedChange={() => {
                  if (weight.target?.postScriptName) onEdit({ font: weight.target.postScriptName });
                }}
              />
              Bold
            </label>
          </div>
          {form.formState.errors.size ? (
            <p role="alert" className="text-xs text-destructive">
              Enter a size from 1 to 1000.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{font}</p>
          {!layer.textReason && !weight.target ? (
            <p className="text-xs text-muted-foreground">
              Upload this font’s {weight.bold ? 'regular' : 'bold'} face to change bold.
            </p>
          ) : null}
        </>
      ) : null}
      {layer.kind === 'text' ? (
        <div className="grid grid-cols-2 gap-2">
          {(['x', 'y', 'width', 'height'] as const).map((property) => (
            <label
              key={property}
              htmlFor={`${property}-${layer.compId}-${layer.layerId}`}
              className="space-y-1 text-xs"
            >
              {property === 'x'
                ? 'Horizontal position'
                : property === 'y'
                  ? 'Vertical position'
                  : property === 'width'
                    ? 'Text box width'
                    : 'Text box height'}
              <Input
                id={`${property}-${layer.compId}-${layer.layerId}`}
                type="number"
                aria-label={property}
                disabled={disabled || Boolean(layer.geometryReason) || layer[property] == null}
                value={inputValues[property] ?? edit?.[property] ?? layer[property] ?? ''}
                onChange={(event) => {
                  onInputValue(property, event.currentTarget.value);
                  const value = event.currentTarget.valueAsNumber;
                  const valid =
                    Number.isFinite(value) &&
                    (property === 'x' || property === 'y' || (value > 0 && value <= 100000));
                  reportValidity(property, valid);
                  if (valid) onEdit({ [property]: value });
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
      {geometryErrors.length ? (
        <p role="alert" className="text-xs text-destructive">
          Enter valid values for {geometryErrors.join(', ')}. Text box dimensions must be positive.
        </p>
      ) : null}
      {layer.geometryReason ? (
        <p className="text-xs text-muted-foreground">{layer.geometryReason}</p>
      ) : null}
      {layer.textReason ? (
        <p className="text-xs text-muted-foreground">{layer.textReason}</p>
      ) : null}
    </div>
  );
}

const nameSchema = z.object({ name: z.string().trim().min(1, 'Name your variant').max(120) });
export function TemplateLayerEditor({
  brandId,
  assetId,
  versionId,
  name,
  active,
  onSaved,
  onOpenVariant,
  initialComp,
}: {
  brandId: string;
  assetId: string;
  versionId: string | null;
  name: string;
  active: boolean;
  onSaved: () => Promise<void>;
  onOpenVariant?: (assetId: string) => void | Promise<void>;
  /** A composition to open on, by name — an output row's Edit in the gallery. */
  initialComp?: string;
}) {
  const catalog = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, assetId),
    queryFn: () => fetchTemplateRevisionVariants(brandId, assetId),
    enabled: active && !!versionId,
  });
  const variant = catalog.data?.find((item) =>
    item.revisions.some((revision) => revision.sourceAssetId === assetId),
  );
  const revision = variant?.revisions.find(
    (item) => item.sourceAssetId === assetId && item.sourceVersionId === versionId,
  );
  // An upload the registry never took in — its file version has no recorded checksum — has no
  // revision to edit from, and waiting will not change that.
  const unregistered =
    (catalog.isSuccess && !revision) ||
    /template_revision_source_missing/.test(String(catalog.error ?? ''));
  const [baseline, setBaseline] = useState<TemplateLayerPreviewResponse | null>(null);
  const [preview, setPreview] = useState<TemplateLayerPreviewResponse | null>(null);
  const [edits, setEdits] = useState<Record<string, TemplateLayerEdit>>({});
  const [slots, setSlots] = useState<Record<string, TemplateSourceSlotEdit>>({});
  const [arrangement, setArrangement] = useState<DesignArrangement | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [compId, setCompId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [layerValidity, setLayerValidity] = useState<Record<string, string[]>>({});
  const [layerInputs, setLayerInputs] = useState<Record<string, Record<string, string>>>({});
  const valid = Object.values(layerValidity).every((fields) => fields.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const sequence = useRef(0);
  const retryKey = useRef<string | null>(null);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: `${name} variant` },
  });
  const fonts = useQuery({
    queryKey: ['forge-layer-fonts', brandId],
    queryFn: () => editableTemplateFonts(brandId),
    enabled: active,
  });
  const fields = useQuery({
    queryKey: forgeQueryKeys.templateVariables(brandId, assetId, versionId ?? ''),
    queryFn: () => fetchTemplateVariables(brandId, assetId),
    enabled: active && !!versionId,
  });
  const design = useQuery({
    queryKey: ['forge-design-layers', brandId, assetId],
    queryFn: () => fetchDesignLayers(brandId, assetId),
    enabled:
      active &&
      !!variant &&
      (variant.sourceKind === 'illustrator' || variant.sourceKind === 'photoshop'),
  });
  useEffect(() => {
    setBaseline(null);
    setPreview(null);
    setEdits({});
    setSlots({});
    setSelected(null);
    setLayerValidity({});
    setLayerInputs({});
    setCompId(null);
    setArrangement(undefined);
    setError(null);
    setDirty(false);
    retryKey.current = null;
    sequence.current++;
  }, [assetId, versionId]);
  useEffect(() => {
    if (!active || !revision || baseline || busy || error) return;
    const ticket = ++sequence.current;
    setBusy(true);
    previewTemplateRevision(assetId, {
      brandId,
      parentRevisionId: revision.id,
      edits: { layers: [], slots: [] },
    })
      .then((data) => {
        if (ticket !== sequence.current) return;
        setBaseline(data);
        setPreview(data);
        const start = data.comps.find((comp) => comp.name === initialComp)?.id ?? data.compId;
        setCompId(start);
        const first =
          data.layers.find(
            (layer) => layer.compId === start && layer.kind === 'text' && !layer.textReason,
          ) ??
          data.layers.find((layer) => layer.compId === start) ??
          data.layers[0];
        setSelected(first ? layerKey(first) : null);
      })
      .catch((cause) => {
        if (ticket === sequence.current)
          setError(cause instanceof Error ? cause.message : 'Could not load layers');
      })
      .finally(() => {
        if (ticket === sequence.current) setBusy(false);
      });
  }, [active, assetId, baseline, brandId, busy, error, revision, initialComp]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const touch = () => {
    setDirty(true);
    retryKey.current = null;
  };
  const layer = baseline?.layers.find((item) => layerKey(item) === selected);
  const updateLayer = (change: Partial<TemplateLayerEdit>) => {
    if (!layer) return;
    touch();
    setEdits((current) => {
      const result = { ...current };
      const targets =
        change.visible !== undefined && layer.visibilitySlotKeys.length
          ? baseline!.layers.filter((item) =>
              item.visibilitySlotKeys.some((key) => layer.visibilitySlotKeys.includes(key)),
            )
          : [layer];
      for (const target of targets)
        result[layerKey(target)] = {
          ...current[layerKey(target)],
          compId: target.compId,
          layerId: target.layerId,
          ...(target.designLayerId != null
            ? { designLayerId: target.designLayerId, artboardId: target.artboardId }
            : {}),
          ...change,
        };
      return result;
    });
  };
  const patchSlot = (slotKey: string, patch: Partial<TemplateSourceSlotEdit>) => {
    touch();
    setSlots((current) => ({ ...current, [slotKey]: { ...current[slotKey], slotKey, ...patch } }));
  };
  const changes = () => ({
    ...(arrangement ? { arrangement } : {}),
    layers: Object.values(edits),
    slots: Object.values(slots),
  });
  const reset = () => {
    setEdits({});
    setSlots({});
    setArrangement(undefined);
    setPreview(baseline);
    setDirty(false);
    setError(null);
    setResetCount((count) => count + 1);
    setLayerValidity({});
    setLayerInputs({});
    retryKey.current = null;
  };
  const previewEdits = async () => {
    if (!revision || busy) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await previewTemplateRevision(assetId, {
          brandId,
          parentRevisionId: revision.id,
          edits: changes(),
          ...(compId ? { compId } : {}),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };
  const save = async (branch: boolean, values: { name: string }) => {
    if (!revision || !variant || busy || !valid || !dirty || !baseline) return;
    setBusy(true);
    setError(null);
    retryKey.current ??= crypto.randomUUID();
    try {
      const saved = await saveTemplateRevision(
        assetId,
        saveTemplateRevisionRequestSchema.parse({
          brandId,
          parentRevisionId: revision.id,
          expectedHeadRevisionId: branch ? revision.id : variant.draftHeadRevisionId,
          idempotencyKey: retryKey.current,
          ...(branch ? { name: values.name } : { variantId: variant.variantId }),
          edits: changes(),
          ...(compId ? { compId } : {}),
        }),
      );
      setDirty(false);
      await onSaved();
      await catalog.refetch();
      await onOpenVariant?.(saved.sourceAssetId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save revision');
    } finally {
      setBusy(false);
    }
  };
  const board =
    design.data?.artboards.find(
      (item) => item.id === (arrangement?.artboardId ?? revision?.edits.arrangement?.artboardId),
    ) ?? design.data?.artboards[0];
  const order =
    arrangement?.order ??
    revision?.edits.arrangement?.order ??
    design.data?.layers.filter((item) => item.artboardId === board?.id).map((item) => item.id) ??
    [];
  if (!versionId)
    return (
      <p className="text-xs text-muted-foreground">Import and parse the source to edit layers.</p>
    );
  return (
    <section aria-label="Template revision editor" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">
            {variant?.name ?? name}
            {revision ? ` · Revision ${revision.number}` : ''}
          </h3>
          <p className="text-xs text-muted-foreground">
            {variant?.original
              ? 'The original is preserved. Save changes as a named variant.'
              : 'Save a new revision or branch into another named variant.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={!dirty || busy} onClick={reset}>
            Reset
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!baseline || !valid || busy}
            onClick={() => void previewEdits()}
          >
            Preview edits
          </Button>
        </div>
      </div>
      {!valid ? (
        <p role="alert" className="text-xs text-destructive">
          Correct invalid layer values before saving, or Reset to discard them.
        </p>
      ) : null}
      {error || (catalog.error && !unregistered) ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? String(catalog.error)}
        </p>
      ) : null}
      {!baseline ? (
        <p className="text-xs text-muted-foreground">
          {unregistered
            ? 'This upload is not registered as a template revision — its file has no recorded checksum — so its layers cannot be edited here. Upload the file again to edit them.'
            : 'Reading editable layers…'}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <label className="space-y-1 text-xs">
              Composition
              <select
                aria-label="Composition"
                className="h-8 w-full rounded-md border bg-background px-2"
                value={compId ?? ''}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  setCompId(id);
                  const first = baseline.layers.find((item) => item.compId === id);
                  setSelected(first ? layerKey(first) : null);
                }}
              >
                {baseline.comps.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {baseline.layers
                .filter((item) => item.compId === compId)
                .map((item) => (
                  <Button
                    key={layerKey(item)}
                    variant={selected === layerKey(item) ? 'secondary' : 'ghost'}
                    className="h-auto w-full justify-start rounded-none whitespace-normal px-2 py-2 text-left text-xs"
                    onClick={() => {
                      setSelected(layerKey(item));
                    }}
                  >
                    {item.text || item.name}
                  </Button>
                ))}
            </div>
            {layer ? (
              <LayerControls
                key={`${layerKey(layer)}:${resetCount}`}
                layer={layer}
                edit={edits[layerKey(layer)]}
                fonts={fonts.data ?? []}
                disabled={busy}
                inputValues={layerInputs[layerKey(layer)] ?? {}}
                invalidFields={layerValidity[layerKey(layer)] ?? []}
                onInputValue={(field, value) => {
                  touch();
                  setLayerInputs((current) => ({
                    ...current,
                    [layerKey(layer)]: { ...current[layerKey(layer)], [field]: value },
                  }));
                }}
                onEdit={updateLayer}
                onValidity={(value) =>
                  setLayerValidity((current) => ({ ...current, [layerKey(layer)]: value }))
                }
              />
            ) : null}
            {board && design.data ? (
              <fieldset className="space-y-2 rounded-md border p-2">
                <legend className="text-xs">Layer order · {board.name}</legend>
                {[...order].reverse().map((id) => {
                  const item = design.data!.layers.find((candidate) => candidate.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">{item?.name ?? id}</span>
                      {([1, -1] as const).map((step) => (
                        <Button
                          key={step}
                          size="xs"
                          variant="ghost"
                          disabled={
                            busy ||
                            order.indexOf(id) + step < 0 ||
                            order.indexOf(id) + step >= order.length
                          }
                          aria-label={`${step === 1 ? 'Bring' : 'Send'} ${item?.name ?? id} ${step === 1 ? 'forward' : 'backward'}`}
                          onClick={() => {
                            touch();
                            setArrangement({
                              name: variant?.name ?? name,
                              artboardId: board.id,
                              order: moveLayer(order, id, step),
                            });
                          }}
                        >
                          {step === 1 ? '↑' : '↓'}
                        </Button>
                      ))}
                    </div>
                  );
                })}
              </fieldset>
            ) : null}
          </div>
          <div className="space-y-3">
            {preview ? (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`}
                alt="Layout preview of template edits"
                className="max-h-96 w-full rounded-md border object-contain"
              />
            ) : null}
            {preview?.warnings.map((warning) => (
              <p key={warning} className="text-xs text-muted-foreground">
                {warning}
              </p>
            ))}
            <fieldset className="space-y-3 border-t pt-3">
              <legend className="text-xs font-medium">Template defaults and render fields</legend>
              {fields.data?.variables.map((field) => (
                <div key={field.key} className="space-y-1.5 text-xs">
                  <label htmlFor={`expose-${field.key}`} className="flex items-center gap-2">
                    <Checkbox
                      id={`expose-${field.key}`}
                      checked={slots[field.key]?.exposed ?? field.exposed ?? true}
                      disabled={busy || field.reserved}
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
            </fieldset>
          </div>
        </div>
      )}
      <form
        onSubmit={form.handleSubmit((values) => save(true, values))}
        className="flex flex-wrap items-center gap-2 border-t pt-3"
      >
        <label htmlFor={`variant-name-${assetId}`} className="min-w-0 flex-1 space-y-1 text-xs">
          New variant name
          <Input id={`variant-name-${assetId}`} disabled={busy} {...form.register('name')} />
        </label>
        <Button type="submit" size="sm" disabled={busy || !valid || !dirty || !baseline}>
          Save as new variant
        </Button>
        {!variant?.original && revision?.id === variant?.draftHeadRevisionId ? (
          <Button
            type="button"
            size="sm"
            disabled={busy || !valid || !dirty || !baseline}
            onClick={() => void save(false, form.getValues())}
          >
            Save revision
          </Button>
        ) : null}
        {dirty ? (
          <span role="status" className="text-xs text-muted-foreground">
            Unsaved template changes
          </span>
        ) : null}
        {form.formState.errors.name ? (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
