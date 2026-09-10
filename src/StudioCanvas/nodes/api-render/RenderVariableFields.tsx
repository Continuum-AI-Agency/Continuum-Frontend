'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderFitVerdict,
  type ApiRenderInputValue,
  type ApiRenderSlotRole,
  type ApiRenderVariable,
  apiRenderVariableHandleId,
  isConnectableApiRenderVariable,
  type MediaAsset,
  type PinnedRenderAsset,
} from '@continuum/contracts';
import { Handle, Position } from '@xyflow/react';
import { Check, ImageIcon, Library, Lock, Video, X } from 'lucide-react';
import { useState } from 'react';
import { MediaSelectPopover } from '@/components/organic/primitives/MediaSelectPopover';
import { Badge } from '@/components/ui/badge';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { apiRenderVariableLabel } from './resolveApiRenderVariables';

/**
 * The template's own variables, grouped the way the template thinks about them.
 *
 * A flat list of fields named after layers is what a reflection can produce and what a person
 * cannot read. Template Forge assigns each slot a ROLE from a closed product vocabulary, so a
 * price is a price whatever the designer called the layer, and this groups on that — the four
 * groups below are the shape of a promo creative, not of an After Effects project.
 *
 * A template with no roles (the legacy-reflection arm) falls into one unnamed group and looks
 * exactly like it did before. Grouping is an improvement where the facts exist and never a
 * fiction where they do not.
 */

/**
 * The sentinel an optional enum's "Not set…" item carries.
 *
 * Not the empty string: an empty value reads as "no selection" to the Select and the item would
 * be unselectable, which is precisely the state it exists to get back to. Never sent — the
 * handler turns it into a clear.
 */
const UNSET_OPTION = '__unset__';

/** Which section a role belongs to. The order here is the order on screen. */
const GROUPS: ReadonlyArray<{ legend: string; roles: readonly ApiRenderSlotRole[] }> = [
  {
    legend: 'Product',
    roles: ['product_image', 'name', 'description', 'sku', 'external_id', 'quantity'],
  },
  { legend: 'Price', roles: ['price', 'old_price', 'discount_percent', 'currency'] },
  {
    legend: 'Promotion',
    roles: ['promo_start', 'promo_end', 'promo_dates', 'cta_text', 'landing_url', 'legal_text'],
  },
  {
    legend: 'Art direction',
    roles: [
      'brand_logo',
      'background_image',
      'background_color',
      'color_primary',
      'color_secondary',
      'color_accent',
      'color_text',
    ],
  },
];

function groupOf(variable: ApiRenderVariable): string | null {
  if (!variable.role) return null;
  return (
    GROUPS.find((group) => group.roles.includes(variable.role as ApiRenderSlotRole))?.legend ?? null
  );
}

/** The pins a slot currently holds on the node, ignoring anything that is not one. */
function pickedPins(value: ApiRenderInputValue | undefined): PinnedRenderAsset[] {
  if (value === undefined || value === null) return [];
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.filter(
    (candidate): candidate is PinnedRenderAsset =>
      typeof candidate === 'object' && candidate !== null && 'assetId' in candidate,
  );
}

/**
 * A picked Library asset as the wire wants it.
 *
 * `headVersionId` is nullable, and an asset that has none is still perfectly usable: the pin
 * goes out with only its `assetId` and preflight materializes and freezes the exact version.
 */
function pinFromAsset(asset: MediaAsset): PinnedRenderAsset {
  return asset.headVersionId
    ? { assetId: asset.id, versionId: asset.headVersionId }
    : { assetId: asset.id };
}

/** The measured placement verdict, said in one line a person can act on. */
function FitLine({ verdict }: { verdict: ApiRenderFitVerdict | undefined }) {
  if (!verdict) return null;
  if (verdict.state === 'unknown') {
    return (
      <FieldDescription>
        <Badge variant="muted">Measured at Prepare</Badge> {verdict.why}
      </FieldDescription>
    );
  }
  const [left, top, right, bottom] = verdict.clippedPx ?? [0, 0, 0, 0];
  return (
    <FieldDescription>
      <Badge variant={verdict.state === 'clipped' ? 'warning' : 'success'}>
        {verdict.state === 'clipped' ? `Clips ${left}/${top}/${right}/${bottom} px` : 'Fits'}
      </Badge>{' '}
      {verdict.shapeClass ? `${verdict.shapeClass} artwork · ` : ''}
      {verdict.state === 'clipped'
        ? 'estimated — the render is judged against this'
        : 'estimated from the template’s own measurements'}
    </FieldDescription>
  );
}

/**
 * How much of the designer's own room a string is using.
 *
 * `charBudget` is the composed length in the TIGHTEST comp the slot appears in — not a limit
 * After Effects enforces. Past it the text does not fail, it shrinks or overflows, so this
 * warns and never blocks.
 */
function BudgetLine({ variable, value }: { variable: ApiRenderVariable; value: unknown }) {
  if (variable.charBudget == null) return null;
  const used = typeof value === 'string' ? value.length : 0;
  const over = used > variable.charBudget;
  return (
    <FieldDescription>
      <span className={cn('tabular-nums', over && 'text-warning')}>
        {used} / {variable.charBudget}
      </span>{' '}
      characters the design has room for
      {over ? ' — the type shrinks to fit, or overflows' : ''}
    </FieldDescription>
  );
}

function MediaVariableField({
  variable,
  brandId,
  picked,
  status,
  dims,
  onPick,
  onClear,
}: {
  variable: ApiRenderVariable;
  brandId: string | null;
  picked: PinnedRenderAsset[];
  status: { connected: number; ready: number; picked: number };
  dims: { w: number; h: number } | undefined;
  onPick: (value: ApiRenderInputValue, assets: MediaAsset[]) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const max = variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1;
  const wired = status.connected > 0;

  const attach = (assets: MediaAsset[]) => {
    const pins = assets.slice(0, max).map(pinFromAsset);
    if (pins.length === 0) return;
    onPick(variable.multiple ? pins : pins[0]!, assets);
  };

  // Several wires on a SCALAR slot is not an error — it is one render per wire. Saying so here
  // is the only place the canvas explains why the button reads "Render 3".
  const fanOut = !variable.multiple && status.ready > 1 ? ' · variations' : '';
  const state = wired
    ? status.ready === status.connected
      ? { tone: 'success' as const, text: `${status.ready} ready${fanOut}` }
      : { tone: 'destructive' as const, text: 'Not saved in the Library yet' }
    : picked.length > 0
      ? { tone: 'success' as const, text: `${picked.length} from Library` }
      : { tone: 'muted' as const, text: 'Connect media or choose' };

  return (
    <>
      <VariableHandle variable={variable} />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-2xs text-muted-foreground">
          {variable.kind === 'image' ? (
            <ImageIcon className="size-3" aria-hidden />
          ) : (
            <Video className="size-3" aria-hidden />
          )}
          {dims ? `${dims.w}×${dims.h}` : variable.kind === 'image' ? 'Image' : 'Video'}
        </span>
        <Badge variant={state.tone}>{state.text}</Badge>
      </div>
      {brandId ? (
        <div className="flex items-center gap-1">
          <MediaSelectPopover
            brandProfileId={brandId}
            open={open}
            onOpenChange={setOpen}
            initialKind={variable.kind === 'video' ? 'video' : 'image'}
            maxSelectable={max}
            onAttachAssets={attach}
            anchor={
              <button
                type="button"
                // Named per slot, not just "Choose from Library": a template with a hero image
                // and a gallery renders this button twice, and two identically named buttons
                // are indistinguishable to a screen reader.
                aria-label={`${
                  picked.length > 0 ? 'Change selection for' : 'Choose from Library for'
                } ${apiRenderVariableLabel(variable)}`}
                className="nodrag flex w-full items-center justify-center gap-1 rounded-md border border-border/70 px-1.5 py-1 text-2xs text-muted-foreground hover:bg-muted/50"
                onClick={() => setOpen(true)}
              >
                <Library className="size-3" aria-hidden />
                {picked.length > 0 ? 'Change selection' : 'Choose from Library'}
              </button>
            }
          />
          {picked.length > 0 ? (
            <button
              type="button"
              aria-label={`Clear ${apiRenderVariableLabel(variable)}`}
              className="nodrag rounded-md border border-border/70 p-1 text-muted-foreground hover:bg-muted/50"
              onClick={onClear}
            >
              <X className="size-3" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
      {wired && picked.length > 0 ? (
        <FieldDescription>
          Connected — the wired media is used instead of this selection.
        </FieldDescription>
      ) : null}
    </>
  );
}

/**
 * The one variable the caller may not supply. The backend resolves the brand's logo from its
 * durable storage path, validates the bytes, content-addresses them and freezes the resulting
 * `{assetId, versionId}` into the signed confirmation.
 *
 * So the browser does NOTHING here: no upload, no byte copy, no second pin. It renders a locked
 * field. No `Handle` either — a connectable handle would advertise an input the server refuses
 * with `400 render_reserved_variable`.
 */
function LockedDesignKitField({ variable }: { variable: ApiRenderVariable }) {
  return (
    <Field orientation="horizontal" data-disabled>
      <FieldContent>
        <FieldLabel className="flex items-center gap-1.5 text-2xs">
          <Lock className="size-3 text-muted-foreground" aria-hidden />
          <span className="truncate">{apiRenderVariableLabel(variable)}</span>
        </FieldLabel>
      </FieldContent>
      <Badge variant="muted">
        <Check aria-hidden /> Brand logo
      </Badge>
    </Field>
  );
}

/**
 * The handle a wireable variable exposes. Which kinds get one is
 * `isConnectableApiRenderVariable` in the contract, never a kind list kept here: a handle the
 * graph rules refuse is an edge the canvas paints and the render never receives.
 */
function VariableHandle({ variable }: { variable: ApiRenderVariable }) {
  return (
    <Handle
      type="target"
      id={apiRenderVariableHandleId(variable.key)}
      position={Position.Left}
      className="!size-3 !bg-primary"
      style={{ top: '50%' }}
    />
  );
}

function VariableField({
  variable,
  values,
  brandId,
  connectedKeys,
  mediaStatus,
  assetDims,
  fit,
  onChange,
  onClear,
  onPickMedia,
}: {
  variable: ApiRenderVariable;
  values: Record<string, ApiRenderInputValue> | undefined;
  brandId: string | null;
  connectedKeys?: ReadonlySet<string>;
  mediaStatus?: ReadonlyMap<string, { connected: number; ready: number; picked: number }>;
  assetDims?: Record<string, { w: number; h: number }>;
  fit?: ReadonlyMap<string, ApiRenderFitVerdict>;
  onChange: (key: string, value: ApiRenderInputValue) => void;
  onClear: (key: string) => void;
  onPickMedia: (key: string, value: ApiRenderInputValue, assets: MediaAsset[]) => void;
}) {
  if (variable.reserved) return <LockedDesignKitField variable={variable} />;
  const isMedia = variable.kind === 'image' || variable.kind === 'video';
  const value = values?.[variable.key];

  return (
    <Field className="relative">
      <FieldLabel className="text-2xs text-muted-foreground">
        {apiRenderVariableLabel(variable)}
        {variable.required ? ' *' : ''}
      </FieldLabel>
      {isMedia ? (
        <>
          <MediaVariableField
            variable={variable}
            brandId={brandId}
            picked={pickedPins(value)}
            status={mediaStatus?.get(variable.key) ?? { connected: 0, ready: 0, picked: 0 }}
            dims={assetDims?.[variable.key]}
            onPick={(next, assets) => onPickMedia(variable.key, next, assets)}
            onClear={() => onClear(variable.key)}
          />
          <FitLine verdict={fit?.get(variable.key)} />
        </>
      ) : variable.kind === 'boolean' ? (
        <Switch
          className="nodrag"
          checked={value === true}
          onCheckedChange={(next) => onChange(variable.key, next)}
        />
      ) : variable.kind === 'enum' && variable.options.length > 0 ? (
        // Only when the value set actually crossed the boundary. The legacy reflection strips
        // it (`options: []`) and an AE dropdown arrives here as bare text; a picker in that
        // case would invent choices the renderer never named, so the branch below stays an
        // unconstrained field.
        <Select
          value={String(value ?? '')}
          onValueChange={(next) =>
            next === UNSET_OPTION ? onClear(variable.key) : onChange(variable.key, next)
          }
        >
          <SelectTrigger
            className="nodrag h-7 text-xs"
            aria-label={apiRenderVariableLabel(variable)}
          >
            <SelectValue placeholder={variable.required ? 'Choose…' : 'Not set…'} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {/* Clearing an optional variable is a real thing to want, and the placeholder is
                  not selectable, so an explicit item is the only way back to unset. A required
                  one has no such item: unset is not an answer the renderer accepts. */}
              {variable.required ? null : <SelectItem value={UNSET_OPTION}>Not set…</SelectItem>}
              {variable.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        // Text and number. Text also takes a wire, so a caption written upstream reaches the
        // render without being retyped here; the field stays as the fallback and
        // `resolveApiRenderVariables` prefers the wire when there is one. Number does NOT: a
        // handle would replace the field it must keep.
        <>
          {isConnectableApiRenderVariable(variable) ? <VariableHandle variable={variable} /> : null}
          <Input
            className="nodrag h-7 text-xs"
            type={variable.kind === 'number' ? 'number' : 'text'}
            placeholder={variable.sample ?? undefined}
            value={String(value ?? '')}
            onChange={(event) =>
              onChange(
                variable.key,
                variable.kind === 'number' ? Number(event.target.value) : event.target.value,
              )
            }
          />
          <BudgetLine variable={variable} value={value} />
          {connectedKeys?.has(variable.key) ? (
            <FieldDescription>
              Connected — the wired text is used instead of this field.
            </FieldDescription>
          ) : null}
        </>
      )}
    </Field>
  );
}

export function RenderVariableFields(props: {
  definitions: ApiRenderVariable[];
  values: Record<string, ApiRenderInputValue> | undefined;
  /** Whose Library the picker browses. Without it the slot is wire-only. */
  brandId?: string | null;
  /** Variable keys whose handle already has an incoming edge. */
  connectedKeys?: ReadonlySet<string>;
  mediaStatus?: ReadonlyMap<string, { connected: number; ready: number; picked: number }>;
  assetDims?: Record<string, { w: number; h: number }>;
  /** The placement verdict per media key, computed locally as soon as artwork is chosen. */
  fit?: ReadonlyMap<string, ApiRenderFitVerdict>;
  onChange: (key: string, value: ApiRenderInputValue) => void;
  onClear: (key: string) => void;
  onPickMedia: (key: string, value: ApiRenderInputValue, assets: MediaAsset[]) => void;
}) {
  const { definitions, brandId, ...spread } = props;
  // Normalised once: `undefined` and `null` both mean "no Library to browse", and letting two
  // spellings of that reach the field would make every consumer re-decide it.
  const rest = { ...spread, brandId: brandId ?? null };
  const named = GROUPS.map((group) => ({
    legend: group.legend,
    variables: definitions.filter((variable) => groupOf(variable) === group.legend),
  })).filter((group) => group.variables.length > 0);
  const ungrouped = definitions.filter((variable) => groupOf(variable) === null);

  return (
    <FieldGroup className="gap-2">
      {named.map((group) => (
        <FieldSet key={group.legend} className="gap-1.5">
          <FieldLegend variant="label" className="text-2xs text-muted-foreground">
            {group.legend}
          </FieldLegend>
          {group.variables.map((variable) => (
            <VariableField key={variable.key} variable={variable} {...rest} />
          ))}
        </FieldSet>
      ))}
      {/* No legend: a template whose slots carry no roles must not grow a heading that implies
          the others were sorted out of it. */}
      {ungrouped.map((variable) => (
        <VariableField key={variable.key} variable={variable} {...rest} />
      ))}
    </FieldGroup>
  );
}

// The pin helpers, for surfaces that take the same Library picks in a different frame.
export { pickedPins, pinFromAsset };
