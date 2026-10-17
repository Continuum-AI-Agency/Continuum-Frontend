'use client';

import type { TemplateAuthoringNode } from '@continuum/contracts';
import { Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  defaultMaskDraft,
  maskCreationReason,
  maskDraftError,
  maskPreviewMatrix,
  type MaskDraft,
  type MaskShape,
} from './templateAuthoringMasks';

const MODES: Array<MaskDraft['mode']> = ['add', 'subtract', 'intersect', 'lighten', 'darken', 'difference', 'none'];

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
  const update = (change: Partial<MaskDraft>) => setDraft((current) => current ? { ...current, ...change } : current);
  const updatePair = (key: 'center' | 'size' | 'feather', index: 0 | 1, raw: string) => {
    const value = raw === '' ? Number.NaN : Number(raw);
    const current = draft?.[key];
    if (!current) return;
    update({ [key]: index === 0 ? [value, current[1]] : [current[0], value] } as Partial<MaskDraft>);
  };

  return (
    <section aria-label="Mask creation" className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
      <div>
        <h4 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Mask boundary</h4>
        <p className="mt-1 text-2xs text-muted-foreground">Preview shows the measured outline only; source pixels are not clipped here.</p>
      </div>
      {sourceReason ? <p className="text-xs text-muted-foreground">{sourceReason}</p> : null}
      {geometry && draft ? (
        <>
          <p className="text-2xs text-muted-foreground">
            Layer-source pixels · x {geometry.bounds.x.toFixed(2)}, y {geometry.bounds.y.toFixed(2)}, {geometry.bounds.width.toFixed(2)} × {geometry.bounds.height.toFixed(2)}
          </p>
          <label htmlFor={`${fieldId}-shape`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
            Boundary shape
            <Select value={shape} onValueChange={(value) => {
              const next = value as MaskShape;
              setShape(next);
              update({ shape: next });
            }}>
              <SelectTrigger id={`${fieldId}-shape`} size="sm" aria-label="Mask boundary shape" disabled={blocked}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rectangle">Rectangle</SelectItem>
                <SelectItem value="ellipse">Ellipse</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label htmlFor={`${fieldId}-name`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
            Name
            <Input id={`${fieldId}-name`} aria-label="Mask name" maxLength={200} value={draft.name} disabled={blocked}
              onChange={(event) => update({ name: event.target.value })} className="h-8 text-xs text-foreground" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['X', 'Y'] as const).map((axis, index) => (
              <label key={`center-${axis}`} htmlFor={`${fieldId}-center-${axis}`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
                Center {axis} · source px
                <Input id={`${fieldId}-center-${axis}`} type="number" step="0.01" aria-label={`Mask center ${axis}`} value={draft.center[index]}
                  disabled={blocked} onChange={(event) => updatePair('center', index as 0 | 1, event.target.value)}
                  className="h-8 text-xs text-foreground" />
              </label>
            ))}
            {(['Width', 'Height'] as const).map((label, index) => (
              <label key={`size-${label}`} htmlFor={`${fieldId}-size-${label}`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
                {label} · source px
                <Input id={`${fieldId}-size-${label}`} type="number" min="0.01" max={index === 0 ? geometry.bounds.width : geometry.bounds.height}
                  step="0.01" aria-label={`Mask ${label.toLowerCase()}`} value={draft.size[index]}
                  disabled={blocked} onChange={(event) => updatePair('size', index as 0 | 1, event.target.value)}
                  className="h-8 text-xs text-foreground" />
              </label>
            ))}
          </div>
          <label htmlFor={`${fieldId}-mode`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
            Mask mode
            <Select value={draft.mode} onValueChange={(value) => update({ mode: value as MaskDraft['mode'] })}>
              <SelectTrigger id={`${fieldId}-mode`} size="sm" aria-label="Mask mode" disabled={blocked}><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode[0]!.toUpperCase() + mode.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={`${fieldId}-opacity`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
              Opacity · percent
              <Input id={`${fieldId}-opacity`} type="number" min="0" max="100" step="1" aria-label="Mask opacity" value={draft.opacity}
                disabled={blocked} onChange={(event) => update({ opacity: Number(event.target.value) })}
                className="h-8 text-xs text-foreground" />
            </label>
            {(['X', 'Y'] as const).map((axis, index) => (
              <label key={`feather-${axis}`} htmlFor={`${fieldId}-feather-${axis}`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
                Feather {axis} · source px
                <Input id={`${fieldId}-feather-${axis}`} type="number" min="0" max="32000" step="0.1" aria-label={`Mask feather ${axis}`} value={draft.feather[index]}
                  disabled={blocked} onChange={(event) => updatePair('feather', index as 0 | 1, event.target.value)}
                  className="h-8 text-xs text-foreground" />
              </label>
            ))}
          </div>
          {draftError ? <p role="alert" className="text-2xs text-destructive">{draftError}</p> : null}
          {!previewMatrix ? <p className="text-2xs text-muted-foreground">The boundary cannot be aligned to this layer’s current pose, so creation is unavailable.</p> : null}
          <Button size="xs" variant="outline" disabled={blocked || !previewMatrix} onClick={() => onCreate(draft)}>
            <Plus aria-hidden /> Add {shape} mask
          </Button>
        </>
      ) : null}
      {(node.masks?.length ?? 0) > 0 ? <p className="text-2xs text-muted-foreground">{node.masks!.length} mask {node.masks!.length === 1 ? 'boundary' : 'boundaries'} in this draft.</p> : null}
      {geometry && (node.masks?.length ?? 0) > 0 ? <p className="text-2xs text-muted-foreground">Native render verification is still pending; this preview only draws mask boundaries.</p> : null}
    </section>
  );
}
