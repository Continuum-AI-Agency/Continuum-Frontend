import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import { TimelinePreview } from './TimelinePreview';

afterEach(cleanup);

const shaderEffects: ClipEffectSpec = { vignette: { amount: 0.8 } };

describe('TimelinePreview shader parity', () => {
  it('uses the GPU preview for the base, incoming crossfade, and overlay layer', () => {
    render(
      <TimelinePreview
        videoRef={createRef<HTMLVideoElement>()}
        showVideo
        isEmpty={false}
        isPlaying={false}
        onTogglePlay={() => undefined}
        playheadSec={1}
        totalSec={4}
        shaderEffects={shaderEffects}
        shaderTimeSec={1}
        crossfade={{
          url: 'blob:incoming',
          kind: 'video',
          opacity: 0.5,
          sourceSec: 0.5,
          playbackRate: 1,
          effects: shaderEffects,
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
            effects: shaderEffects,
            effectTimeSec: 1,
            mediaStyle: { opacity: 0.75 },
            textOverlays: [],
          },
        ]}
      />,
    );

    expect(screen.getAllByLabelText('GPU shader preview')).toHaveLength(3);
  });
});
