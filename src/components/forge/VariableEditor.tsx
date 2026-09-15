'use client';

import {
  type ApiRenderVariableKind,
  apiRenderVariableLabel,
  SLOT_ROLE_KIND,
  SLOT_ROLES,
  type SlotRole,
} from '@continuum/contracts';
import { Image as ImageIcon, Info, Loader2, Save, Type, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BrandColorField } from '@/components/forge/BrandColorField';
import { KIND_ICONS } from '@/components/forge/DataGrid';
import { Pill } from '@/components/kibo-ui/pill';
import { MediaSelectPopover } from '@/components/organic/primitives/MediaSelectPopover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { TemplateSlotEdit, TemplateVariable } from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';

// Editing what a variable IS, not what it says this render.
//
// The canvas's RenderVariableFields is the value-entry form — "put a price in this slot for this
// job". This is the other question: what this knob is called, what it MEANS, how long it may be,
// and what it falls back to. Reusing the value form for it would have made every default look
// like a render input, which is the one thing a default is not.
//
// The parse deliberately arrives typed and UNLABELLED: no generic role deriver exists, and a
// guessed role is worse than no role because it silently binds the wrong field. Everything here
// is a person answering that.
//
// A list and an inspector rather than a table: a table sizes its columns to its longest cell, and
// an After Effects binding path is always the longest cell — it pushed every control off screen.

type Draft = Record<string, TemplateSlotEdit>;

const NO_ROLE = '__none__';

/** Roles whose kind cannot hold this slot are not offered — a colour role on a text slot binds nothing. */
function rolesForKind(kind: string): SlotRole[] {
  return SLOT_ROLES.filter((role) => {
    const roleKind = SLOT_ROLE_KIND[role];
    if (kind === 'color') return roleKind === 'color';
    if (kind === 'number') return roleKind === 'number';
    if (kind === 'image' || kind === 'video') return roleKind === 'image';
    // text and enum carry the date roles too: promo_start reaches AE as composed copy.
    return roleKind === 'text' || roleKind === 'number' || roleKind === 'date';
  });
}

const roleLabel = (role: string) => role.replace(/_/g, ' ');

function DefaultValueControl({
  variable,
  label,
  value,
  brandId,
  onChange,
}: {
  variable: TemplateVariable;
  label: string;
  value: unknown;
  brandId: string;
  onChange: (next: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (variable.kind === 'image' || variable.kind === 'video') {
    const pinned = value as { assetId?: string } | null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <MediaSelectPopover
          brandProfileId={brandId}
          open={picking}
          onOpenChange={setPicking}
          initialKind={variable.kind === 'video' ? 'video' : 'image'}
          maxSelectable={1}
          onAttachAssets={(assets) => {
            const asset = assets[0];
            if (!asset) return;
            // Version-pinned like every other Library reference on the render path: an unpinned
            // default silently changes what renders the next time someone uploads a new version.
            onChange(
              asset.headVersionId
                ? { assetId: asset.id, versionId: asset.headVersionId }
                : { assetId: asset.id },
            );
            setPicking(false);
          }}
          anchor={
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <ImageIcon className="size-3.5" aria-hidden />
              {pinned?.assetId ? 'Change' : 'Pick from Library'}
            </Button>
          }
        />
        {pinned?.assetId ? (
          <>
            <span className="text-xs text-muted-foreground">A Library {variable.kind} is set</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => onChange(null)}
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  if (variable.kind === 'color') {
    return (
      <BrandColorField
        brandId={brandId}
        label={`${label} default`}
        value={typeof value === 'string' ? value : null}
        onChange={(next) => onChange(next || null)}
      />
    );
  }

  if (variable.kind === 'boolean') {
    return (
      <Switch
        checked={value === true}
        onCheckedChange={(next) => onChange(next)}
        aria-label={`${label} default`}
      />
    );
  }

  if (variable.kind === 'enum' && variable.options.length) {
    return (
      <Select
        value={typeof value === 'string' ? value : NO_ROLE}
        onValueChange={(next) => onChange(next === NO_ROLE ? null : next)}
      >
        <SelectTrigger aria-label={`${label} default`}>
          <SelectValue>{typeof value === 'string' ? value : 'No default'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ROLE}>No default</SelectItem>
          {variable.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (variable.kind === 'number') {
    return (
      <Input
        type="number"
        aria-label={`${label} default`}
        value={typeof value === 'number' ? String(value) : ''}
        placeholder={variable.sample ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
      />
    );
  }

  return (
    <Input
      aria-label={`${label} default`}
      value={typeof value === 'string' ? value : ''}
      placeholder={variable.sample ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}

/**
 * The value on screen: the unsaved edit if there is one, else what the server sent.
 *
 * `undefined` means "this draft has no opinion on that field" and must fall through — a null IS
 * an opinion ("no role", "no budget"), so the two cannot be collapsed with `??`.
 *
 * Module-level and pure: everything it reads is an argument. Inside the component it would be a
 * new function every render, which a memo depending on it could never skip.
 */
function resolve<K extends keyof TemplateSlotEdit>(
  edits: Draft,
  variable: TemplateVariable,
  field: K,
  fallback: TemplateSlotEdit[K],
): TemplateSlotEdit[K] {
  const edited = edits[variable.key]?.[field];
  return edited === undefined ? fallback : edited;
}

/**
 * The draft once `submitted` has landed. A sent field is settled unless it changed again while the
 * save was in flight; a field typed meanwhile stays; a slot with nothing left drops out. Clearing
 * all or nothing would either lose those edits or re-send what the server already has.
 */
function settleDraft(current: Draft, submitted: Draft): Draft {
  const next: Draft = {};
  for (const [key, edit] of Object.entries(current)) {
    const sent: Partial<TemplateSlotEdit> = submitted[key] ?? {};
    const pending = Object.entries(edit).filter(
      ([field, value]) =>
        field !== 'slotKey' && !Object.is(sent[field as keyof TemplateSlotEdit], value),
    );
    if (pending.length) next[key] = { ...Object.fromEntries(pending), slotKey: key };
  }
  return next;
}

export function VariableEditor({
  brandId,
  variables,
  savedDefaults,
  parseState,
  saving,
  onSave,
}: {
  brandId: string;
  variables: TemplateVariable[];
  /** Saved defaults by slot key — the variables response's `edits`, which is where they persist. */
  savedDefaults: Record<string, unknown>;
  parseState: string;
  saving: boolean;
  /** Resolves true once the server has the edits; the draft is kept on anything else. */
  onSave: (edits: TemplateSlotEdit[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const patch = (key: string, change: Partial<TemplateSlotEdit>) =>
    setDraft((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { slotKey: key }), ...change, slotKey: key },
    }));

  // Two slots may not claim one role — the fleet registry refuses that at sync with a 422, so
  // showing it here is the difference between a person seeing the clash while they type and a
  // promote failing with the run already half built.
  const claimed = useMemo(() => {
    const counts = new Map<string, number>();
    for (const variable of variables) {
      const role = resolve(draft, variable, 'role', variable.role) as string | null;
      if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([role]) => role));
  }, [variables, draft]);

  const dirtyCount = Object.keys(draft).length;

  const save = async () => {
    const submitted = draft;
    if (!(await onSave(Object.values(submitted)))) return;
    setDraft((current) => settleDraft(current, submitted));
  };

  if (parseState !== 'parsed') {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground">
        <Info className="size-4" aria-hidden />
        {parseState === 'pending'
          ? 'This project has not been opened yet, so its variables are not known.'
          : parseState === 'failed'
            ? 'This project could not be read, so it exposes no variables.'
            : `This file is not one we read (${parseState}).`}
      </p>
    );
  }

  if (!variables.length) {
    return (
      <p className="rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground">
        We read this project and it exposes no bindable slots. Nothing in it can vary per render yet
        — expose a property to Essential Graphics in After Effects and upload it again.
      </p>
    );
  }

  const current = variables.find((variable) => variable.key === selectedKey) ?? variables[0]!;
  const nameOf = (variable: TemplateVariable) =>
    (resolve(draft, variable, 'publicName', null) as string | null) ||
    apiRenderVariableLabel(variable);
  const currentName = nameOf(current);
  const role = resolve(draft, current, 'role', current.role) as string | null;
  const budget = resolve(draft, current, 'charBudget', current.charBudget) as number | null;
  const textLike = current.kind === 'text' || current.kind === 'enum';

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-[minmax(11rem,17rem)_minmax(0,1fr)]">
        <ul className="min-w-0 space-y-0.5" aria-label="Variables">
          {variables.map((variable) => {
            const Icon =
              KIND_ICONS[
                variable.reserved ? 'reserved' : (variable.kind as ApiRenderVariableKind)
              ] ?? Type;
            const variableRole = resolve(draft, variable, 'role', variable.role) as string | null;
            const required = resolve(draft, variable, 'required', variable.required) === true;
            const active = variable.key === current.key;
            return (
              <li key={variable.key}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setSelectedKey(variable.key)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
                  )}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{nameOf(variable)}</span>
                  {variableRole ? (
                    <Pill
                      variant={claimed.has(variableRole) ? 'destructive' : 'muted'}
                      className="max-w-24 truncate"
                    >
                      {roleLabel(variableRole)}
                    </Pill>
                  ) : null}
                  {required ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      role="img"
                      aria-label="required"
                    />
                  ) : null}
                  {draft[variable.key] ? <span className="sr-only">unsaved changes</span> : null}
                </button>
              </li>
            );
          })}
        </ul>

        <fieldset
          key={current.key}
          className="min-w-0 space-y-4 rounded-lg border p-4"
          aria-label={`${currentName} settings`}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`variable-name-${current.key}`}>Name</Label>
            <Input
              id={`variable-name-${current.key}`}
              value={
                (resolve(draft, current, 'publicName', undefined) as string | null | undefined) ??
                apiRenderVariableLabel(current)
              }
              onChange={(event) => patch(current.key, { publicName: event.target.value })}
            />
            {current.description ? (
              <p className="text-xs text-muted-foreground">{current.description}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Means</Label>
            <Select
              value={role ?? NO_ROLE}
              onValueChange={(next) =>
                patch(current.key, { role: next === NO_ROLE ? null : String(next) })
              }
            >
              <SelectTrigger className="w-full sm:w-72" aria-label={`Meaning for ${currentName}`}>
                <SelectValue>{role ? roleLabel(role) : 'Unassigned'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROLE}>Unassigned</SelectItem>
                {rolesForKind(current.kind).map((option) => (
                  <SelectItem key={option} value={option}>
                    {roleLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role && claimed.has(role) ? (
              <p className="text-xs text-destructive">Another variable already means this.</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Default</Label>
            <DefaultValueControl
              variable={current}
              label={currentName}
              brandId={brandId}
              value={resolve(draft, current, 'defaultValue', savedDefaults[current.key] ?? null)}
              onChange={(next) => patch(current.key, { defaultValue: next })}
            />
          </div>

          <div className="flex flex-wrap items-end gap-6">
            {textLike ? (
              <div className="space-y-1.5">
                <Label htmlFor={`variable-budget-${current.key}`}>Max chars</Label>
                <Input
                  id={`variable-budget-${current.key}`}
                  type="number"
                  min={0}
                  className="w-28 tabular-nums"
                  value={budget === null ? '' : String(budget)}
                  onChange={(event) =>
                    patch(current.key, {
                      charBudget: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  // Not a limit After Effects enforces — it is the designer's own composed
                  // length in the tightest comp, and the only honest budget without a render.
                  title="The designer's own composed length in the tightest frame"
                />
              </div>
            ) : null}
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id={`variable-required-${current.key}`}
                checked={resolve(draft, current, 'required', current.required) === true}
                onCheckedChange={(next) => patch(current.key, { required: next })}
              />
              <Label htmlFor={`variable-required-${current.key}`}>Required</Label>
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Where it lives in After Effects
            </summary>
            <div className="mt-2 space-y-2">
              <p className="break-all font-mono text-2xs text-muted-foreground">{current.key}</p>
              {/* One slot in seven ratios is one slot — say which frames carry it. */}
              <div className="flex flex-wrap gap-1">
                {current.comps.length ? (
                  current.comps.map((comp) => (
                    <Pill key={comp} variant="muted">
                      {comp}
                    </Pill>
                  ))
                ) : (
                  <span className="text-muted-foreground">Composition not detected</span>
                )}
              </div>
            </div>
          </details>
        </fieldset>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-background/95 py-2 backdrop-blur">
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={!dirtyCount || saving || claimed.size > 0}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Save changes
        </Button>
        {claimed.size > 0 ? (
          <span className="text-xs text-destructive">
            Two variables claim the same meaning — the fleet refuses that.
          </span>
        ) : dirtyCount ? (
          <span className="text-xs text-muted-foreground">
            {dirtyCount} variable{dirtyCount === 1 ? '' : 's'} changed
          </span>
        ) : null}
      </div>
    </div>
  );
}
