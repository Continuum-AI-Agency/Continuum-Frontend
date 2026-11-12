'use client';

// Config for the videoGen / veoDirector / veoFast family.
//
// Every option list is derived from contracts, never re-declared: the reference modes
// a model accepts decide which HANDLES the node draws, and the resolution/duration
// pair is one setting on Veo. A hand-kept list here would drift into a node that looks
// configured and 400s at Run.

import {
  coerceVideoGeneratorDuration,
  getVideoGeneratorReferenceModes,
  getVideoGeneratorResolutions,
  resolveVideoGeneratorModel,
  resolveVideoGeneratorReferenceMode,
  VIDEO_GENERATOR_DURATIONS,
  VIDEO_GENERATOR_MODEL_GROUPS,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_REFERENCE_MODE_LABELS,
  type VideoGeneratorModel,
  type VideoGeneratorReferenceMode,
  videoReferencesRequireEightSeconds,
  videoResolutionRequiresEightSeconds,
} from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useStudioStore } from '../../stores/useStudioStore';
import type { VideoGenNodeData } from '../../types';
import { InspectorNote, InspectorSection, OptionRow } from './controls';

type Resolution = NonNullable<VideoGenNodeData['resolution']>;

export function VideoGenSection({
  nodeId,
  nodeType,
  data,
  onPatch,
}: {
  nodeId: string;
  nodeType: string;
  data: VideoGenNodeData;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const translateUi = useUiTranslations('studio');

  const shape = {
    type: nodeType,
    data: data as unknown as Record<string, unknown>,
  };
  const model = resolveVideoGeneratorModel(shape);
  const referenceMode = resolveVideoGeneratorReferenceMode(shape);
  const referenceModes = getVideoGeneratorReferenceModes(model);
  const resolution = (data.resolution ?? '720p') as Resolution;

  // Reference presence lives on the EDGES, not on the node's own data, so the panel has
  // to read the graph — otherwise it offers 4s on a node whose attached reference has
  // already pinned it to 8s. From the STORE, not React Flow's useEdges: an inspector
  // section renders in a side panel with no ReactFlowProvider above it, which is what
  // the sibling ApiRenderSection reads too.
  const edges = useStudioStore((state) => state.edges);
  const hasReferenceInput = edges.some(
    (edge) =>
      edge.target === nodeId &&
      ['ref-image', 'ref-images', 'first-frame', 'last-frame'].includes(edge.targetHandle ?? ''),
  );

  const lockedByResolution = videoResolutionRequiresEightSeconds(model, resolution);
  const lockedByReference = videoReferencesRequireEightSeconds(model, hasReferenceInput);
  const lockedToEightSeconds = lockedByResolution || lockedByReference;
  // What the node will ACTUALLY render at, not what is merely stored.
  const durationSeconds = coerceVideoGeneratorDuration(
    model,
    resolution,
    data.durationSeconds,
    hasReferenceInput,
  );

  return (
    <>
      <InspectorSection title={translateUi('model_5e2c614c')}>
        {VIDEO_GENERATOR_MODEL_GROUPS.map((group) => (
          <OptionRow<VideoGeneratorModel>
            key={group.provider}
            label={group.label}
            value={model}
            options={group.models.map((option) => ({
              value: option,
              label: VIDEO_GENERATOR_MODEL_LABELS[option],
            }))}
            onChange={(value) => onPatch({ model: value })}
          />
        ))}
      </InspectorSection>

      <InspectorSection title={translateUi('inputs_7abc49df')}>
        <OptionRow<VideoGeneratorReferenceMode>
          label={translateUi('reference_mode_aa5925c1')}
          value={referenceMode}
          options={referenceModes.map((option) => ({
            value: option,
            label: VIDEO_GENERATOR_REFERENCE_MODE_LABELS[option],
            disabled: referenceModes.length === 1,
          }))}
          onChange={(value) => onPatch({ referenceMode: value })}
        />
        {referenceModes.length === 1 ? (
          <InspectorNote>
            {VIDEO_GENERATOR_MODEL_LABELS[model]}{' '}
            {translateUi('accepts_one_input_mode_it_swaps_the_1f5e5723')}{' '}
          </InspectorNote>
        ) : null}
      </InspectorSection>

      <InspectorSection title={translateUi('output_b2439bcb')}>
        <OptionRow
          label={translateUi('aspect_ratio_d7ad336f')}
          value={data.aspectRatio ?? '16:9'}
          options={[
            { value: '16:9', label: '16:9' },
            { value: '9:16', label: '9:16' },
          ]}
          onChange={(value) => onPatch({ aspectRatio: value })}
        />
        <OptionRow<Resolution>
          label={translateUi('resolution_d4055faf')}
          value={resolution}
          options={getVideoGeneratorResolutions(model).map((value) => ({
            value,
            label: value,
          }))}
          onChange={(value) => onPatch({ resolution: value })}
        />
        {durationSeconds === undefined ? (
          <InspectorNote>
            {VIDEO_GENERATOR_MODEL_LABELS[model]}{' '}
            {translateUi('has_no_fixed_clip_length_duration_i_908abbcb')}{' '}
          </InspectorNote>
        ) : (
          <>
            <OptionRow<string>
              label={translateUi('duration_4fc52a3c')}
              value={String(durationSeconds)}
              options={VIDEO_GENERATOR_DURATIONS.map((seconds) => ({
                value: String(seconds),
                label: `${seconds}s`,
                disabled: lockedToEightSeconds && seconds !== 8,
              }))}
              onChange={(value) => onPatch({ durationSeconds: Number(value) })}
            />
            {lockedByResolution ? (
              <InspectorNote>
                {resolution} {translateUi('renders_at_8_seconds_only_switch_to_2710bbeb')}{' '}
              </InspectorNote>
            ) : lockedByReference ? (
              <InspectorNote>
                {' '}
                {translateUi('veo_renders_8_seconds_only_when_a_r_7ec91003')}{' '}
              </InspectorNote>
            ) : null}
          </>
        )}
      </InspectorSection>
    </>
  );
}
