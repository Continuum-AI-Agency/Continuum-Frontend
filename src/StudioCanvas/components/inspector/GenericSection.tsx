'use client';

// The fallback section: a node type with no hand-written section still gets a name
// it can be renamed by, and an honest read of the config it is actually carrying.
//
// Values are shown as `coerceNodeConfig` would leave them, so what the panel prints
// is what a Run will send — not the raw field, which can differ (a 4s duration on a
// 1080p Veo node renders at 8s whatever the row says).

import { coerceNodeConfig, type StudioNodeType } from '@continuum/contracts';
import type { StudioNode } from '../../types';
import { InspectorNote, InspectorSection } from './controls';

// Runtime and output bookkeeping, not configuration. Showing it turns the panel into
// a JSON dump of blobs and signed URLs.
const RUNTIME_KEYS = new Set([
  'label',
  'isExecuting',
  'isComplete',
  'error',
  'errorCode',
  'executionTime',
  'isToolbarVisible',
  'isTourSeed',
  'generationSignature',
]);

const isDisplayableValue = (value: unknown): value is string | number | boolean =>
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (typeof value === 'string' && value.length > 0 && value.length <= 120);

export function GenericSection({
  node,
  onPatch,
}: {
  node: StudioNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const data = node.data as Record<string, unknown>;
  const { data: effective } = coerceNodeConfig((node.type ?? '') as StudioNodeType, data, data);

  const fields = Object.entries(effective)
    .filter(
      ([key, value]) =>
        !RUNTIME_KEYS.has(key) && !key.startsWith('generated') && isDisplayableValue(value),
    )
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <InspectorSection title="Node">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <input
            className="nodrag h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            value={typeof data.label === 'string' ? data.label : ''}
            placeholder={node.type ?? 'Node'}
            onChange={(event) => onPatch({ label: event.target.value })}
          />
        </label>
      </InspectorSection>

      <InspectorSection title="Configuration">
        {fields.length === 0 ? (
          <InspectorNote>This node has no editable configuration.</InspectorNote>
        ) : (
          <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1 text-xs">
            {fields.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="truncate text-muted-foreground">{key}</dt>
                <dd className="truncate text-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </InspectorSection>
    </>
  );
}
