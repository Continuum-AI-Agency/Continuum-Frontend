'use client';

import type { TemplateAuthoringNode } from '@continuum/contracts';
import { Plus } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDecimal } from '@/lib/format/decimal';
import {
  defaultMaskDraft,
  type MaskDraft,
  type MaskShape,
  maskCreationReason,
  maskDraftError,
  maskPreviewMatrix,
} from './templateAuthoringMasks';
import { useForgePresentationText } from './useForgePresentationText';

const MODES: Array<MaskDraft['mode']> = [
  'add',
  'subtract',
  'intersect',
  'lighten',
  'darken',
  'difference',
  'none',
];

export function TemplateLayerMaskCreator({
  node,
  sourceChecksum,
  disabled,
  onCreate,
}: {
  node: TemplateAuthoringNode;
  sourceChecksum: string | null;
  disabled: boolean;
  onCreate: (draft: MaskDraft) => void;
}) {
  const decimalLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');
  const presentForge = useForgePresentationText();

  const [shape, setShape] = useState<MaskShape>('rectangle');
  const initial = defaultMaskDraft(node, 'rectangle');
  const [draft, setDraft] = useState<MaskDraft | null>(initial);
  useEffect(() => {
    setShape('rectangle');
    setDraft(defaultMaskDraft(node, 'rectangle'));
  }, [node.nodeId]);
  const fieldId = useId();
  const sourceReason = maskCreationReason(node, sourceChecksum);
  const geometry = node.maskSourceGeometry?.status === 'verified' ? node.maskSourceGeometry : null;
  const draftError = geometry && draft ? maskDraftError(geometry, draft) : null;
  const previewMatrix = sourceChecksum ? maskPreviewMatrix(node, sourceChecksum) : null;
  const blocked = disabled || sourceReason !== null || !geometry || !draft || !!draftError;
  const update = (change: Partial<MaskDraft>) =>
    setDraft((current) => (current ? { ...current, ...change } : current));
  const updatePair = (key: 'center' | 'size' | 'feather', index: 0 | 1, raw: string) => {
    const value = raw === '' ? Number.NaN : Number(raw);
    const current = draft?.[key];
    if (!current) return;
    update({
      [key]: index === 0 ? [value, current[1]] : [current[0], value],
    } as Partial<MaskDraft>);
  };

  return (
    <section
      aria-label={translateUi('mask_creation_92cbdc79')}
      className="mt-4 flex flex-col gap-2 border-t border-border pt-3"
    >
      <div>
        <h4 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          {translateUi('mask_boundary_32333d2d')}
        </h4>
        <p className="mt-1 text-2xs text-muted-foreground">
          {translateUi('preview_shows_the_measured_outline__957055a8')}
        </p>
      </div>
      {sourceReason ? (
        <p className="text-xs text-muted-foreground">{presentForge(sourceReason)}</p>
      ) : null}
      {geometry && draft ? (
        <>
          <p className="text-2xs text-muted-foreground">
            {' '}
            {translateUi('layer_source_pixels_x_39f1f56d')}{' '}
            {formatDecimal(geometry.bounds.x, 2, decimalLocale)}, y{' '}
            {formatDecimal(geometry.bounds.y, 2, decimalLocale)},{' '}
            {formatDecimal(geometry.bounds.width, 2, decimalLocale)} ×{' '}
            {formatDecimal(geometry.bounds.height, 2, decimalLocale)}
          </p>
          <label
            htmlFor={`${fieldId}-shape`}
            className="flex flex-col gap-1 text-2xs text-muted-foreground"
          >
            {' '}
            {translateUi('boundary_shape_2ba58e1c')}{' '}
            <Select
              value={shape}
              onValueChange={(value) => {
                const next = value as MaskShape;
                setShape(next);
                update({ shape: next });
              }}
            >
              <SelectTrigger
                id={`${fieldId}-shape`}
                size="sm"
                aria-label={translateUi('mask_boundary_shape_db2a7c2a')}
                disabled={blocked}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rectangle">{translateUi('rectangle_03069962')}</SelectItem>
                <SelectItem value="ellipse">{translateUi('ellipse_cb1ee8cb')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label
            htmlFor={`${fieldId}-name`}
            className="flex flex-col gap-1 text-2xs text-muted-foreground"
          >
            {' '}
            {translateUi('name_dcd1d522')}{' '}
            <Input
              id={`${fieldId}-name`}
              aria-label={translateUi('mask_name_ad5c358a')}
              maxLength={200}
              value={draft.name}
              disabled={blocked}
              onChange={(event) => update({ name: event.target.value })}
              className="h-8 text-xs text-foreground"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['X', 'Y'] as const).map((axis, index) => (
              <label
                key={`center-${axis}`}
                htmlFor={`${fieldId}-center-${axis}`}
                className="flex flex-col gap-1 text-2xs text-muted-foreground"
              >
                {' '}
                {translateUi('center_d9460674')} {axis} {translateUi('source_px_bcae4639')}{' '}
                <Input
                  id={`${fieldId}-center-${axis}`}
                  type="number"
                  step="0.01"
                  aria-label={translateUi('mask_center_value0_a1487ee4', {
                    value0: String(axis),
                  })}
                  value={draft.center[index]}
                  disabled={blocked}
                  onChange={(event) => updatePair('center', index as 0 | 1, event.target.value)}
                  className="h-8 text-xs text-foreground"
                />
              </label>
            ))}
            {(['Width', 'Height'] as const).map((label, index) => (
              <label
                key={`size-${label}`}
                htmlFor={`${fieldId}-size-${label}`}
                className="flex flex-col gap-1 text-2xs text-muted-foreground"
              >
                {label} {translateUi('source_px_bcae4639')}{' '}
                <Input
                  id={`${fieldId}-size-${label}`}
                  type="number"
                  min="0.01"
                  max={index === 0 ? geometry.bounds.width : geometry.bounds.height}
                  step="0.01"
                  aria-label={translateUi('mask_value0_44925bde', {
                    value0: String(label.toLowerCase()),
                  })}
                  value={draft.size[index]}
                  disabled={blocked}
                  onChange={(event) => updatePair('size', index as 0 | 1, event.target.value)}
                  className="h-8 text-xs text-foreground"
                />
              </label>
            ))}
          </div>
          <label
            htmlFor={`${fieldId}-mode`}
            className="flex flex-col gap-1 text-2xs text-muted-foreground"
          >
            {' '}
            {translateUi('mask_mode_100f75fb')}{' '}
            <Select
              value={draft.mode}
              onValueChange={(value) => update({ mode: value as MaskDraft['mode'] })}
            >
              <SelectTrigger
                id={`${fieldId}-mode`}
                size="sm"
                aria-label={translateUi('mask_mode_100f75fb')}
                disabled={blocked}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {mode[0]!.toUpperCase() + mode.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label
              htmlFor={`${fieldId}-opacity`}
              className="flex flex-col gap-1 text-2xs text-muted-foreground"
            >
              {' '}
              {translateUi('opacity_percent_fea1ef92')}{' '}
              <Input
                id={`${fieldId}-opacity`}
                type="number"
                min="0"
                max="100"
                step="1"
                aria-label={translateUi('mask_opacity_ee2878fa')}
                value={draft.opacity}
                disabled={blocked}
                onChange={(event) => update({ opacity: Number(event.target.value) })}
                className="h-8 text-xs text-foreground"
              />
            </label>
            {(['X', 'Y'] as const).map((axis, index) => (
              <label
                key={`feather-${axis}`}
                htmlFor={`${fieldId}-feather-${axis}`}
                className="flex flex-col gap-1 text-2xs text-muted-foreground"
              >
                {' '}
                {translateUi('feather_b6898405')} {axis} {translateUi('source_px_bcae4639')}{' '}
                <Input
                  id={`${fieldId}-feather-${axis}`}
                  type="number"
                  min="0"
                  max="32000"
                  step="0.1"
                  aria-label={translateUi('mask_feather_value0_e4641306', {
                    value0: String(axis),
                  })}
                  value={draft.feather[index]}
                  disabled={blocked}
                  onChange={(event) => updatePair('feather', index as 0 | 1, event.target.value)}
                  className="h-8 text-xs text-foreground"
                />
              </label>
            ))}
          </div>
          {draftError ? (
            <p role="alert" className="text-2xs text-destructive">
              {presentForge(draftError)}
            </p>
          ) : null}
          {!previewMatrix ? (
            <p className="text-2xs text-muted-foreground">
              {translateUi('the_boundary_cannot_be_aligned_to_t_aac19be0')}
            </p>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            disabled={blocked || !previewMatrix}
            onClick={() => onCreate(draft)}
          >
            <Plus aria-hidden /> {translateUi('add_9fd728c6')} {shape}{' '}
            {translateUi('mask_48bf9b4f')}{' '}
          </Button>
        </>
      ) : null}
      {(node.masks?.length ?? 0) > 0 ? (
        <p className="text-2xs text-muted-foreground">
          {translateUi('maskBoundariesCount', { count: node.masks!.length })}
        </p>
      ) : null}
      {geometry && (node.masks?.length ?? 0) > 0 ? (
        <p className="text-2xs text-muted-foreground">
          {translateUi('native_render_verification_is_still_6c4b3574')}
        </p>
      ) : null}
    </section>
  );
}
