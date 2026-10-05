'use client';

import {
  type FontInventoryRow,
  saveTemplateLayerVariantRequestSchema,
  type TemplateEditableLayer,
  type TemplateLayerEdit,
  type TemplateLayerPreviewResponse,
  templateLayerPreviewRequestSchema,
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
  fetchTemplateLayerVariants,
  fetchTemplateVariables,
  previewTemplateLayers,
  saveTemplateLayerVariant,
} from '@/lib/library/templateSources';

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

const sizeSchema = z.object({ size: z.number().finite().min(1).max(1000) });
function LayerControls({
  layer,
  edit,
  fonts,
  disabled,
  onEdit,
  onValidity,
}: {
  layer: TemplateEditableLayer;
  edit?: TemplateLayerEdit;
  fonts: FontInventoryRow[];
  disabled: boolean;
  onEdit: (change: Partial<TemplateLayerEdit>) => void;
  onValidity: (valid: boolean) => void;
}) {
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
        <label htmlFor={`visible-${layer.layerId}`} className="text-xs">
          Visible in template
        </label>
        <Switch
          id={`visible-${layer.layerId}`}
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
          <p className="break-words text-sm">{layer.text}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-24 space-y-1">
              <label htmlFor={`size-${layer.layerId}`} className="text-xs">
                Text size (pt)
              </label>
              <Input
                id={`size-${layer.layerId}`}
                type="number"
                min={1}
                max={1000}
                step="0.5"
                disabled={disabled || !!layer.textReason}
                {...sizeField}
                onChange={(e) => {
                  void sizeField.onChange(e);
                  const parsed = sizeSchema.safeParse({ size: e.currentTarget.valueAsNumber });
                  onValidity(parsed.success);
                  if (parsed.success) onEdit({ fontSize: parsed.data.size });
                }}
                aria-invalid={!!form.formState.errors.size}
              />
            </div>
            <label
              htmlFor={`bold-${layer.layerId}`}
              className="flex h-8 items-center gap-2 text-xs"
            >
              <Checkbox
                id={`bold-${layer.layerId}`}
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
}: {
  brandId: string;
  assetId: string;
  versionId: string | null;
  name: string;
  active: boolean;
  onSaved: () => Promise<void>;
  onOpenVariant?: (assetId: string) => void;
}) {
  const [savedVariant, setSavedVariant] = useState<{ assetId: string; name: string } | null>(null);
  const [baseline, setBaseline] = useState<TemplateLayerPreviewResponse | null>(null);
  const [preview, setPreview] = useState<TemplateLayerPreviewResponse | null>(null);
  const [edits, setEdits] = useState<Record<number, TemplateLayerEdit>>({});
  const [exposures, setExposures] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [compId, setCompId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [validSize, setValidSize] = useState(true);
  const [resetCount, setResetCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewCurrent, setPreviewCurrent] = useState(true);
  const sequence = useRef(0);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: `${name} variant` },
  });
  const fields = useQuery({
    queryKey: forgeQueryKeys.templateVariables(brandId, assetId, versionId ?? ''),
    queryFn: () => fetchTemplateVariables(brandId, assetId),
    enabled: active && !!versionId,
  });
  const fonts = useQuery({
    queryKey: ['forge-layer-fonts', brandId],
    queryFn: () => editableTemplateFonts(brandId),
    enabled: active,
  });
  const variants = useQuery({
    queryKey: ['forge-layer-variants', brandId, assetId],
    queryFn: () => fetchTemplateLayerVariants(brandId, assetId),
    enabled: active,
  });

  useEffect(() => {
    const revision = ++sequence.current;
    setBaseline(null);
    setPreview(null);
    setEdits({});
    setExposures({});
    setSelected(null);
    setCompId(null);
    setError(null);
    setPreviewCurrent(true);
    return () => {
      if (revision === sequence.current) sequence.current++;
    };
  }, [assetId, versionId]);

  useEffect(() => {
    if (!active || !versionId || baseline || busy || error) return;
    const revision = sequence.current;
    setBusy(true);
    void previewTemplateLayers(assetId, { brandId, expectedVersionId: versionId, edits: [] })
      .then((data) => {
        if (revision !== sequence.current) return;
        setBaseline(data);
        setPreview(data);
        const layer =
          data.layers.find((l) => l.compId === data.compId && l.kind === 'text' && !l.textReason) ??
          data.layers.find((l) => l.compId === data.compId);
        setSelected(layer?.layerId ?? null);
        setCompId(data.compId);
      })
      .catch((e) => {
        if (revision === sequence.current)
          setError(e instanceof Error ? e.message : 'Could not load layers');
      })
      .finally(() => {
        if (revision === sequence.current) setBusy(false);
      });
  }, [active, assetId, baseline, brandId, busy, error, versionId]);

  const dirty = Object.keys(edits).length > 0 || Object.keys(exposures).length > 0;
  const layer = baseline?.layers.find((l) => l.layerId === selected);
  const choose = (next: TemplateEditableLayer) => {
    setSelected(next.layerId);
    setCompId(next.compId);
    setPreviewCurrent(false);
    setValidSize(true);
  };
  const update = (change: Partial<TemplateLayerEdit>) => {
    if (!layer) return;
    setEdits((previous) => {
      const result = { ...previous };
      const targets =
        change.visible !== undefined && layer.visibilitySlotKeys.length
          ? baseline!.layers.filter((l) =>
              l.visibilitySlotKeys.some((key) => layer.visibilitySlotKeys.includes(key)),
            )
          : [layer];
      for (const target of targets) {
        const next = {
          ...previous[target.layerId],
          compId: target.compId,
          layerId: target.layerId,
          ...change,
        };
        if (next.fontSize === target.fontSize) delete next.fontSize;
        if (next.font === target.font) delete next.font;
        if (next.visible === target.visible) delete next.visible;
        if (next.fontSize === undefined && next.font === undefined && next.visible === undefined)
          delete result[target.layerId];
        else result[target.layerId] = next;
      }
      return result;
    });
    setPreviewCurrent(false);
  };
  const reset = () => {
    setEdits({});
    setExposures({});
    setPreview(baseline);
    setPreviewCurrent(compId === baseline?.compId);
    setError(null);
    setValidSize(true);
    setResetCount((n) => n + 1);
  };
  const request = () =>
    templateLayerPreviewRequestSchema.parse({
      brandId,
      expectedVersionId: versionId,
      ...(compId ? { compId } : {}),
      edits: Object.values(edits),
    });
  const showPreview = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const revision = sequence.current;
    try {
      const data = await previewTemplateLayers(assetId, request());
      if (revision === sequence.current) {
        setPreview(data);
        setPreviewCurrent(true);
      }
    } catch (e) {
      if (revision === sequence.current)
        setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      if (revision === sequence.current) setBusy(false);
    }
  };
  const save = form.handleSubmit(async (values) => {
    if (busy || !validSize || !dirty || fields.isPending || fields.isError) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveTemplateLayerVariant(
        assetId,
        saveTemplateLayerVariantRequestSchema.parse({
          ...request(),
          name: values.name,
          exposures: Object.entries(exposures).map(([slotKey, exposed]) => ({ slotKey, exposed })),
        }),
      );
      setSavedVariant({ assetId: saved.assetId, name: values.name });
      reset();
      try {
        await onSaved();
        await variants.refetch();
        onOpenVariant?.(saved.assetId);
      } catch {
        setError('Variant saved. Refresh the template list to open it.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save variant');
    } finally {
      setBusy(false);
    }
  });

  if (!versionId)
    return (
      <p className="text-xs text-muted-foreground">
        Import and parse the source to edit its layers.
      </p>
    );
  return (
    <section aria-label="Temporary template edits" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Try template edits</h3>
          <p className="text-xs text-muted-foreground">
            Changes stay temporary until you save a variant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={busy || !dirty} onClick={reset}>
            Reset
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !validSize || !baseline}
            onClick={() => void showPreview()}
          >
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null} Preview edits
          </Button>
        </div>
      </div>
      {error ? (
        <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
          {error}
          {!baseline ? (
            <Button size="sm" variant="ghost" onClick={() => setError(null)}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {!baseline && busy ? (
        <p role="status" className="text-xs text-muted-foreground">
          Reading template layers…
        </p>
      ) : null}
      {baseline ? (
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)]">
          <div className="space-y-2">
            <Input
              aria-label="Search layers"
              placeholder="Search text or layer name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={String(compId ?? '')}
              onValueChange={(value) => {
                setCompId(Number(value));
                setSelected(
                  baseline.layers.find((l) => l.compId === Number(value))?.layerId ?? null,
                );
                setValidSize(true);
                setPreviewCurrent(false);
              }}
            >
              <SelectTrigger aria-label="Composition">
                <SelectValue placeholder="Composition" />
              </SelectTrigger>
              <SelectContent>
                {baseline.comps.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {baseline.layers
                .filter((l) =>
                  search
                    ? `${l.name} ${l.text ?? ''} ${l.comp}`
                        .toLowerCase()
                        .includes(search.toLowerCase())
                    : l.compId === compId,
                )
                .map((l) => (
                  <Button
                    key={l.layerId}
                    variant={selected === l.layerId ? 'secondary' : 'ghost'}
                    className="h-auto w-full justify-start whitespace-normal rounded-none px-2 py-2 text-left"
                    onClick={() => choose(l)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs">{l.text || l.name}</span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {l.comp} · {(edits[l.layerId]?.visible ?? l.visible) ? 'Visible' : 'Hidden'}
                      </span>
                    </span>
                  </Button>
                ))}
            </div>
            {layer ? (
              <LayerControls
                key={`${layer.layerId}:${resetCount}`}
                layer={layer}
                edit={edits[layer.layerId]}
                fonts={fonts.data ?? []}
                disabled={busy}
                onEdit={update}
                onValidity={setValidSize}
              />
            ) : null}
            {fonts.isError ? (
              <p role="alert" className="text-xs text-destructive">
                Available font faces could not be loaded.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            {preview ? (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`}
                alt="Layout preview of temporary template edits"
                className="max-h-96 w-full rounded-md border border-border object-contain"
              />
            ) : null}
            {!previewCurrent ? (
              <p role="status" className="text-xs text-muted-foreground">
                Preview edits to see the current changes.
              </p>
            ) : null}
            {preview?.warnings.map((w) => (
              <p key={w} className="text-xs text-muted-foreground">
                {w}
              </p>
            ))}
            <div className="space-y-2 border-t border-border pt-3">
              <h4 className="text-xs font-medium">Editable per render row</h4>
              <p className="text-xs text-muted-foreground">
                Choose which fields the variant asks for. Visibility controls whether a layer
                appears.
              </p>
              {fields.isError ? (
                <p role="alert" className="text-xs text-destructive">
                  Template fields could not be loaded.
                </p>
              ) : null}
              <div className="max-h-40 overflow-y-auto space-y-2">
                {fields.data?.variables.map((field) => (
                  <label
                    key={field.key}
                    htmlFor={`expose-${field.key}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Checkbox
                      id={`expose-${field.key}`}
                      disabled={busy || field.reserved}
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
                    <span>
                      {field.label} <span className="text-muted-foreground">· {field.kind}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <form
        onSubmit={save}
        className="flex flex-wrap items-start gap-2 border-t border-border pt-3"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Input aria-label="Variant name" disabled={busy} {...form.register('name')} />
          {form.formState.errors.name ? (
            <p role="alert" className="text-xs text-destructive">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={busy || !validSize || !dirty || !baseline || fields.isPending || fields.isError}
        >
          Save as variant
        </Button>
      </form>
      {savedVariant ? (
        <div role="status" className="flex items-center gap-2 text-xs">
          Saved {savedVariant.name}.
          <Button
            size="sm"
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
      <p className="text-xs text-muted-foreground">
        Saved variants open as their own template. Build and test render them before publishing.
      </p>
      {variants.data?.variants.length ? (
        <div className="flex flex-wrap gap-1">
          {variants.data.variants.map((v) => (
            <Button
              key={v.assetId}
              variant="ghost"
              size="sm"
              disabled={!onOpenVariant}
              onClick={() => onOpenVariant?.(v.assetId)}
            >
              {v.name}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
