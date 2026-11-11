import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import { TimelinePreview } from './TimelinePreview';

afterEach(cleanup);

const shaderEffects: ClipEffectSpec = { vignette: { amount: 0.8 } };
const videoPair = (): readonly [
  RefObject<HTMLVideoElement | null>,
  RefObject<HTMLVideoElement | null>,
] => [createRef<HTMLVideoElement>(), createRef<HTMLVideoElement>()];

describe('TimelinePreview effect parity', () => {
  for (const effects of [
    shaderEffects,
    { crop: { left: 0.1, top: 0.05, right: 0.15, bottom: 0.1 } },
  ]) {
    it(`uses the canvas for the base, incoming crossfade, and overlay layer with ${effects === shaderEffects ? 'shaders' : 'crop'}`, () => {
      const { container } = render(
        <TimelinePreview
          videoRefs={videoPair()}
          activeVideo={0}
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

it('shows the active element of the ping-pong pair and keeps the other hidden and silent', () => {
  const refs = videoPair();
  render(
    <TimelinePreview
      videoRefs={refs}
      activeVideo={1}
      showVideo
      isEmpty={false}
      isPlaying
      onTogglePlay={() => undefined}
      playheadSec={2}
      totalSec={4}
      mediaStyle={{ opacity: 0.8 }}
    />,
  );
  const [first, second] = refs.map((ref) => ref.current);
  expect(second?.style.opacity).toBe('0.8');
  expect(second?.muted).toBe(false);
  expect(first?.style.opacity).toBe('0');
  expect(first?.muted).toBe(true);
  expect(first?.getAttribute('preload')).toBe('auto');
});

it('plays a nonempty image/audio sequence without a primary video track', () => {
  render(
    <TimelinePreview
      videoRefs={videoPair()}
      activeVideo={0}
      showVideo={false}
      isEmpty
      isPlaying={false}
      onTogglePlay={() => undefined}
      playheadSec={0}
      totalSec={3}
    />,
  );
  expect(screen.getByRole('button', { name: 'Play preview' }).hasAttribute('disabled')).toBe(false);
  expect(screen.queryByText('Drag clips from the media bin onto the timeline')).toBeNull();
});
