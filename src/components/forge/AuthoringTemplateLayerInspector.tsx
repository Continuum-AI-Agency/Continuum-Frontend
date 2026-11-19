'use client';

// The selected layer's editable facts, in AE's own units: comp pixels, degrees, percent, points.
// Every field shows the pending edit over the file's value and reports changes upward; the editor
// decides what counts as an edit. A property the file animates or rigs is shown, never written.

import type { FontInventoryRow, TemplateLayerTransform } from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberScrubField } from '@/components/ui/number-field';
import { Switch } from '@/components/ui/switch';
import type { AuthoringEditableLayer, AuthoringLayerEdit } from './authoringTemplateLayerTypes';

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

const KIND: Record<AuthoringEditableLayer['kind'], string> = {
  text: 'Text',
  composition: 'Composition',
  artwork: 'Artwork',
};

/** Old writer responses omit fontReason; an explicit null is an unlocked font/style field. */
export function fontEditReason(layer: Pick<AuthoringEditableLayer, 'fontReason' | 'textReason'>) {
  return Object.hasOwn(layer, 'fontReason') ? layer.fontReason : layer.textReason;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-foreground">{title}</h4>
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
  onEditCommit,
  idPrefix = 'inspector',
}: {
  layer: AuthoringEditableLayer;
  edit?: AuthoringLayerEdit;
  fonts: FontInventoryRow[];
  disabled: boolean;
  onEdit: (change: Partial<AuthoringLayerEdit>, group?: string) => void;
  onEditCommit?: (group: string) => void;
  idPrefix?: string;
}) {
  const translateUi = useUiTranslations('forge');

  const locked = (key: TemplateLayerTransform) => disabled || !!layer.transformLocks[key];
  const position = [edit?.x ?? layer.x ?? 0, edit?.y ?? layer.y ?? 0] as [number, number];
  const scale = edit?.scale ?? layer.scale ?? [100, 100];
  const locks = [...new Set(Object.values(layer.transformLocks))];
  const font = edit?.font ?? layer.font;
  const fontReason = fontEditReason(layer);
  const weight = boldFaceFor(font, fonts);
  const numericEdit = (field: string, change: Partial<AuthoringLayerEdit>) =>
    onEdit(change, `${idPrefix}:${layer.layerId}:${field}`);
  const numericCommit = (field: string) => onEditCommit?.(`${idPrefix}:${layer.layerId}:${field}`);
  return (
    <div className="flex flex-col gap-5">
      <Section title={translateUi('layer_ac9ffcb2')}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{layer.text || layer.name}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {KIND[layer.kind]} · {layer.comp}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${idPrefix}-visible-${layer.layerId}`} className="text-xs">
            {' '}
            {translateUi('visible_in_template_105b588a')}{' '}
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
          <Note>{translateUi('visibility_follows_this_layer_s_sha_3bcde801')}</Note>
        ) : null}
        {layer.visibilityReason ? <Note>{layer.visibilityReason}</Note> : null}
      </Section>

      <Section title={translateUi('transform_d2d68041')}>
        <div className="grid grid-cols-2 gap-2">
          <NumberScrubField
            label="X"
            ariaLabel={translateUi('positionXLabel')}
            suffix="px"
            value={position[0]}
            disabled={locked('position')}
            onChange={(x) => numericEdit('x', { x })}
            onCommit={() => numericCommit('x')}
          />
          <NumberScrubField
            label="Y"
            ariaLabel={translateUi('positionYLabel')}
            suffix="px"
            value={position[1]}
            disabled={locked('position')}
            onChange={(y) => numericEdit('y', { y })}
            onCommit={() => numericCommit('y')}
          />
          <NumberScrubField
            label={translateUi('rotation_57b5e2fc')}
            suffix="°"
            value={edit?.rotation ?? layer.rotation ?? 0}
            disabled={locked('rotation')}
            onChange={(rotation) => numericEdit('rotation', { rotation })}
            onCommit={() => numericCommit('rotation')}
          />
          <NumberScrubField
            label={translateUi('opacity_6062652e')}
            suffix="%"
            min={0}
            max={100}
            value={edit?.opacity ?? layer.opacity ?? 100}
            disabled={locked('opacity')}
            onChange={(opacity) => numericEdit('opacity', { opacity })}
            onCommit={() => numericCommit('opacity')}
          />
          <NumberScrubField
            label={translateUi('scale_x_9e894f3e')}
            suffix="%"
            value={scale[0]}
            disabled={locked('scale')}
            onChange={(x) => numericEdit('scale-x', { scale: [x, scale[1]] })}
            onCommit={() => numericCommit('scale-x')}
          />
          <NumberScrubField
            label={translateUi('scale_y_5001e575')}
            suffix="%"
            value={scale[1]}
            disabled={locked('scale')}
            onChange={(y) => numericEdit('scale-y', { scale: [scale[0], y] })}
            onCommit={() => numericCommit('scale-y')}
          />
        </div>
        {layer.parentName ? (
          <Note>
            {translateUi('x_and_y_are_relative_to_fa334ca1')} {layer.parentName}.
          </Note>
        ) : null}
        {locks.map((reason) => (
          <Note key={reason}>{reason}</Note>
        ))}
      </Section>

      {layer.kind === 'text' ? (
        <Section title={translateUi('text_71988c4d')}>
          {layer.text ? <p className="break-words text-xs">{layer.text}</p> : null}
          <div className="grid grid-cols-2 items-end gap-2">
            <NumberScrubField
              label={translateUi('size_1af85190')}
              ariaLabel={translateUi('text_size_pt_e978300b')}
              suffix="pt"
              min={1}
              max={1000}
              step={0.5}
              value={edit?.fontSize ?? layer.fontSize ?? 1}
              disabled={disabled || !!fontReason}
              onChange={(fontSize) => numericEdit('font-size', { fontSize })}
              onCommit={() => numericCommit('font-size')}
            />
            <label
              htmlFor={`${idPrefix}-bold-${layer.layerId}`}
              className="flex h-7 items-center gap-2 text-xs"
            >
              <Checkbox
                id={`${idPrefix}-bold-${layer.layerId}`}
                checked={weight.bold}
                disabled={disabled || !!fontReason || !weight.target}
                onCheckedChange={() => {
                  if (weight.target?.postScriptName) onEdit({ font: weight.target.postScriptName });
                }}
              />{' '}
              {translateUi('bold_94fee62e')}{' '}
            </label>
          </div>
          {font ? <Note>{font}</Note> : null}
          {!fontReason && !weight.target ? (
            <Note>
              {translateUi('upload_this_font_s_5e0f94e7')}{' '}
              {weight.bold ? translateUi('regular_667937c3') : translateUi('bold_e0007a5b')}{' '}
              {translateUi('face_to_change_bold_d0eca551')}
            </Note>
          ) : null}
          {fontReason ? <Note>{fontReason}</Note> : null}
          {layer.textReason ? <Note>{layer.textReason}</Note> : null}
        </Section>
      ) : null}
    </div>
  );
}
