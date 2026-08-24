'use client';

// Config for the omniGen node. Gemini Omni Flash is the only model it runs, so the
// single real choice is the output ratio — stated rather than implied by an empty
// picker.

import type { OmniGenNodeData } from '../../types';
import { InspectorNote, InspectorSection, OptionRow } from './controls';

export function OmniGenSection({
  data,
  onPatch,
}: {
  data: OmniGenNodeData;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  // An edit chain is anchored to the ratio its first frame was generated at; changing
  // it mid-chain would re-render the anchor at a different shape.
  const hasChain = (data.variations?.length ?? 0) > 0;

  return (
    <>
      <InspectorSection title="Model">
        <InspectorNote>Gemini Omni Flash — this node runs one model.</InspectorNote>
      </InspectorSection>

      <InspectorSection title="Output">
        <OptionRow
          label="Aspect ratio"
          value={data.aspectRatio ?? '16:9'}
          options={[
            { value: '16:9', label: '16:9', disabled: hasChain },
            { value: '9:16', label: '9:16', disabled: hasChain },
          ]}
          onChange={(value) => onPatch({ aspectRatio: value })}
        />
        {hasChain ? (
          <InspectorNote>
            Locked while this node holds generated variations — the chain is anchored to the ratio
            it started at.
          </InspectorNote>
        ) : null}
      </InspectorSection>
    </>
  );
}
