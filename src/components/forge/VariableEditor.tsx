'use client';

import { SLOT_ROLE_KIND, SLOT_ROLES, type SlotRole } from '@continuum/contracts';
import { Image as ImageIcon, Info, Loader2, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MediaSelectPopover } from '@/components/organic/primitives/MediaSelectPopover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TemplateSlotEdit, TemplateVariable } from '@/lib/library/templateSources';

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

function DefaultValueControl({
  variable,
  value,
  brandId,
  onChange,
}: {
  variable: TemplateVariable;
  value: unknown;
  brandId: string;
  onChange: (next: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (variable.kind === 'image' || variable.kind === 'video') {
    const pinned = value as { assetId?: string } | null;
    return (
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
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <ImageIcon className="size-3.5" aria-hidden />
            {pinned?.assetId ? 'Change' : 'Pick'}
          </Button>
        }
      />
    );
  }

  if (variable.kind === 'color') {
    return (
      <ColorField
        label={variable.label}
        value={typeof value === 'string' ? value : ''}
        onChange={(next) => onChange(next || null)}
      />
    );
  }

  if (variable.kind === 'boolean') {
    return (
      <Switch
        checked={value === true}
        onCheckedChange={(next) => onChange(next)}
        aria-label={`${variable.label} default`}
      />
    );
  }

  if (variable.kind === 'number') {
    return (
      <Input
        type="number"
        className="h-7 text-xs"
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
      className="h-7 text-xs"
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

export function VariableEditor({
  brandId,
  variables,
  parseState,
  saving,
  onSave,
}: {
  brandId: string;
  variables: TemplateVariable[];
  parseState: string;
  saving: boolean;
  onSave: (edits: TemplateSlotEdit[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>({});

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

  const dirty = Object.keys(draft).length > 0;

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

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Variable</TableHead>
              <TableHead className="min-w-[160px]">Means</TableHead>
              <TableHead className="min-w-[160px]">Default</TableHead>
              <TableHead className="w-24">Max chars</TableHead>
              <TableHead className="w-20">Required</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variables.map((variable) => {
              const role = resolve(draft, variable, 'role', variable.role) as string | null;
              const budget = resolve(draft, variable, 'charBudget', variable.charBudget) as
                | number
                | null;
              const clash = role ? claimed.has(role) : false;
              return (
                <TableRow key={variable.key}>
                  <TableCell className="align-top">
                    <Input
                      className="h-7 text-xs"
                      defaultValue={variable.label}
                      onChange={(event) => patch(variable.key, { publicName: event.target.value })}
                      aria-label={`Name for ${variable.key}`}
                    />
                    <p className="mt-1 flex flex-wrap items-center gap-1 font-mono text-2xs text-muted-foreground">
                      <Badge variant="secondary" className="px-1 py-0 text-2xs">
                        {variable.kind}
                      </Badge>
                      {/* One slot in seven ratios is one slot — say which frames carry it. */}
                      {variable.comps.length ? `${variable.comps.length} comps` : null}
                    </p>
                  </TableCell>

                  <TableCell className="align-top">
                    <Select
                      value={role ?? NO_ROLE}
                      onValueChange={(next) =>
                        patch(variable.key, { role: next === NO_ROLE ? null : next })
                      }
                    >
                      <SelectTrigger
                        className="h-7 text-xs"
                        aria-label={`Role for ${variable.label}`}
                      >
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ROLE}>Unassigned</SelectItem>
                        {rolesForKind(variable.kind).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {clash ? (
                      <p className="mt-1 text-2xs text-destructive">
                        Another variable already means this.
                      </p>
                    ) : null}
                  </TableCell>

                  <TableCell className="align-top">
                    <DefaultValueControl
                      variable={variable}
                      brandId={brandId}
                      value={draft[variable.key]?.defaultValue}
                      onChange={(next) => patch(variable.key, { defaultValue: next })}
                    />
                  </TableCell>

                  <TableCell className="align-top">
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs tabular-nums"
                      value={budget === null ? '' : String(budget)}
                      onChange={(event) =>
                        patch(variable.key, {
                          charBudget: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      aria-label={`Character budget for ${variable.label}`}
                      // Not a limit After Effects enforces — it is the designer's own composed
                      // length in the tightest comp, and the only honest budget without a render.
                      title="The designer's own composed length in the tightest frame"
                    />
                  </TableCell>

                  <TableCell className="align-top">
                    <Switch
                      checked={
                        (resolve(draft, variable, 'required', variable.required) as
                          | boolean
                          | null) === true
                      }
                      onCheckedChange={(next) => patch(variable.key, { required: next })}
                      aria-label={`${variable.label} is required`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving || claimed.size > 0}
          onClick={() => {
            onSave(Object.values(draft));
            setDraft({});
          }}
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
        ) : dirty ? (
          <span className="text-xs text-muted-foreground">
            {Object.keys(draft).length} variable{Object.keys(draft).length === 1 ? '' : 's'} changed
          </span>
        ) : null}
      </div>
    </div>
  );
}
