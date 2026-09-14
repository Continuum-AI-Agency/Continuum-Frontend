import { describe, expect, mock, test } from 'bun:test';
import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import { fireEvent, render } from '@testing-library/react';
import { MotionTimeline } from './MotionTimeline';

const project = editorProjectV2Schema.parse({
  ...createEditorProjectV2({
    projectId: '11111111-1111-4111-8111-111111111111',
    title: 'Motion',
    width: 1080,
    height: 1920,
  }),
  durationSec: 4,
  tracks: [
    {
      id: 'overlay-1',
      name: 'Overlays',
      kind: 'overlay',
      order: 0,
      clips: [
        {
          id: 'logo',
          name: 'Logo',
          kind: 'overlay',
          mediaKind: 'image',
          timelineStartSec: 1,
          durationSec: 2,
          source: { sourceType: 'library_asset', assetId: 'a', renditionId: 'v' },
          keyframes: [
            {
              id: 'fade-1:transform.opacity:in',
              property: 'transform.opacity',
              timeSec: 0,
              value: 0,
              interpolation: 'linear',
            },
            {
              id: 'fade-1:transform.opacity:out',
              property: 'transform.opacity',
              timeSec: 0.4,
              value: 1,
              interpolation: 'linear',
            },
          ],
        },
      ],
    },
  ],
});

describe('MotionTimeline', () => {
  test('exposes save, place, graph, and style-trim controls', () => {
    const onSaveElement = mock(() => undefined);
    const onPlaceElement = mock(() => undefined);
    const onTrimStyle = mock(() => undefined);
    const view = render(
      <MotionTimeline
        project={project}
        playheadSec={1}
        pxPerSec={80}
        autoKey={false}
        playbackMode="once"
        isPlaying={false}
        selectedClipId="logo"
        canSaveElement
        motionElements={[{ id: 'el-1', name: 'Logo fade' }]}
        onSelectClip={() => undefined}
        onSeek={() => undefined}
        onToggleAutoKey={() => undefined}
        onTogglePlay={() => undefined}
        onCyclePlayback={() => undefined}
        onAddKeyframe={() => undefined}
        onApplyStyle={() => undefined}
        onPatchKeyframe={() => undefined}
        onTrimStyle={onTrimStyle}
        onSaveElement={onSaveElement}
        onPlaceElement={onPlaceElement}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Save Element' }));
    expect(onSaveElement).toHaveBeenCalledTimes(1);
    fireEvent.change(view.getByLabelText('Place motion Element'), { target: { value: 'el-1' } });
    expect(onPlaceElement).toHaveBeenCalledWith('el-1');
    expect(view.getByTestId('motion-graph')).toBeTruthy();
    fireEvent.pointerDown(view.getByLabelText('Trim style end'), {
      clientX: 200,
      pointerId: 1,
    });
    fireEvent.pointerUp(view.getByLabelText('Trim style end'), {
      clientX: 200,
      pointerId: 1,
    });
    expect(onTrimStyle).toHaveBeenCalled();
  });
});
