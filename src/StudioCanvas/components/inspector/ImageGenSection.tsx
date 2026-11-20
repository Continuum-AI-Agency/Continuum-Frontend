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
import { useTranslations as useUiTranslations } from 'next-intl';
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
  const translateUi = useUiTranslations('studio');

  const model = isImageGeneratorModel(data.model) ? data.model : 'nano-banana-2-lite';
  const sizes = imageSizesForModel(model);

  return (
    <>
      <InspectorSection title={translateUi('model_5e2c614c')}>
        <OptionRow<ImageGeneratorModel>
          label={translateUi('generator_1ade60ab')}
          value={model}
          options={imageModelOptions(undefined, model).map((option) => ({
            value: option.model,
            label: option.label,
            note: option.note,
            disabled: !option.selectable,
          }))}
          onChange={(value) => onPatch({ model: value })}
        />
      </InspectorSection>

      <InspectorSection title={translateUi('output_b2439bcb')}>
        {supportsImageSize(model) ? (
          <OptionRow<ImageSize>
            label={translateUi('size_1af85190')}
            value={data.imageSize}
            options={sizes.map((value) => ({ value, label: value }))}
            onChange={(value) => onPatch({ imageSize: value })}
          />
        ) : (
          <InspectorNote>
            {translateUi('this_model_takes_no_size_parameter__9337720c')}
          </InspectorNote>
        )}
        <OptionRow
          label={translateUi('aspect_ratio_d7ad336f')}
          value={data.aspectRatio || '16:9'}
          options={imageAspectRatios(model).map((value) => ({ value, label: value }))}
          onChange={(value) => onPatch({ aspectRatio: value })}
        />
      </InspectorSection>
    </>
  );
}
