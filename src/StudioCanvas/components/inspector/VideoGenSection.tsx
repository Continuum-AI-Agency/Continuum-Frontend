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
import { useStudioStore } from '../../stores/useStudioStore';
import type { VideoGenNodeData } from '../../types';
import { InspectorNote, InspectorSection, OptionRow } from './controls';

type Resolution = NonNullable<VideoGenNodeData['resolution']>;

/** Veo 3.1 and Fast reach 4K; every other model on the roster tops out at 1080p. */
const resolutionOptions = (model: VideoGeneratorModel): Resolution[] =>
  model === 'veo-3.1' || model === 'veo-3.1-fast' ? ['720p', '1080p', '4k'] : ['720p', '1080p'];

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
  const shape = { type: nodeType, data: data as unknown as Record<string, unknown> };
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
      <InspectorSection title="Model">
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

      <InspectorSection title="Inputs">
        <OptionRow<VideoGeneratorReferenceMode>
          label="Reference mode"
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
            {VIDEO_GENERATOR_MODEL_LABELS[model]} accepts one input mode; it swaps the node&apos;s
            handles when a model that offers a choice is selected.
          </InspectorNote>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Output">
        <OptionRow
          label="Aspect ratio"
          value={data.aspectRatio ?? '16:9'}
          options={[
            { value: '16:9', label: '16:9' },
            { value: '9:16', label: '9:16' },
          ]}
          onChange={(value) => onPatch({ aspectRatio: value })}
        />
        <OptionRow<Resolution>
          label="Resolution"
          value={resolution}
          options={resolutionOptions(model).map((value) => ({ value, label: value }))}
          onChange={(value) => onPatch({ resolution: value })}
        />
        {durationSeconds === undefined ? (
          <InspectorNote>
            {VIDEO_GENERATOR_MODEL_LABELS[model]} has no fixed clip length — duration is set by the
            provider.
          </InspectorNote>
        ) : (
          <>
            <OptionRow<string>
              label="Duration"
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
                {resolution} renders at 8 seconds only — switch to 720p for 4s or 6s.
              </InspectorNote>
            ) : lockedByReference ? (
              <InspectorNote>
                Veo renders 8 seconds only when a reference image or frame is attached — detach it
                for 4s or 6s.
              </InspectorNote>
            ) : null}
          </>
        )}
      </InspectorSection>
    </>
  );
}
