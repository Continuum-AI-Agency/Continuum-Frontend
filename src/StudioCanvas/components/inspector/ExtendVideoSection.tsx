'use client';

// Config for the extendVideo node. Its only setting is the continuation prompt —
// same field the node's own textarea writes, reading from the same store node, so
// the two surfaces cannot disagree.

import { useTranslations as useUiTranslations } from 'next-intl';
import type { ExtendVideoNodeData } from '../../types';
import { InspectorSection, InspectorTextarea } from './controls';

export function ExtendVideoSection({
  data,
  onPatch,
}: {
  data: ExtendVideoNodeData;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const translateUi = useUiTranslations('studio');

  return (
    <InspectorSection title={translateUi('continuation_29f1f4d5')}>
      <InspectorTextarea
        label={translateUi('prompt_5c391238')}
        value={data.prompt ?? ''}
        placeholder={translateUi('what_happens_next_in_the_clip_51604e7e')}
        onChange={(value) => onPatch({ prompt: value })}
      />
    </InspectorSection>
  );
}
