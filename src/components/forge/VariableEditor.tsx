'use client';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import {
  type ApiRenderVariableKind,
  apiRenderVariableLabel,
  classifyLibraryFile,
  clipRequirement,
  readableLayerName,
  SLOT_ROLE_KIND,
  SLOT_ROLES,
  type SlotRole,
} from '@continuum/contracts';
import { Image as ImageIcon, Info, Loader2, Save, Type, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { BrandColorField } from '@/components/forge/BrandColorField';
import { KIND_ICONS } from '@/components/forge/DataGrid';
import { Pill } from '@/components/kibo-ui/pill';
import { MediaSelectPopover } from '@/components/organic/primitives/MediaSelectPopover';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast-imperative';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { TemplateSlotEdit, TemplateVariable } from '@/lib/library/templateSources';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
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
// One compact row per variable that opens in place, rather than a table: a table sizes its columns
// to its longest cell, and an After Effects binding path is always the longest cell — it pushed
// every control off screen. Here the path only appears inside the opened row, in small mono.

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
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
            <Button type="button" variant="outline" size="xs" className="gap-1.5">
              <ImageIcon className="size-3.5" aria-hidden />
              {pinned?.assetId ? 'Change' : 'Pick from Library'}
            </Button>
          }
        />
        <input
          ref={fileInput}
          type="file"
          accept={variable.kind === 'video' ? 'video/*' : 'image/*'}
          aria-label={`Upload ${label} default`}
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const format = classifyLibraryFile({ fileName: file.name, mimeType: file.type });
            if (!format.accepted || format.originalKind !== variable.kind) {
              toast.error(`Choose an ${variable.kind === 'image' ? 'image' : 'video'} file.`);
              return;
            }
            setUploading(true);
            try {
              const uploaded = await uploadMediaAsset({ file, brandId });
              onChange({ assetId: uploaded.assetId, versionId: uploaded.versionId });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not upload this file.');
            } finally {
              setUploading(false);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-3.5" aria-hidden />
          )}
          Upload here
        </Button>
        {pinned?.assetId ? (
          <>
            <span className="text-xs text-muted-foreground">A Library {variable.kind} is set</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
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
        <SelectTrigger size="sm" className="w-full" aria-label={`${label} default`}>
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
        inputSize="sm"
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
      inputSize="sm"
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

type VariableFilter = 'all' | 'unassigned' | 'media' | 'text';

const FILTERS: Array<{ value: VariableFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'media', label: 'Media' },
  { value: 'text', label: 'Text' },
];

/** What a closed row shows for its default: the copy in mono, a swatch, or that a picture is set. */
function DefaultPreview({ variable, value }: { variable: TemplateVariable; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (variable.kind === 'image' || variable.kind === 'video') {
    return <span className="truncate text-muted-foreground">Library {variable.kind}</span>;
  }
  if (variable.kind === 'color' && typeof value === 'string') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="size-3 shrink-0 rounded-sm border border-border"
          style={{ backgroundColor: value }}
        />
        <span className="truncate font-mono">{value}</span>
      </span>
    );
  }
  if (typeof value === 'boolean') return <span>{value ? 'On' : 'Off'}</span>;
  return <span className="truncate font-mono">{String(value)}</span>;
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
  // `undefined` until someone opens or closes a row: the first variable starts open, and a person
  // closing every row is an answer that must not snap it back open.
  const [selectedKey, setSelectedKey] = useState<string | null | undefined>(undefined);
  const [filter, setFilter] = useState<VariableFilter>('all');

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
      <p className="flex items-center gap-2 p-[var(--card-pad)] text-xs text-muted-foreground">
        <Info className="size-3.5" aria-hidden />
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
      <p className="p-[var(--card-pad)] text-xs text-muted-foreground">
        We read this project and it exposes no bindable slots. Nothing in it can vary per render yet
        — expose a property to Essential Graphics in After Effects and upload it again.
      </p>
    );
  }

  // Display only: a label that is still the After Effects layer name reads as words here, while the
  // Name field below keeps (and saves) exactly what is stored.
  const nameOf = (variable: TemplateVariable) =>
    readableLayerName(
      (resolve(draft, variable, 'publicName', null) as string | null) ||
        apiRenderVariableLabel(variable),
    );
  const roleOf = (variable: TemplateVariable) =>
    resolve(draft, variable, 'role', variable.role) as string | null;
  const shown = variables.filter((variable) => {
    if (filter === 'unassigned') return roleOf(variable) === null;
    if (filter === 'media') return variable.kind === 'image' || variable.kind === 'video';
    if (filter === 'text') return variable.kind === 'text' || variable.kind === 'enum';
    return true;
  });
  const openKey = selectedKey === undefined ? variables[0]!.key : (selectedKey ?? '');

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-[var(--card-pad)] py-1.5">
        <ToggleGroup
          aria-label="Show variables"
          size="sm"
          spacing={0}
          variant="outline"
          value={filter}
          onValueChange={(next) => setFilter((next as VariableFilter) || 'all')}
        >
          {FILTERS.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className="text-xs">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
          {shown.length} of {variables.length}
        </span>
      </div>

      <Accordion
        value={openKey}
        onValueChange={(next) => setSelectedKey(next || null)}
        render={<ul aria-label="Variables" />}
        className="border-t border-border"
      >
        {shown.map((variable) => {
          const Icon =
            KIND_ICONS[variable.reserved ? 'reserved' : (variable.kind as ApiRenderVariableKind)] ??
            Type;
          const name = nameOf(variable);
          const role = roleOf(variable);
          const clash = role !== null && claimed.has(role);
          const required = resolve(draft, variable, 'required', variable.required) === true;
          const budget = resolve(draft, variable, 'charBudget', variable.charBudget) as
            | number
            | null;
          const defaultValue = resolve(
            draft,
            variable,
            'defaultValue',
            savedDefaults[variable.key] ?? null,
          );
          const textLike = variable.kind === 'text' || variable.kind === 'enum';
          const clipShown = clipRequirement(variable.clip);
          return (
            <AccordionItem key={variable.key} value={variable.key} render={<li />}>
              {/* The stock trigger adds chevrons and an underline; this row IS the trigger. */}
              <AccordionPrimitive.Header className="flex">
                <AccordionPrimitive.Trigger className="grid h-8 w-full min-w-0 grid-cols-[1rem_minmax(6rem,12rem)_minmax(5rem,8rem)_minmax(0,24rem)_3.5rem_0.75rem] items-center justify-start gap-2 px-[var(--card-pad)] text-left text-xs outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-panel-open:bg-muted/40">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="truncate">{name}</span>
                  <span className="flex min-w-0">
                    {role ? (
                      <Pill
                        variant={clash ? 'destructive' : 'muted'}
                        className="max-w-full truncate"
                      >
                        {roleLabel(role)}
                      </Pill>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </span>
                  <DefaultPreview variable={variable} value={defaultValue} />
                  <span
                    className="text-right font-mono tabular-nums text-muted-foreground"
                    title={clipShown?.detail}
                  >
                    {textLike && budget !== null ? `${budget} ch` : (clipShown?.chip ?? null)}
                  </span>
                  <span className="flex justify-end">
                    {required ? (
                      <span
                        className="size-1.5 rounded-full bg-primary"
                        role="img"
                        aria-label="required"
                      />
                    ) : null}
                  </span>
                  {draft[variable.key] ? <span className="sr-only">unsaved changes</span> : null}
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Panel className="@container border-t border-dashed border-border py-3 pr-[var(--card-pad)] pl-[calc(var(--card-pad)+1.5rem)]">
                <FieldGroup className="grid max-w-3xl gap-x-6 gap-y-3 @xl:grid-cols-2">
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor={`variable-name-${variable.key}`} className="text-xs">
                      Name
                    </FieldLabel>
                    <Input
                      id={`variable-name-${variable.key}`}
                      inputSize="sm"
                      value={
                        (resolve(draft, variable, 'publicName', undefined) as
                          | string
                          | null
                          | undefined) ?? apiRenderVariableLabel(variable)
                      }
                      onChange={(event) => patch(variable.key, { publicName: event.target.value })}
                    />
                    {variable.description ? (
                      <FieldDescription className="text-xs">
                        {variable.description}
                      </FieldDescription>
                    ) : null}
                  </Field>

                  <Field className="gap-1.5" data-invalid={clash || undefined}>
                    <FieldLabel className="text-xs">Means</FieldLabel>
                    <Select
                      value={role ?? NO_ROLE}
                      onValueChange={(next) =>
                        patch(variable.key, { role: next === NO_ROLE ? null : String(next) })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-full"
                        aria-label={`Meaning for ${name}`}
                        aria-invalid={clash || undefined}
                      >
                        <SelectValue>{role ? roleLabel(role) : 'Unassigned'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ROLE}>Unassigned</SelectItem>
                        {rolesForKind(variable.kind).map((option) => (
                          <SelectItem key={option} value={option}>
                            {roleLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {clash ? (
                      <FieldError className="text-xs">
                        Another variable already means this.
                      </FieldError>
                    ) : null}
                  </Field>

                  <Field className="gap-1.5">
                    <FieldLabel className="text-xs">Default</FieldLabel>
                    <DefaultValueControl
                      variable={variable}
                      label={name}
                      brandId={brandId}
                      value={defaultValue}
                      onChange={(next) => patch(variable.key, { defaultValue: next })}
                    />
                  </Field>

                  <div className="flex items-end gap-6">
                    {textLike ? (
                      <Field className="w-28 gap-1.5">
                        <FieldLabel htmlFor={`variable-budget-${variable.key}`} className="text-xs">
                          Max chars
                        </FieldLabel>
                        <InputGroup className="h-7 rounded-md shadow-none">
                          <InputGroupInput
                            id={`variable-budget-${variable.key}`}
                            type="number"
                            min={0}
                            className="tabular-nums"
                            value={budget === null ? '' : String(budget)}
                            onChange={(event) =>
                              patch(variable.key, {
                                charBudget:
                                  event.target.value === '' ? null : Number(event.target.value),
                              })
                            }
                            // Not a limit After Effects enforces — it is the designer's own composed
                            // length in the tightest comp, and the only honest budget without a render.
                            title="The designer's own composed length in the tightest frame"
                          />
                          <InputGroupAddon align="inline-end" className="text-xs">
                            ch
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                    ) : null}
                    <Field orientation="horizontal" className="w-auto gap-2 pb-1">
                      <Switch
                        id={`variable-required-${variable.key}`}
                        checked={required}
                        onCheckedChange={(next) => patch(variable.key, { required: next })}
                      />
                      <FieldLabel htmlFor={`variable-required-${variable.key}`} className="text-xs">
                        Required
                      </FieldLabel>
                    </Field>
                  </div>

                  {/* One slot in seven ratios is one slot — say which frames carry it. */}
                  <div className="col-span-full flex min-w-0 flex-col gap-0.5 font-mono text-3xs text-muted-foreground">
                    <span className="font-sans text-2xs">After Effects</span>
                    <span className="break-all">{variable.key}</span>
                    <span className="flex flex-wrap gap-x-3">
                      {variable.comps.length ? (
                        variable.comps.map((comp) => (
                          <span key={comp} className="break-all">
                            {comp}
                          </span>
                        ))
                      ) : (
                        <span>Composition not detected</span>
                      )}
                    </span>
                  </div>
                </FieldGroup>
              </AccordionPrimitive.Panel>
            </AccordionItem>
          );
        })}
        {shown.length ? null : (
          <li className="px-[var(--card-pad)] py-2 text-xs text-muted-foreground">
            No variables match this filter.
          </li>
        )}
      </Accordion>

      <div className="border-t border-border">
        <div className="flex min-h-9 max-w-[54rem] items-center justify-between gap-3 px-[var(--card-pad)] py-1">
          <p className="font-mono text-2xs uppercase tracking-wide text-muted-foreground">
            <span>{dirtyCount ? `${dirtyCount} changed` : 'No changes'}</span>
            {claimed.size ? (
              <>
                <span aria-hidden> · </span>
                <span
                  className="text-destructive"
                  title="Two variables claim the same meaning — the fleet refuses that."
                >
                  {`${claimed.size} meaning ${claimed.size === 1 ? 'clash' : 'clashes'}`}
                </span>
              </>
            ) : null}
          </p>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!dirtyCount || saving || claimed.size > 0}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="size-3.5" aria-hidden />
            )}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
