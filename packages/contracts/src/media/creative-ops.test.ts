import { describe, expect, it } from 'bun:test';

import {
  creativeOpsOutputModality,
  creativeOpsRecipeSchema,
  creativeOpsSourceAssetIds,
  creativeOpsTouchesVideo,
  isServerNativeCreativeOp,
} from './creative-ops';

const ASSET_A = '11111111-1111-1111-1111-111111111111';
const ASSET_B = '22222222-2222-2222-2222-222222222222';

const blurThenHeadline = [
  {
    actionId: 'image.blur',
    config: {},
    inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
  },
  {
    actionId: 'image.text',
    config: {},
    inputs: [
      { handle: 'in', from: { step: 0 } },
      { handle: 'text-in', from: { text: 'Half price this week' } },
    ],
  },
];

describe('creativeOpsRecipeSchema', () => {
  it('accepts a blur feeding a burned-in headline', () => {
    const parsed = creativeOpsRecipeSchema.safeParse(blurThenHeadline);
    expect(parsed.success).toBe(true);
  });

  it('refuses a handle the op does not have', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'image.blur',
        config: {},
        inputs: [{ handle: 'nope', from: { assetId: ASSET_A } }],
      },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain('has no "nope" input');
  });

  it('refuses more inputs than the port accepts', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'image.blur',
        config: {},
        inputs: [
          { handle: 'in', from: { assetId: ASSET_A } },
          { handle: 'in', from: { assetId: ASSET_B } },
        ],
      },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain('at most 1');
  });

  it('refuses a step that reads itself or a later step', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      { actionId: 'image.blur', config: {}, inputs: [{ handle: 'in', from: { step: 0 } }] },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain('only read steps before it');
  });

  it('refuses a modality mismatch between a step and the port it feeds', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'image.blur',
        config: {},
        inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
      },
      { actionId: 'video.blur', config: {}, inputs: [{ handle: 'in', from: { step: 0 } }] },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.message.includes('produces image'))).toBe(
      true,
    );
  });

  it('refuses a literal string on a pixel port', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      { actionId: 'image.blur', config: {}, inputs: [{ handle: 'in', from: { text: 'hello' } }] },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain('not a literal string');
  });

  it('validates config against the op registry rather than a second copy of the knobs', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'image.blur',
        config: { radiusPx: 'very' },
        inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
      },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain('config is invalid');
  });

  it('refuses a recipe that ends in text, because there is nothing to register', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'text.concat',
        config: {},
        inputs: [
          { handle: 'in', from: { text: 'Half price' } },
          { handle: 'in', from: { text: 'this week' } },
        ],
      },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain('must end in an image or a video');
  });

  it('allows a text op mid-recipe feeding the headline', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'text.concat',
        config: {},
        inputs: [
          { handle: 'in', from: { text: 'Half price' } },
          { handle: 'in', from: { text: 'this week' } },
        ],
      },
      {
        actionId: 'image.text',
        config: {},
        inputs: [
          { handle: 'in', from: { assetId: ASSET_A } },
          { handle: 'text-in', from: { step: 0 } },
        ],
      },
    ]);
    expect(parsed.success).toBe(true);
  });
});

describe('recipe helpers', () => {
  it('collects every library parent in first-reference order, deduped', () => {
    const recipe = creativeOpsRecipeSchema.parse([
      {
        actionId: 'video.overlay',
        config: {},
        inputs: [
          { handle: 'in', from: { assetId: ASSET_B } },
          { handle: 'overlay-in', from: { assetId: ASSET_A } },
          { handle: 'overlay-in', from: { assetId: ASSET_A } },
        ],
      },
    ]);
    expect(creativeOpsSourceAssetIds(recipe)).toEqual([ASSET_B, ASSET_A]);
  });

  it('reports the final modality and whether anything re-encodes video', () => {
    const stills = creativeOpsRecipeSchema.parse(blurThenHeadline);
    expect(creativeOpsOutputModality(stills)).toBe('image');
    expect(creativeOpsTouchesVideo(stills)).toBe(false);

    const clip = creativeOpsRecipeSchema.parse([
      {
        actionId: 'video.blur',
        config: {},
        inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
      },
    ]);
    expect(creativeOpsOutputModality(clip)).toBe('video');
    expect(creativeOpsTouchesVideo(clip)).toBe(true);
  });

  it('names the ops the server runs natively rather than through a browser', () => {
    expect(isServerNativeCreativeOp('image.removeBackground')).toBe(true);
    expect(isServerNativeCreativeOp('image.blur')).toBe(false);
  });
});

describe('fan-out ops', () => {
  it('refuses a collection-producing op anywhere but the end', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'image.duplicate',
        config: {},
        inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
      },
      { actionId: 'image.blur', config: {}, inputs: [{ handle: 'in', from: { step: 0 } }] },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain('only be the last step');
  });

  it('allows one as the final step', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'video.extractFrames',
        config: {},
        inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
      },
    ]);
    expect(parsed.success).toBe(true);
  });
});

describe('background removal', () => {
  it('refuses to matte another step output, because it has no asset id to register against', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'image.blur',
        config: {},
        inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
      },
      {
        actionId: 'image.removeBackground',
        config: {},
        inputs: [{ handle: 'in', from: { step: 0 } }],
      },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((i) => i.message.includes('must read a library asset'))).toBe(
      true,
    );
  });

  it('accepts one reading a library asset', () => {
    const parsed = creativeOpsRecipeSchema.safeParse([
      {
        actionId: 'image.removeBackground',
        config: {},
        inputs: [{ handle: 'in', from: { assetId: ASSET_A } }],
      },
      { actionId: 'image.blur', config: {}, inputs: [{ handle: 'in', from: { step: 0 } }] },
    ]);
    expect(parsed.success).toBe(true);
  });
});
