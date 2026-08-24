'use client';

// Config for the nanoGen (image generator) node.
//
// The model roster, its per-model size ladder and its "this model takes no size at
// all" honesty all come from contracts `image-size.ts`. A model that renders one
// fixed size says so instead of offering a picker it does not have.

import {
  type ImageGeneratorModel,
  type ImageSize,
  imageModelOptions,
  imageSizesForModel,
  isImageGeneratorModel,
  supportsImageSize,
} from '@continuum/contracts';
import type { NanoGenNodeData } from '../../types';
import { InspectorNote, InspectorSection, OptionRow } from './controls';

/**
 * The ratios each image model accepts.
 *
 * DUPLICATE of the literal inside `nodes/ImageGenBlock.tsx` — the canvas has no shared
 * accessor for it yet and `packages/contracts/src/ai-studio/` is owned by another shell
 * this wave. It belongs next to IMAGE_MODEL_SIZES in contracts; until it moves, these
 * two lists must be changed together.
 */
const imageAspectRatios = (model: ImageGeneratorModel): string[] => {
  if (model === 'nano-banana-2') return ['1:1', '4:5', '5:4', '16:9', '9:16', '4:3', '3:4'];
  if (model === 'nano-banana-2-lite' || model === 'flux-2-pro' || model === 'flux-2-max') {
    return ['1:1', '4:5', '5:4', '16:9', '9:16', '4:3', '3:4', '21:9'];
  }
  return ['1:1', '16:9', '9:16', '4:3', '3:4'];
};

export function ImageGenSection({
  data,
  onPatch,
}: {
  data: NanoGenNodeData;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const model = isImageGeneratorModel(data.model) ? data.model : 'nano-banana-2-lite';
  const sizes = imageSizesForModel(model);

  return (
    <>
      <InspectorSection title="Model">
        <OptionRow<ImageGeneratorModel>
          label="Generator"
          value={model}
          options={imageModelOptions().map((option) => ({
            value: option.model,
            label: option.label,
            note: option.note,
            disabled: !option.selectable,
          }))}
          onChange={(value) => onPatch({ model: value })}
        />
      </InspectorSection>

      <InspectorSection title="Output">
        {supportsImageSize(model) ? (
          <OptionRow<ImageSize>
            label="Size"
            value={data.imageSize}
            options={sizes.map((value) => ({ value, label: value }))}
            onChange={(value) => onPatch({ imageSize: value })}
          />
        ) : (
          <InspectorNote>This model takes no size parameter — it renders at 1024px.</InspectorNote>
        )}
        <OptionRow
          label="Aspect ratio"
          value={data.aspectRatio || '16:9'}
          options={imageAspectRatios(model).map((value) => ({ value, label: value }))}
          onChange={(value) => onPatch({ aspectRatio: value })}
        />
      </InspectorSection>
    </>
  );
}
