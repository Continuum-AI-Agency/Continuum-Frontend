'use client';

// Config for the omniGen node. Gemini Omni 1.1 Flash is the only model it runs, so the
// real choices are the output shape and the tier it renders at. Prompting, the variation
// library and the edit/extend mode live in the node's editor dialog.

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
        <InspectorNote>Gemini Omni 1.1 Flash — this node runs one model.</InspectorNote>
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
        {/* Deliberately NOT locked with the chain the way the ratio is: raising the
            resolution on an edit turn is how you take a draft up to a delivery master. */}
        <OptionRow
          label="Resolution"
          value={data.resolution ?? '720p'}
          options={[
            { value: '360p', label: '360p' },
            { value: '720p', label: '720p' },
            { value: '1080p', label: '1080p' },
            { value: '4k', label: '4K' },
          ]}
          onChange={(value) => onPatch({ resolution: value })}
        />
        <InspectorNote>
          360p is the draft tier — much faster and cheaper, for comparing directions. Raise it on a
          later turn once the clip is right.
        </InspectorNote>
      </InspectorSection>
    </>
  );
}
