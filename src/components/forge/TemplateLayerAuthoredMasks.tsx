'use client';

import type { TemplateAuthoringNode, TemplateMaskSourceGeometry } from '@continuum/contracts';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { maskDraftError, type MaskDraft } from './templateAuthoringMasks';

type AuthoredMask = TemplateAuthoringNode['masks'][number];
type MaskUpdatePatch = Omit<Partial<MaskDraft>, 'shape'>;
const MODES: MaskDraft['mode'][] = ['add', 'subtract', 'intersect', 'lighten', 'darken', 'difference', 'none'];

function asDraft(mask: AuthoredMask): MaskDraft {
  return {
    name: mask.name,
    shape: mask.shape,
    center: [...mask.center],
    size: [...mask.size],
    mode: mask.mode,
    opacity: mask.opacity,
    feather: [...mask.feather],
  };
}

/** Inspector for masks created in this private draft; imported masks are never passed here. */
export function TemplateLayerAuthoredMasks({
  nodeId,
  masks,
  authoredMaskIds,
  geometry,
  disabled,
  mutationsAvailable,
  onUpdate,
  onDelete,
}: {
  nodeId: string;
  masks: readonly AuthoredMask[];
  authoredMaskIds: ReadonlySet<string>;
  geometry: Extract<TemplateMaskSourceGeometry, { status: 'verified' }> | null;
  disabled: boolean;
  /** Remains false until ordered native update/delete save-reopen proof is accepted. */
  mutationsAvailable: boolean;
  onUpdate?: (nodeId: string, draftMaskId: string, patch: MaskUpdatePatch) => void;
  onDelete?: (nodeId: string, draftMaskId: string) => void;
}) {
  const controlId = useId();
  const authoredMasks = masks.filter((mask) => authoredMaskIds.has(mask.draftMaskId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MaskDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const editable = mutationsAvailable && !!onUpdate && !!onDelete;

  useEffect(() => {
    if (editingId && !authoredMasks.some((mask) => mask.draftMaskId === editingId)) {
      setEditingId(null);
      setDraft(null);
    }
  }, [authoredMasks, editingId]);

  const beginEdit = (mask: AuthoredMask) => {
    setEditingId(mask.draftMaskId);
    setDraft(asDraft(mask));
    setEditError(null);
  };
  const save = () => {
    if (!editingId || !draft || !editable || disabled) return;
    const invalid = geometry ? maskDraftError(geometry, draft) : 'Verified source geometry is unavailable.';
    if (invalid) {
      setEditError(invalid);
      return;
    }
    const { shape: _shape, ...patch } = draft;
    onUpdate?.(nodeId, editingId, patch);
    setEditingId(null);
    setDraft(null);
    setEditError(null);
  };

  if (!authoredMasks.length) return null;
  return (
    <section aria-label="Draft-created masks" className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <h4 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Draft masks</h4>
      {authoredMasks.map((mask) => {
        const maskControlId = `${controlId}-${mask.draftMaskId}`;
        const isEditing = editingId === mask.draftMaskId && draft !== null;
        return (
          <article key={mask.draftMaskId} className="rounded-md border border-border p-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{mask.name}</p>
                <p className="text-2xs text-muted-foreground">
                  {mask.shape} · {mask.center[0].toFixed(2)}, {mask.center[1].toFixed(2)} · {mask.size[0].toFixed(2)} × {mask.size[1].toFixed(2)} px
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {isEditing ? (
                  <>
                    <Button size="xs" variant="outline" aria-label={`Save ${mask.name}`} disabled={!editable || disabled} onClick={save}><Check aria-hidden /> Save</Button>
                    <Button size="xs" variant="ghost" aria-label={`Cancel editing ${mask.name}`} disabled={disabled} onClick={() => { setEditingId(null); setDraft(null); setEditError(null); }}><X aria-hidden /></Button>
                  </>
                ) : (
                  <>
                    <Button size="xs" variant="ghost" aria-label={`Edit ${mask.name}`} disabled={!editable || disabled} onClick={() => beginEdit(mask)}><Pencil aria-hidden /></Button>
                    <Button size="xs" variant="ghost" aria-label={`Delete ${mask.name}`} disabled={!editable || disabled} onClick={() => onDelete?.(nodeId, mask.draftMaskId)}><Trash2 aria-hidden /></Button>
                  </>
                )}
              </div>
            </div>
            {isEditing && draft ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label htmlFor={`${maskControlId}-name`} className="col-span-2 flex flex-col gap-1 text-2xs text-muted-foreground">
                  Name
                  <Input id={`${maskControlId}-name`} aria-label={`Name for ${mask.name}`} maxLength={200} value={draft.name} disabled={!editable || disabled}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-8 text-xs text-foreground" />
                </label>
                {(['X', 'Y'] as const).map((axis, index) => (
                  <label htmlFor={`${maskControlId}-center-${index}`} key={`center-${axis}`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
                    Center {axis} · source px
                    <Input id={`${maskControlId}-center-${index}`} type="number" step="0.01" aria-label={`${mask.name} center ${axis}`} value={draft.center[index]} disabled={!editable || disabled}
                      onChange={(event) => setDraft({ ...draft, center: index === 0 ? [Number(event.target.value), draft.center[1]] : [draft.center[0], Number(event.target.value)] })}
                      className="h-8 text-xs text-foreground" />
                  </label>
                ))}
                {(['Width', 'Height'] as const).map((label, index) => (
                  <label htmlFor={`${maskControlId}-size-${index}`} key={`size-${label}`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
                    {label} · source px
                    <Input id={`${maskControlId}-size-${index}`} type="number" min="0.01" step="0.01" aria-label={`${mask.name} ${label.toLowerCase()}`} value={draft.size[index]} disabled={!editable || disabled}
                      onChange={(event) => setDraft({ ...draft, size: index === 0 ? [Number(event.target.value), draft.size[1]] : [draft.size[0], Number(event.target.value)] })}
                      className="h-8 text-xs text-foreground" />
                  </label>
                ))}
                <label htmlFor={`${maskControlId}-mode`} className="col-span-2 flex flex-col gap-1 text-2xs text-muted-foreground">
                  Mode
                  <Select value={draft.mode} onValueChange={(value) => {
                    const mode = MODES.find((candidate) => candidate === value);
                    if (mode) setDraft({ ...draft, mode });
                  }}>
                    <SelectTrigger id={`${maskControlId}-mode`} size="sm" aria-label={`Mode for ${mask.name}`} disabled={!editable || disabled}><SelectValue /></SelectTrigger>
                    <SelectContent>{MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode[0]!.toUpperCase() + mode.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label htmlFor={`${maskControlId}-opacity`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
                  Opacity · percent
                  <Input id={`${maskControlId}-opacity`} type="number" min="0" max="100" step="1" aria-label={`${mask.name} opacity`} value={draft.opacity} disabled={!editable || disabled}
                    onChange={(event) => setDraft({ ...draft, opacity: Number(event.target.value) })} className="h-8 text-xs text-foreground" />
                </label>
                {(['X', 'Y'] as const).map((axis, index) => (
                  <label htmlFor={`${maskControlId}-feather-${index}`} key={`feather-${axis}`} className="flex flex-col gap-1 text-2xs text-muted-foreground">
                    Feather {axis} · source px
                    <Input id={`${maskControlId}-feather-${index}`} type="number" min="0" max="32000" step="0.1" aria-label={`${mask.name} feather ${axis}`} value={draft.feather[index]} disabled={!editable || disabled}
                      onChange={(event) => setDraft({ ...draft, feather: index === 0 ? [Number(event.target.value), draft.feather[1]] : [draft.feather[0], Number(event.target.value)] })}
                      className="h-8 text-xs text-foreground" />
                  </label>
                ))}
                {editError ? <p role="alert" className="col-span-2 text-2xs text-destructive">{editError}</p> : null}
              </div>
            ) : null}
          </article>
        );
      })}
      {!editable ? <p className="text-2xs text-muted-foreground">Editing and removal are unavailable until native save and reopen checks pass.</p> : null}
    </section>
  );
}
