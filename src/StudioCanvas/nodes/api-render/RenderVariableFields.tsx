'use client';

import type { ApiRenderVariable, PinnedRenderAsset } from '@continuum/contracts';
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

export function RenderVariableFields({
  definitions,
  values,
  watermarkLogo,
  prepared,
  onChange,
}: {
  definitions: ApiRenderVariable[];
  values: Record<string, string | number | boolean> | undefined;
  watermarkLogo: PinnedRenderAsset | null;
  prepared: boolean;
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
                <Handle
                  type="target"
                  id={`variable-${variable.key}`}
                  position={Position.Left}
                  className="!h-3 !w-3 !bg-brand-primary"
                  style={{ top: '50%' }}
                />
                <span className="text-2xs">
                  Connect a version-pinned {variable.kind} Library node
                </span>
              </>
            ) : variable.kind === 'boolean' ? (
              <input
                className="nodrag"
                type="checkbox"
                checked={Boolean(values?.[variable.key])}
                onChange={(event) => onChange(variable.key, event.target.checked)}
              />
            ) : (
              // Every non-media, non-boolean parameter is a free text (or number) field.
              // The contract has `kind: 'enum'` and an `options` array, but the render
              // fleet's parameter reflection has no enum member and no option list, so
              // the adapter can only ever emit `text` with `options: []`. An AE dropdown
              // — the nine-value watermark position control among them — arrives here
              // with its value set stripped. Offering a picker would mean inventing
              // choices the renderer never named, so this stays an unconstrained field.
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
            )}
          </label>
        ),
      )}
    </>
  );
}
