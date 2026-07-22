import { describe, expect, it } from 'bun:test';
import {
  canvasComposeRequestSchema,
  canvasComposerForensicsSchema,
  canvasComposerReferenceSchema,
} from './canvas-compose';

describe('canvas composer references', () => {
  it('accepts only skill and media-library references', () => {
    expect(
      canvasComposerReferenceSchema.parse({ type: 'skill', id: 'skill-1', label: 'Bold hooks' }),
    ).toEqual({ type: 'skill', id: 'skill-1', label: 'Bold hooks' });
    expect(
      canvasComposerReferenceSchema.parse({
        type: 'media_asset',
        id: 'asset-1',
        label: 'Hero product shot',
      }),
    ).toEqual({ type: 'media_asset', id: 'asset-1', label: 'Hero product shot' });
    expect(
      canvasComposerReferenceSchema.safeParse({
        type: 'document',
        id: 'doc-1',
        label: 'Launch brief',
      }).success,
    ).toBe(false);
  });

  it('rejects client-authored asset coordinates', () => {
    expect(
      canvasComposerReferenceSchema.safeParse({
        type: 'media_asset',
        id: 'asset-1',
        label: 'Hero product shot',
        storagePath: 'another-brand/private.png',
      }).success,
    ).toBe(false);
  });

  it('carries a capped reference list on compose requests', () => {
    const request = canvasComposeRequestSchema.parse({
      brandProfileId: 'brand-1',
      roomId: 'room-1',
      prompt: 'Use these references',
      references: [
        { type: 'skill', id: 'skill-1', label: 'Bold hooks' },
        { type: 'media_asset', id: 'asset-1', label: 'Hero product shot' },
      ],
    });
    expect(request.references).toHaveLength(2);

    expect(
      canvasComposeRequestSchema.safeParse({
        brandProfileId: 'brand-1',
        roomId: 'room-1',
        prompt: 'Too many references',
        references: Array.from({ length: 21 }, (_, index) => ({
          type: 'skill',
          id: `skill-${index}`,
          label: `Skill ${index}`,
        })),
      }).success,
    ).toBe(false);
  });
});

describe('canvas composer forensics', () => {
  it('accepts operational metrics without prompt or tool payloads', () => {
    const parsed = canvasComposerForensicsSchema.parse({
      run_id: 'canvas_run_1',
      owner_id: 'user-1',
      brand_id: 'brand-1',
      room_id: 'room-1',
      step_count: 1,
      tool_calls: { inspect_canvas: 1 },
      mutation_count: 0,
      model_calls: [],
      stall_events: [],
      usage_totals: {
        input_tokens: 10,
        output_tokens: 2,
        reasoning_tokens: 0,
        cached_input_tokens: 0,
      },
    });

    expect(parsed.run_id).toBe('canvas_run_1');
    expect('prompt' in parsed).toBe(false);
  });
});
