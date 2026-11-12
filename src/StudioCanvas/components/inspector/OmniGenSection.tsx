'use client';

// Config for the omniGen node. Gemini Omni 1.1 Flash is the only model it runs, so the
// real choices are the output shape and the tier it renders at. Prompting, the variation
// library and the edit/extend mode live in the node's editor dialog.

import { useTranslations as useUiTranslations } from 'next-intl';
import type { OmniGenNodeData } from '../../types';
import { InspectorNote, InspectorSection, OptionRow } from './controls';

export function OmniGenSection({
  data,
  onPatch,
}: {
  data: OmniGenNodeData;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const translateUi = useUiTranslations('studio');

  // An edit chain is anchored to the ratio its first frame was generated at; changing
  // it mid-chain would re-render the anchor at a different shape.
  const hasChain = (data.variations?.length ?? 0) > 0;

  return (
    <>
      <InspectorSection title={translateUi('model_5e2c614c')}>
        <InspectorNote>{translateUi('gemini_omni_1_1_flash_this_node_run_fb292f5f')}</InspectorNote>
      </InspectorSection>

      <InspectorSection title={translateUi('output_b2439bcb')}>
        <OptionRow
          label={translateUi('aspect_ratio_d7ad336f')}
          value={data.aspectRatio ?? '16:9'}
          options={[
            { value: '16:9', label: '16:9', disabled: hasChain },
            { value: '9:16', label: '9:16', disabled: hasChain },
          ]}
          onChange={(value) => onPatch({ aspectRatio: value })}
        />
        {hasChain ? (
          <InspectorNote>
            {' '}
            {translateUi('locked_while_this_node_holds_genera_7e165549')}{' '}
          </InspectorNote>
        ) : null}
        {/* Deliberately NOT locked with the chain the way the ratio is: raising the
            resolution on an edit turn is how you take a draft up to a delivery master. */}
        <OptionRow
          label={translateUi('resolution_d4055faf')}
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
          {' '}
          {translateUi('360p_is_the_draft_tier_much_faster__c2f1440a')}{' '}
        </InspectorNote>
      </InspectorSection>
    </>
  );
}
