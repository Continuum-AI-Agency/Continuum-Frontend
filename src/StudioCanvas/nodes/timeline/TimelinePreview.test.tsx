import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import { TimelinePreview } from './TimelinePreview';

afterEach(cleanup);

const shaderEffects: ClipEffectSpec = { vignette: { amount: 0.8 } };

describe('TimelinePreview effect parity', () => {
  for (const effects of [
    shaderEffects,
    { crop: { left: 0.1, top: 0.05, right: 0.15, bottom: 0.1 } },
  ]) {
    it(`uses the canvas for the base, incoming crossfade, and overlay layer with ${effects === shaderEffects ? 'shaders' : 'crop'}`, () => {
      const { container } = render(
        <TimelinePreview
          videoRef={createRef<HTMLVideoElement>()}
          showVideo
          isEmpty={false}
          isPlaying={false}
          onTogglePlay={() => undefined}
          playheadSec={1}
          totalSec={4}
          shaderEffects={effects}
          shaderTimeSec={1}
          crossfade={{
            url: 'blob:incoming',
            kind: 'video',
            opacity: 0.5,
            sourceSec: 0.5,
            playbackRate: 1,
            effects,
            effectTimeSec: 0.5,
          }}
          overlayLayers={[
            {
              id: 'overlay',
              kind: 'video',
              url: 'blob:overlay',
              sourceSec: 1,
              playbackRate: 1,
              muted: true,
              volume: 0,
              effects,
              effectTimeSec: 1,
              mediaStyle: { opacity: 0.75 },
              textOverlays: [],
            },
          ]}
        />,
      );

      expect(screen.getAllByLabelText('Media effect preview')).toHaveLength(3);
      for (const video of container.querySelectorAll('video'))
        expect(video.style.opacity).toBe('0');
    });
  }
});
