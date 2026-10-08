'use client';

// The selected layer's editable facts, in AE's own units: comp pixels, degrees, percent, points.
// Every field shows the pending edit over the file's value and reports changes upward; the editor
// decides what counts as an edit. A property the file animates or rigs is shown, never written:
// X/Y (the layer's Position) and the other transforms follow `transformLocks`, a text box's
// width and height follow `geometryReason`. Typed text fields report validity so the editor can
// hold Save while a value is blank or out of range.

import type {
  FontInventoryRow,
  TemplateEditableLayer,
  TemplateLayerEdit,
} from '@continuum/contracts';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NumberScrubField } from '@/components/ui/number-field';
import { Switch } from '@/components/ui/switch';

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

const KIND: Record<TemplateEditableLayer['kind'], string> = {
  text: 'Text',
  composition: 'Composition',
  artwork: 'Artwork',
};

const sizeSchema = z.number().finite().min(1).max(1000);
const boxSchema = z.number().finite().positive().max(100_000);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h4 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

const Note = ({ children }: { children: ReactNode }) => (
  <p className="text-2xs text-muted-foreground">{children}</p>
);

export function TemplateLayerInspector({
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
  /** What was typed into a text field, kept so a blank or invalid entry stays on screen. */
  inputValues: Record<string, string>;
  invalidFields: string[];
  onInputValue: (field: string, value: string) => void;
}) {
  const locks = layer.transformLocks ?? {};
  const positionLock = disabled || !!locks.position;
  const x = edit?.x ?? layer.x;
  const y = edit?.y ?? layer.y;
  const scale = edit?.scale ?? layer.scale ?? [100, 100];
  const reasons = [...new Set(Object.values(locks))];
  const font = edit?.font ?? layer.font;
  const weight = boldFaceFor(font, fonts);
  const textLocked = disabled || !!layer.textReason;
  const boxErrors = invalidFields.filter((name) => name !== 'size');
  const typed = (field: 'size' | 'width' | 'height', schema: z.ZodNumber, value: string) => {
    onInputValue(field, value);
    const parsed = schema.safeParse(value.trim() === '' ? Number.NaN : Number(value));
    const next = new Set(invalidFields);
    if (parsed.success) next.delete(field);
    else next.add(field);
    onValidity([...next]);
    if (parsed.success)
      onEdit(field === 'size' ? { fontSize: parsed.data } : { [field]: parsed.data });
  };
  return (
    <div className="flex flex-col gap-5">
      <Section title="Layer">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{layer.text || layer.name}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {KIND[layer.kind]} · {layer.comp}
          </p>
        </div>
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
          <Note>Visibility follows this layer’s shared Show field across formats.</Note>
        ) : null}
        {layer.visibilityReason ? <Note>{layer.visibilityReason}</Note> : null}
      </Section>

      <Section title="Transform">
        <div className="grid grid-cols-2 gap-2">
          <NumberScrubField
            label="X"
            ariaLabel="Position X"
            suffix="px"
            min={-100_000}
            max={100_000}
            value={x ?? 0}
            disabled={positionLock || x == null}
            onChange={(next) => onEdit({ x: next })}
          />
          <NumberScrubField
            label="Y"
            ariaLabel="Position Y"
            suffix="px"
            min={-100_000}
            max={100_000}
            value={y ?? 0}
            disabled={positionLock || y == null}
            onChange={(next) => onEdit({ y: next })}
          />
          <NumberScrubField
            label="Rotation"
            suffix="°"
            min={-36_000}
            max={36_000}
            value={edit?.rotation ?? layer.rotation ?? 0}
            disabled={disabled || !!locks.rotation || layer.rotation == null}
            onChange={(rotation) => onEdit({ rotation })}
          />
          <NumberScrubField
            label="Opacity"
            suffix="%"
            min={0}
            max={100}
            value={edit?.opacity ?? layer.opacity ?? 100}
            disabled={disabled || !!locks.opacity || layer.opacity == null}
            onChange={(opacity) => onEdit({ opacity })}
          />
          <NumberScrubField
            label="Scale X"
            suffix="%"
            min={-10_000}
            max={10_000}
            value={scale[0]}
            disabled={disabled || !!locks.scale || layer.scale == null}
            onChange={(next) => onEdit({ scale: [next, scale[1]] })}
          />
          <NumberScrubField
            label="Scale Y"
            suffix="%"
            min={-10_000}
            max={10_000}
            value={scale[1]}
            disabled={disabled || !!locks.scale || layer.scale == null}
            onChange={(next) => onEdit({ scale: [scale[0], next] })}
          />
        </div>
        {layer.parentName ? <Note>X and Y are relative to {layer.parentName}.</Note> : null}
        {reasons.map((reason) => (
          <Note key={reason}>{reason}</Note>
        ))}
      </Section>

      {layer.kind === 'text' ? (
        <Section title="Text">
          <label
            htmlFor={`text-${layer.compId}-${layer.layerId}`}
            className="flex flex-col gap-1 text-xs"
          >
            Text
            <Input
              id={`text-${layer.compId}-${layer.layerId}`}
              aria-label="Layer text"
              className="h-8 text-xs"
              value={edit?.text ?? layer.text ?? ''}
              disabled={textLocked}
              onChange={(event) => onEdit({ text: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Font face
            <select
              aria-label="Font face"
              className="h-8 w-full rounded-md border bg-background px-2"
              value={font ?? ''}
              disabled={textLocked}
              onChange={(event) => onEdit({ font: event.target.value })}
            >
              <option value={font ?? ''}>{font || 'Source font'}</option>
              {fonts
                .filter((face) => face.postScriptName && face.postScriptName !== font)
                .map((face) => (
                  <option key={face.id} value={face.postScriptName ?? ''}>
                    {face.familyKey || face.postScriptName} · {face.style}
                  </option>
                ))}
            </select>
          </label>
          <div className="grid grid-cols-2 items-end gap-2">
            <label
              htmlFor={`size-${layer.compId}-${layer.layerId}`}
              className="flex flex-col gap-1 text-xs"
            >
              Text size (pt)
              <Input
                id={`size-${layer.compId}-${layer.layerId}`}
                type="number"
                min={1}
                max={1000}
                step="0.5"
                className="h-8 text-xs"
                disabled={textLocked}
                value={inputValues.size ?? edit?.fontSize ?? layer.fontSize ?? ''}
                aria-invalid={invalidFields.includes('size')}
                onChange={(event) => typed('size', sizeSchema, event.currentTarget.value)}
              />
            </label>
            <label
              htmlFor={`bold-${layer.compId}-${layer.layerId}`}
              className="flex h-8 items-center gap-2 text-xs"
            >
              <Checkbox
                id={`bold-${layer.compId}-${layer.layerId}`}
                checked={weight.bold}
                disabled={textLocked || !weight.target}
                onCheckedChange={() => {
                  if (weight.target?.postScriptName) onEdit({ font: weight.target.postScriptName });
                }}
              />
              Bold
            </label>
          </div>
          {invalidFields.includes('size') ? (
            <p role="alert" className="text-xs text-destructive">
              Enter a size from 1 to 1000.
            </p>
          ) : null}
          {font ? <Note>{font}</Note> : null}
          {!layer.textReason && !weight.target ? (
            <Note>Upload this font’s {weight.bold ? 'regular' : 'bold'} face to change bold.</Note>
          ) : null}
          {layer.textReason ? <Note>{layer.textReason}</Note> : null}
          <div className="grid grid-cols-2 gap-2">
            {(['width', 'height'] as const).map((property) => (
              <label
                key={property}
                htmlFor={`${property}-${layer.compId}-${layer.layerId}`}
                className="flex flex-col gap-1 text-xs"
              >
                {property === 'width' ? 'Text box width' : 'Text box height'}
                <Input
                  id={`${property}-${layer.compId}-${layer.layerId}`}
                  type="number"
                  aria-label={property}
                  className="h-8 text-xs"
                  disabled={disabled || !!layer.geometryReason || layer[property] == null}
                  value={inputValues[property] ?? edit?.[property] ?? layer[property] ?? ''}
                  aria-invalid={invalidFields.includes(property)}
                  onChange={(event) => typed(property, boxSchema, event.currentTarget.value)}
                />
              </label>
            ))}
          </div>
          {boxErrors.length ? (
            <p role="alert" className="text-xs text-destructive">
              Enter valid values for {boxErrors.join(', ')}. Text box dimensions must be positive.
            </p>
          ) : null}
          {layer.geometryReason ? <Note>{layer.geometryReason}</Note> : null}
        </Section>
      ) : null}
    </div>
  );
}
