import { expect, test } from 'bun:test';
import type { NodeOutput } from '../types/execution';
import { selectNodeOutput } from './selectNodeOutput';

const output: NodeOutput = {
  type: 'render',
  outputs: [1, 2].map((index) => ({
    id: 'square',
    kind: 'image',
    fileName: `${index}.png`,
    url: `https://example.test/${index}.png`,
    mimeType: 'image/png',
    width: 100,
    height: 100,
    assetId: `00000000-0000-4000-8000-00000000000${index}`,
    versionId: `00000000-0000-4000-8000-00000000001${index}`,
  })),
};
test('scalar media refuses a batch and numbered handles select the exact version', () => {
  expect(selectNodeOutput(output, 'image')).toBeUndefined();
  expect(selectNodeOutput(output, 'render-image-2')).toMatchObject({
    type: 'image',
    url: 'https://example.test/2.png',
    assetId: '00000000-0000-4000-8000-000000000002',
    assetVersionId: '00000000-0000-4000-8000-000000000012',
  });
});
test('collection preserves every exact output while mixed kinds refuse an untyped collection', () => {
  expect(selectNodeOutput(output, 'collection')).toMatchObject({
    type: 'collection',
    itemType: 'image',
    items: [
      { assetVersionId: '00000000-0000-4000-8000-000000000011' },
      { assetVersionId: '00000000-0000-4000-8000-000000000012' },
    ],
  });
  if (output.type === 'render')
    expect(
      selectNodeOutput(
        {
          ...output,
          outputs: output.outputs.map((item, index) => ({
            ...item,
            kind: index ? 'video' : 'image',
          })),
        },
        'collection',
      ),
    ).toBeUndefined();
});
