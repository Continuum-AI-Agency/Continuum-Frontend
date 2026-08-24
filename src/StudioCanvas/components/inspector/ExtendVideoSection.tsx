'use client';

// Config for the extendVideo node. Its only setting is the continuation prompt —
// same field the node's own textarea writes, reading from the same store node, so
// the two surfaces cannot disagree.

import type { ExtendVideoNodeData } from '../../types';
import { InspectorSection, InspectorTextarea } from './controls';

export function ExtendVideoSection({
  data,
  onPatch,
}: {
  data: ExtendVideoNodeData;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <InspectorSection title="Continuation">
      <InspectorTextarea
        label="Prompt"
        value={data.prompt ?? ''}
        placeholder="What happens next in the clip"
        onChange={(value) => onPatch({ prompt: value })}
      />
    </InspectorSection>
  );
}
