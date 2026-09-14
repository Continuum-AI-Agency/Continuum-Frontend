import { describe, expect, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import type { LayerEditorLayer } from '../../types';
import { LayerMotionDock, layerMotionDurationSec } from './LayerMotionDock';

const layer = (over: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id: 'a',
  name: 'a',
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  position: { x: 100, y: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...over,
});

describe('layerMotionDurationSec', () => {
  test('uses the longest key or declared duration, never below 2s', () => {
    expect(layerMotionDurationSec([layer()])).toBe(2);
    expect(layerMotionDurationSec([layer({ durationSec: 5 })])).toBe(5);
    expect(
      layerMotionDurationSec([
        layer({
          keyframes: [
            {
              id: 'k',
              property: 'opacity',
              timeSec: 3.5,
              value: 1,
            },
          ],
        }),
      ]),
    ).toBe(3.5);
  });
});

describe('LayerMotionDock', () => {
  test('seeks the playhead from the dock slider', () => {
    const seeks: number[] = [];
    const view = render(
      <LayerMotionDock
        layers={[layer({ durationSec: 4 })]}
        timeSec={0}
        onSeek={(time) => seeks.push(time)}
      />,
    );
    expect(view.getByTestId('layer-motion-dock')).toBeTruthy();
    fireEvent.change(view.getByLabelText('Layer motion playhead'), { target: { value: '1.5' } });
    expect(seeks.at(-1)).toBe(1.5);
  });
});
