import { describe, expect, it } from 'bun:test';
import { compositionSpecSchema } from './hyperframes';

const spec = {
  title: 'Launch',
  width: 1280,
  height: 720,
  duration_seconds: 5,
  energy: 'balanced',
  palette: {
    background: '#101010',
    foreground: '#ffffff',
    accent: '#ff5500',
    muted: '#777777',
  },
  typography: {
    headline_family: 'Inter',
    body_family: 'Inter',
    headline_weight: 700,
    body_weight: 400,
  },
  scenes: [
    {
      id: 'hook',
      role: 'hook',
      start_seconds: 0,
      duration_seconds: 2,
      layout: 'centered-title',
      copy: { title: 'Meet motion' },
      motion: {
        verb: 'rise',
        entrance_ease: 'ease-out',
        body_ease: 'linear',
        exit_ease: 'ease-in',
      },
    },
    {
      id: 'development',
      role: 'development',
      start_seconds: 2,
      duration_seconds: 1.5,
      layout: 'split-text-media',
      copy: { title: 'Exact product' },
      asset: { assetId: 'asset-1', assetVersionId: 'version-1' },
      motion: {
        verb: 'reveal',
        entrance_ease: 'ease-out',
        body_ease: 'linear',
        exit_ease: 'ease-in',
      },
    },
    {
      id: 'payoff',
      role: 'payoff',
      start_seconds: 3.5,
      duration_seconds: 1.5,
      layout: 'outro',
      copy: { title: 'Ship it' },
      intentional_hold: true,
      motion: {
        verb: 'hold',
        entrance_ease: 'ease-out',
        body_ease: 'linear',
        exit_ease: 'ease-in',
      },
    },
  ],
};

describe('HyperFrames composition spec', () => {
  it('pins scene media to an exact asset version and carries direction', () => {
    const parsed = compositionSpecSchema.parse(spec);

    expect(parsed.scenes[1]?.asset).toEqual({
      assetId: 'asset-1',
      assetVersionId: 'version-1',
    });
    expect(parsed.scenes[2]?.intentional_hold).toBe(true);
  });

  it('rejects unknown roles, energy, and motion verbs', () => {
    expect(compositionSpecSchema.safeParse({ ...spec, energy: 'chaotic' }).success).toBe(false);
    expect(
      compositionSpecSchema.safeParse({
        ...spec,
        scenes: [{ ...spec.scenes[0], role: 'montage' }, ...spec.scenes.slice(1)],
      }).success,
    ).toBe(false);
    expect(
      compositionSpecSchema.safeParse({
        ...spec,
        scenes: [
          {
            ...spec.scenes[0],
            motion: { ...spec.scenes[0].motion, verb: 'make-it-pop' },
          },
          ...spec.scenes.slice(1),
        ],
      }).success,
    ).toBe(false);
  });
});
