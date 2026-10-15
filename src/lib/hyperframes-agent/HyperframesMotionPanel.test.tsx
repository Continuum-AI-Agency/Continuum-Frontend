import { describe, expect, mock, test } from 'bun:test';
import { applyMotionOp, EMPTY_MOTION_DOC, type MotionDoc } from '@continuum/contracts';
import { fireEvent, render } from '@testing-library/react';
import { dragOp, HyperframesMotionPanel } from './HyperframesMotionPanel';
import { withPlayerRuntime } from './playerClock';

const context = { width: 1920, height: 1080, fps: 30, durationSec: 6 };
const doc: MotionDoc = applyMotionOp(
  EMPTY_MOTION_DOC,
  {
    type: 'add_animation',
    id: 'headline',
    label: 'Headline words in',
    targets: ['w1', 'w2', 'w3'],
    startSec: 0.3,
    tracks: [
      {
        property: 'transform.opacity',
        keys: [
          { t: 0, v: 0, ease: 'easeOut' },
          { t: 0.5, v: 1 },
        ],
      },
    ],
  },
  context,
);
const [headline] = doc.animations;
if (!headline) throw new Error('fixture has no animation');

describe('dragOp', () => {
  test('a bar drag retimes the start', () => {
    expect(dragOp(headline, 'move', 0.5, 6)).toEqual({
      type: 'retime',
      animationId: 'headline',
      startSec: 0.8,
    });
  });

  test('a drag is clamped to the start of the film and to its end', () => {
    expect(dragOp(headline, 'move', -2, 6)).toMatchObject({ startSec: 0 });
    expect(dragOp(headline, 'move', 99, 6)).toMatchObject({ startSec: 5.5 });
  });

  test('an edge drag sets the key span', () => {
    expect(dragOp(headline, 'duration', 0.25, 6)).toEqual({
      type: 'retime',
      animationId: 'headline',
      durationSec: 0.75,
    });
  });

  test('a stagger drag spreads the extra time over the steps between targets', () => {
    expect(dragOp(headline, 'stagger', 0.2, 6)).toEqual({
      type: 'stagger',
      animationId: 'headline',
      eachSec: 0.1,
      from: 'start',
    });
  });

  test('no movement commits nothing', () => {
    expect(dragOp(headline, 'move', 0, 6)).toBeNull();
    expect(dragOp(headline, 'duration', 0, 6)).toBeNull();
  });
});

describe('HyperframesMotionPanel', () => {
  test('lists each animation and reports the selection', () => {
    const onSelectedIdsChange = mock((_ids: string[]) => {});
    const view = render(
      <HyperframesMotionPanel
        doc={doc}
        durationSec={6}
        fps={30}
        playheadSec={0}
        selectedIds={[]}
        onSelectedIdsChange={onSelectedIdsChange}
        onOp={() => {}}
        busy={false}
        status={null}
      />,
    );
    expect(view.getByText('Headline words in')).toBeTruthy();
    fireEvent.click(view.getByLabelText('Select Headline words in'));
    expect(onSelectedIdsChange).toHaveBeenCalledWith(['headline']);
  });

  test('an arrow key nudges the bar by one frame', () => {
    const onOp = mock((_op: unknown) => {});
    const view = render(
      <HyperframesMotionPanel
        doc={doc}
        durationSec={6}
        fps={30}
        playheadSec={0}
        selectedIds={[]}
        onSelectedIdsChange={() => {}}
        onOp={onOp}
        busy={false}
        status={null}
      />,
    );
    fireEvent.keyDown(view.getByRole('slider', { name: 'Headline words in timing' }), {
      key: 'ArrowRight',
    });
    expect(onOp).toHaveBeenCalledWith({ type: 'retime', animationId: 'headline', startSec: 0.333 });
  });
});

describe('withPlayerRuntime', () => {
  test('puts the clock shim before the runtime, inside the body', () => {
    const html = withPlayerRuntime('<html><body><p>hi</p></body></html>', '/runtime.js');
    const shim = html.indexOf('Animation.prototype');
    const runtime = html.indexOf('<script src="/runtime.js">');
    expect(shim).toBeGreaterThan(html.indexOf('<p>hi</p>'));
    expect(runtime).toBeGreaterThan(shim);
    expect(html.endsWith('</script></body></html>')).toBe(true);
  });
});
