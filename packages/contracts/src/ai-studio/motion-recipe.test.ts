import { describe, expect, test } from 'bun:test';
import { applyMotionRecipe, motionRecipeFromClip, parseMotionRecipe } from './motion-recipe';

const key = {
  id: 'op-0',
  property: 'transform.opacity' as const,
  timeSec: 1,
  value: 0,
  interpolation: 'linear' as const,
};

describe('motion recipes', () => {
  test('round-trips a clip into a recipe and back onto a longer clip', () => {
    const recipe = motionRecipeFromClip({ durationSec: 2, keyframes: [key] });
    expect(recipe?.durationSec).toBe(2);
    const parsed = parseMotionRecipe(recipe);
    expect(parsed?.keyframes).toHaveLength(1);
    const placed = applyMotionRecipe(
      {
        id: 'logo',
        kind: 'overlay',
        mediaKind: 'image',
        timelineStartSec: 0,
        durationSec: 4,
        source: { sourceType: 'library_asset', assetId: 'a', renditionId: 'v' },
        transform: {
          position: { x: 0.5, y: 0.5, unit: 'normalized' },
          scaleX: 1,
          scaleY: 1,
          rotationDeg: 0,
          rotateXDeg: 0,
          rotateYDeg: 0,
          perspective: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          opacity: 1,
        },
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        blendMode: 'normal',
        effects: [],
        keyframes: [],
        enabled: true,
        locked: false,
        tags: [],
        sourceInSec: 0,
      },
      parsed as NonNullable<typeof parsed>,
    );
    expect(placed.keyframes[0]?.timeSec).toBe(2);
  });
});
