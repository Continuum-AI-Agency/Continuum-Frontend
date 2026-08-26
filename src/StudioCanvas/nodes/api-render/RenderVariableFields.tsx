'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderVariable,
  apiRenderVariableHandleId,
  isConnectableApiRenderVariable,
  type PinnedRenderAsset,
} from '@continuum/contracts';
import { Handle, Position } from '@xyflow/react';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/**
 * A pin is two uuids; showing them whole buries the row. Twelve characters is enough to
 * tell two pins apart by eye and to match against a Library row or a bench assertion.
 */
const shortId = (id: string) => id.slice(0, 12);

/**
 * The one variable the caller may not supply. The backend resolves the brand's logo from
 * its durable storage path, validates the bytes, content-addresses them and freezes the
 * resulting `{assetId, versionId}` into the signed confirmation.
 *
 * So the browser does NOTHING here: no upload, no `register-canvas`, no byte copy, no
 * second pin. It renders a locked field and — after preflight — echoes the exact pin the
 * server froze. No `Handle` either: a connectable handle would advertise an input the
 * server refuses with `400 render_reserved_variable`.
 */
function LockedDesignKitField({
  variable,
  pin,
  prepared,
}: {
  variable: ApiRenderVariable;
  pin: PinnedRenderAsset | null;
  prepared: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border/70 bg-muted/40 p-2">
      <span className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden />
        {variable.label}
      </span>
      <Badge variant="muted" className="w-fit">
        Design Kit · Brand logo — filled by Continuum
      </Badge>
      {pin ? (
        <span className="font-mono text-2xs text-muted-foreground">
          Pinned · asset {shortId(pin.assetId)} · version {shortId(pin.versionId)}
        </span>
      ) : prepared ? (
        // The template declares the slot but the confirmation came back without a pin.
        // Saying "pinned" here would claim a freeze that did not happen.
        <span className="text-2xs text-muted-foreground">
          Not pinned in this confirmation — the render will be refused if the brand has no usable
          logo.
        </span>
      ) : (
        <span className="text-2xs text-muted-foreground">
          Resolved and pinned when you prepare the render.
        </span>
      )}
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
  watermarkLogo,
  prepared,
  connectedKeys,
  onChange,
}: {
  definitions: ApiRenderVariable[];
  values: Record<string, string | number | boolean> | undefined;
  watermarkLogo: PinnedRenderAsset | null;
  prepared: boolean;
  /** Variable keys whose handle already has an incoming edge. */
  connectedKeys?: ReadonlySet<string>;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  return (
    <>
      {definitions.map((variable) =>
        variable.reserved ? (
          <LockedDesignKitField
            key={variable.key}
            variable={variable}
            pin={watermarkLogo}
            prepared={prepared}
          />
        ) : (
          // biome-ignore lint/a11y/noLabelWithoutControl: wraps its own input a few lines below
          <label
            key={variable.key}
            className="relative flex flex-col gap-1 rounded border border-border/70 p-2"
          >
            <span className="text-2xs text-muted-foreground">
              {variable.label}
              {variable.required ? ' *' : ''}
            </span>
            {['image', 'video'].includes(variable.kind) ? (
              <>
                <VariableHandle variable={variable} />
                <span className="text-2xs">
                  {variable.multiple
                    ? `Connect up to ${API_RENDER_MEDIA_LIST_MAX} version-pinned ${variable.kind} Library nodes — they render in the order you wire them`
                    : `Connect a version-pinned ${variable.kind} Library node`}
                </span>
              </>
            ) : variable.kind === 'boolean' ? (
              <input
                className="nodrag"
                type="checkbox"
                checked={Boolean(values?.[variable.key])}
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
                  stored — the field read as answered and Prepare then refused it as
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
          </label>
        ),
      )}
    </>
  );
}
