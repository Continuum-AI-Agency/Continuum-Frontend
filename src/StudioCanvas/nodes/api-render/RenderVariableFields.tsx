'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderInputValue,
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
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apiRenderVariableLabel } from './resolveApiRenderVariables';

/**
 * A picked Library asset as the wire wants it.
 *
 * `headVersionId` is nullable, and an asset that has none is still perfectly usable: the
 * pin goes out with only its `assetId` and preflight materializes and freezes the exact
 * version. Inventing a version here — or refusing the asset — is what the node used to do.
 */
/** The pins a slot currently holds on the node, ignoring anything that is not one. */
function pickedPins(value: ApiRenderInputValue | undefined): PinnedRenderAsset[] {
  if (value === undefined || value === null) return [];
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.filter(
    (candidate): candidate is PinnedRenderAsset =>
      typeof candidate === 'object' && candidate !== null && 'assetId' in candidate,
  );
}

function pinFromAsset(asset: MediaAsset): PinnedRenderAsset {
  return asset.headVersionId
    ? { assetId: asset.id, versionId: asset.headVersionId }
    : { assetId: asset.id };
}

/**
 * A media slot: wire one in, or choose from the Library. Both fill the same slot, and the
 * wire wins while it exists — `resolveApiRenderVariables` owns that precedence, so this
 * only has to SAY which one is being used.
 */
function MediaVariableField({
  variable,
  brandId,
  picked,
  status,
  onPick,
  onClear,
}: {
  variable: ApiRenderVariable;
  brandId: string | null;
  picked: PinnedRenderAsset[];
  status: { connected: number; ready: number; picked: number };
  onPick: (value: ApiRenderInputValue) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const max = variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1;
  const wired = status.connected > 0;

  const attach = (assets: MediaAsset[]) => {
    const pins = assets.slice(0, max).map(pinFromAsset);
    if (pins.length === 0) return;
    onPick(variable.multiple ? pins : pins[0]!);
  };

  // Several wires on a SCALAR slot is not an error — it is one render per wire. Saying so
  // here is the only place the canvas explains why the button reads "Render 3".
  const fanOut = !variable.multiple && status.ready > 1 ? ' · variations' : '';
  const state = wired
    ? status.ready === status.connected
      ? { tone: 'text-emerald-700', text: `${status.ready} ready${fanOut}` }
      : { tone: 'text-destructive', text: 'Not saved in the Library yet' }
    : picked.length > 0
      ? { tone: 'text-emerald-700', text: `${picked.length} from Library` }
      : { tone: 'text-muted-foreground', text: 'Connect media or choose' };

  return (
    <>
      <VariableHandle variable={variable} />
      <span className="flex items-center justify-between gap-2 text-2xs">
        <span className="flex items-center gap-1">
          {variable.kind === 'image' ? (
            <ImageIcon className="size-3 text-sky-600" aria-hidden />
          ) : (
            <Video className="size-3 text-violet-600" aria-hidden />
          )}
          {variable.kind === 'image' ? 'Images' : 'Videos'}
        </span>
        <span className={state.tone}>{state.text}</span>
      </span>
      {brandId ? (
        <span className="flex items-center gap-1">
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
                // Named per slot, not just "Choose from Library": a template with a
                // hero image and a gallery renders this button twice, and two identically
                // named buttons are indistinguishable to a screen reader.
                aria-label={`${
                  picked.length > 0 ? 'Change selection for' : 'Choose from Library for'
                } ${apiRenderVariableLabel(variable)}`}
                className="nodrag flex w-full items-center justify-center gap-1 rounded border border-border/70 px-1.5 py-1 text-2xs text-muted-foreground hover:bg-muted/50"
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
              className="nodrag rounded border border-border/70 p-1 text-muted-foreground hover:bg-muted/50"
              onClick={onClear}
            >
              <X className="size-3" aria-hidden />
            </button>
          ) : null}
        </span>
      ) : null}
      {wired && picked.length > 0 ? (
        <span className="text-2xs text-muted-foreground">
          Connected — the wired media is used instead of this selection.
        </span>
      ) : null}
    </>
  );
}

/**
 * The one variable the caller may not supply. The backend resolves the brand's logo from
 * its durable storage path, validates the bytes, content-addresses them and freezes the
 * resulting `{assetId, versionId}` into the signed confirmation.
 *
 * So the browser does NOTHING here: no upload, no `register-canvas`, no byte copy, no
 * second pin. It renders a locked field. No `Handle` either: a connectable handle would
 * advertise an input the server refuses with `400 render_reserved_variable`.
 */
function LockedDesignKitField({ variable }: { variable: ApiRenderVariable }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
      <span className="flex min-w-0 items-center gap-1.5 text-2xs">
        <Lock className="size-3 text-muted-foreground" aria-hidden />
        <span className="truncate">{apiRenderVariableLabel(variable)}</span>
      </span>
      <Badge variant="muted" className="shrink-0 gap-1">
        <Check className="size-3" aria-hidden /> Brand logo
      </Badge>
    </div>
  );
}

/**
 * The handle a wireable variable exposes. Which kinds get one is
 * `isConnectableApiRenderVariable` in the contract, never a kind list kept here: a handle
 * the graph rules refuse is an edge the canvas paints and the render never receives.
 */
function VariableHandle({ variable }: { variable: ApiRenderVariable }) {
  return (
    <Handle
      type="target"
      id={apiRenderVariableHandleId(variable.key)}
      position={Position.Left}
      className="!h-3 !w-3 !bg-brand-primary"
      style={{ top: '50%' }}
    />
  );
}

export function RenderVariableFields({
  definitions,
  values,
  brandId,
  connectedKeys,
  mediaStatus,
  onChange,
  onClear,
}: {
  definitions: ApiRenderVariable[];
  values: Record<string, ApiRenderInputValue> | undefined;
  /** Whose Library the picker browses. Without it the slot is wire-only. */
  brandId?: string | null;
  /** Variable keys whose handle already has an incoming edge. */
  connectedKeys?: ReadonlySet<string>;
  mediaStatus?: ReadonlyMap<string, { connected: number; ready: number; picked: number }>;
  onChange: (key: string, value: ApiRenderInputValue) => void;
  onClear: (key: string) => void;
}) {
  return (
    <>
      {definitions.map((variable) => {
        // A media slot is a HANDLE plus buttons — there is no single control for a label
        // to name, and wrapping one in `<label>` made the label forward every inner click
        // to its first labelable descendant: pressing Clear also opened the picker. Every
        // other kind still wraps its own input, which is what a label is for.
        const isMedia = variable.kind === 'image' || variable.kind === 'video';
        const Field = isMedia ? 'div' : 'label';
        return variable.reserved ? (
          <LockedDesignKitField key={variable.key} variable={variable} />
        ) : (
          // biome-ignore lint/a11y/noLabelWithoutControl: wraps its own input a few lines below
          <Field
            key={variable.key}
            className={cn(
              'relative flex flex-col gap-1 rounded-md border p-2',
              variable.kind === 'image' && 'border-sky-500/30 bg-sky-500/5',
              variable.kind === 'video' && 'border-violet-500/30 bg-violet-500/5',
              !isMedia && 'border-border/70',
            )}
          >
            <span className="text-2xs text-muted-foreground">
              {apiRenderVariableLabel(variable)}
              {variable.required ? ' *' : ''}
            </span>
            {isMedia ? (
              <MediaVariableField
                variable={variable}
                brandId={brandId ?? null}
                picked={pickedPins(values?.[variable.key])}
                status={mediaStatus?.get(variable.key) ?? { connected: 0, ready: 0, picked: 0 }}
                onPick={(value) => onChange(variable.key, value)}
                onClear={() => onClear(variable.key)}
              />
            ) : variable.kind === 'boolean' ? (
              <input
                className="nodrag"
                type="checkbox"
                checked={values?.[variable.key] === true}
                onChange={(event) => onChange(variable.key, event.target.checked)}
              />
            ) : variable.kind === 'enum' && variable.options.length > 0 ? (
              // Only when the value set actually crossed the boundary. The legacy
              // reflection strips it (`options: []`) and an AE dropdown — the nine-value
              // watermark position control among them — arrives here as bare text; a
              // picker in that case would invent choices the renderer never named, so
              // the empty-option branch below stays an unconstrained field.
              <select
                className="nodrag h-7 rounded-md border border-border bg-background px-2 text-xs"
                value={String(values?.[variable.key] ?? '')}
                onChange={(event) => onChange(variable.key, event.target.value)}
              >
                {/*
                  Always present, so an empty required enum SHOWS empty. Dropping it left
                  the browser painting option one as selected while '' was what the node
                  stored — the field read as answered while the stored value was still
                  missing. Disabled when required so the placeholder cannot be chosen back
                  as if it were an answer; left selectable otherwise, because clearing an
                  optional variable is a real thing to want.
                */}
                <option value="" disabled={variable.required}>
                  {variable.required ? 'Choose…' : 'Not set…'}
                </option>
                {variable.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              // Text and number. Text also takes a wire, so a caption written upstream
              // reaches the render without being retyped here; the field stays as the
              // fallback and `resolveApiRenderVariables` prefers the wire when there is
              // one. Number does NOT: a handle would replace the field it must keep.
              <>
                {isConnectableApiRenderVariable(variable) ? (
                  <VariableHandle variable={variable} />
                ) : null}
                <Input
                  className="nodrag h-7 text-xs"
                  type={variable.kind === 'number' ? 'number' : 'text'}
                  value={String(values?.[variable.key] ?? '')}
                  onChange={(event) =>
                    onChange(
                      variable.key,
                      variable.kind === 'number' ? Number(event.target.value) : event.target.value,
                    )
                  }
                />
                {connectedKeys?.has(variable.key) ? (
                  <span className="text-2xs text-muted-foreground">
                    Connected — the wired text is used instead of this field.
                  </span>
                ) : null}
              </>
            )}
          </Field>
        );
      })}
    </>
  );
}
