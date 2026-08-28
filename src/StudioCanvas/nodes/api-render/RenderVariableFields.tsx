'use client';

import {
  type ApiRenderVariable,
  apiRenderVariableHandleId,
  isConnectableApiRenderVariable,
} from '@continuum/contracts';
import { Handle, Position } from '@xyflow/react';
import { Check, ImageIcon, Lock, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apiRenderVariableLabel } from './resolveApiRenderVariables';

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
  connectedKeys,
  mediaStatus,
  onChange,
}: {
  definitions: ApiRenderVariable[];
  values: Record<string, string | number | boolean> | undefined;
  /** Variable keys whose handle already has an incoming edge. */
  connectedKeys?: ReadonlySet<string>;
  mediaStatus?: ReadonlyMap<string, { connected: number; ready: number }>;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  return (
    <>
      {definitions.map((variable) =>
        variable.reserved ? (
          <LockedDesignKitField key={variable.key} variable={variable} />
        ) : (
          // biome-ignore lint/a11y/noLabelWithoutControl: wraps its own input a few lines below
          <label
            key={variable.key}
            className={cn(
              'relative flex flex-col gap-1 rounded-md border p-2',
              variable.kind === 'image' && 'border-sky-500/30 bg-sky-500/5',
              variable.kind === 'video' && 'border-violet-500/30 bg-violet-500/5',
              !['image', 'video'].includes(variable.kind) && 'border-border/70',
            )}
          >
            <span className="text-2xs text-muted-foreground">
              {apiRenderVariableLabel(variable)}
              {variable.required ? ' *' : ''}
            </span>
            {['image', 'video'].includes(variable.kind) ? (
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
                  {(() => {
                    const status = mediaStatus?.get(variable.key) ?? { connected: 0, ready: 0 };
                    if (status.connected === 0)
                      return <span className="text-muted-foreground">Connect media</span>;
                    if (status.ready !== status.connected)
                      return <span className="text-destructive">Needs Library version</span>;
                    return (
                      <span className="text-emerald-700">
                        {status.ready} ready
                        {!variable.multiple && status.ready > 1 ? ' · variations' : ''}
                      </span>
                    );
                  })()}
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
          </label>
        ),
      )}
    </>
  );
}
