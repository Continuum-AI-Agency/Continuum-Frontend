'use client';

// The selected layer's editable facts, in AE's own units: comp pixels, degrees, percent, points.
// Every field shows the pending edit over the file's value and reports changes upward; the editor
// decides what counts as an edit. A property the file animates or rigs is shown, never written.

import type {
  FontInventoryRow,
  TemplateEditableLayer,
  TemplateLayerEdit,
  TemplateLayerTransform,
} from '@continuum/contracts';
import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
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
  idPrefix = 'inspector',
}: {
  layer: TemplateEditableLayer;
  edit?: TemplateLayerEdit;
  fonts: FontInventoryRow[];
  disabled: boolean;
  onEdit: (change: Partial<TemplateLayerEdit>) => void;
  idPrefix?: string;
}) {
  const locked = (key: TemplateLayerTransform) => disabled || !!layer.transformLocks[key];
  const position = edit?.position ?? layer.position ?? [0, 0];
  const scale = edit?.scale ?? layer.scale ?? [100, 100];
  const locks = [...new Set(Object.values(layer.transformLocks))];
  const font = edit?.font ?? layer.font;
  const weight = boldFaceFor(font, fonts);
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
          <label htmlFor={`${idPrefix}-visible-${layer.layerId}`} className="text-xs">
            Visible in template
          </label>
          <Switch
            id={`${idPrefix}-visible-${layer.layerId}`}
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
            value={position[0]}
            disabled={locked('position')}
            onChange={(x) => onEdit({ position: [x, position[1]] })}
          />
          <NumberScrubField
            label="Y"
            ariaLabel="Position Y"
            suffix="px"
            value={position[1]}
            disabled={locked('position')}
            onChange={(y) => onEdit({ position: [position[0], y] })}
          />
          <NumberScrubField
            label="Rotation"
            suffix="°"
            value={edit?.rotation ?? layer.rotation ?? 0}
            disabled={locked('rotation')}
            onChange={(rotation) => onEdit({ rotation })}
          />
          <NumberScrubField
            label="Opacity"
            suffix="%"
            min={0}
            max={100}
            value={edit?.opacity ?? layer.opacity ?? 100}
            disabled={locked('opacity')}
            onChange={(opacity) => onEdit({ opacity })}
          />
          <NumberScrubField
            label="Scale X"
            suffix="%"
            value={scale[0]}
            disabled={locked('scale')}
            onChange={(x) => onEdit({ scale: [x, scale[1]] })}
          />
          <NumberScrubField
            label="Scale Y"
            suffix="%"
            value={scale[1]}
            disabled={locked('scale')}
            onChange={(y) => onEdit({ scale: [scale[0], y] })}
          />
        </div>
        {layer.parentName ? <Note>X and Y are relative to {layer.parentName}.</Note> : null}
        {locks.map((reason) => (
          <Note key={reason}>{reason}</Note>
        ))}
      </Section>

      {layer.kind === 'text' ? (
        <Section title="Text">
          {layer.text ? <p className="break-words text-xs">{layer.text}</p> : null}
          <div className="grid grid-cols-2 items-end gap-2">
            <NumberScrubField
              label="Size"
              ariaLabel="Text size (pt)"
              suffix="pt"
              min={1}
              max={1000}
              step={0.5}
              value={edit?.fontSize ?? layer.fontSize ?? 1}
              disabled={disabled || !!layer.textReason}
              onChange={(fontSize) => onEdit({ fontSize })}
            />
            <label
              htmlFor={`${idPrefix}-bold-${layer.layerId}`}
              className="flex h-7 items-center gap-2 text-xs"
            >
              <Checkbox
                id={`${idPrefix}-bold-${layer.layerId}`}
                checked={weight.bold}
                disabled={disabled || !!layer.textReason || !weight.target}
                onCheckedChange={() => {
                  if (weight.target?.postScriptName) onEdit({ font: weight.target.postScriptName });
                }}
              />
              Bold
            </label>
          </div>
          {font ? <Note>{font}</Note> : null}
          {!layer.textReason && !weight.target ? (
            <Note>Upload this font’s {weight.bold ? 'regular' : 'bold'} face to change bold.</Note>
          ) : null}
          {layer.textReason ? <Note>{layer.textReason}</Note> : null}
        </Section>
      ) : null}
    </div>
  );
}
