import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { TemplateAuthoringCommand, TemplateAuthoringNode } from '@continuum/contracts';
import { TemplateLayerTimeline } from './TemplateLayerTimeline';

const node = (channelOverrides: Record<string, unknown> = {}) => ({
  nodeId: 'aep:12:4',
  sourceRef: { compId: 12, layerId: 4 },
  name: 'Moving title',
  inSec: 0,
  outSec: 4,
  timingReason: null,
  capabilities: { timing: true, keyframes: true },
  rotation: 0,
  opacity: 100,
  keyframeChannels: [
    {
      channelId: 'position:ADBE Position', channel: 'position', matchName: 'ADBE Position',
      frameRate: 24, dimensions: 3, separated: false, reason: null,
      keyframes: [
        { keyframeId: 'source:abc:position:0', timeSec: 0, value: [10, 20, 7], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [], outEase: [] },
        { keyframeId: 'source:abc:position:24', timeSec: 1, value: [34, 44, 7], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [], outEase: [] },
      ],
      ...channelOverrides,
    },
  ],
} as unknown as TemplateAuthoringNode);

describe('TemplateLayerTimeline', () => {
  afterEach(() => cleanup());

  test('scrubs on the composition frame clock and adds an evaluated key using the private command', () => {
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    const onPlayheadChange = mock((_seconds: number) => {});
    const view = render(
      <TemplateLayerTimeline
        node={node()}
        durationSec={4}
        compositionFrameRate={24}
        playheadSec={0.5}
        onPlayheadChange={onPlayheadChange}
        disabled={false}
        onCommand={onCommand}
      />,
    );

    fireEvent.change(screen.getByRole('slider', { name: 'Timeline playhead' }), { target: { value: String(13 / 24) } });
    expect(onPlayheadChange).toHaveBeenCalledWith(13 / 24);
    view.rerender(
      <TemplateLayerTimeline
        node={node()}
        durationSec={4}
        compositionFrameRate={24}
        playheadSec={13 / 24}
        onPlayheadChange={onPlayheadChange}
        disabled={false}
        onCommand={onCommand}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add at playhead' }));
    const command = onCommand.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      type: 'layer.keyframes.replace',
      nodeId: 'aep:12:4',
      channelId: 'position:ADBE Position',
      channel: 'position',
    });
    if (command?.type !== 'layer.keyframes.replace') throw new Error('Expected a keyframe replacement command');
    expect(command.keyframes).toHaveLength(3);
    expect(command.keyframes[1]).toMatchObject({ timeSec: 13 / 24, value: [23, 33, 7] });
    expect(command.keyframes[0]?.keyframeId).toBe('source:abc:position:0');
    expect(command.keyframes[1]?.keyframeId).toMatch(/^draft:/);
    expect(command.keyframes[2]?.keyframeId).toBe('source:abc:position:24');
  });

  test('keeps an empty XYZ channel unavailable until the exact native starting vector is present', () => {
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    render(
      <TemplateLayerTimeline
        node={node({ keyframes: [] })}
        durationSec={4}
        compositionFrameRate={24}
        playheadSec={0.5}
        onPlayheadChange={() => {}}
        disabled={false}
        onCommand={onCommand}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add at playhead' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('The first key waits for an exact native starting value.')).toBeTruthy();
    expect(onCommand).not.toHaveBeenCalled();
  });

  test('keeps compact timing and motion controls together and omits an empty keyframe track', () => {
    const onMotionOpenChange = mock((_open: boolean) => {});
    render(
      <TemplateLayerTimeline
        node={node({ keyframes: [] })}
        durationSec={4}
        compositionFrameRate={24}
        playheadSec={0.5}
        onPlayheadChange={() => {}}
        disabled={false}
        onCommand={() => {}}
        compact
        onMotionOpenChange={onMotionOpenChange}
      />,
    );

    expect(screen.queryByTestId('keyframe-track')).toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'Layer in time' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Layer out time' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply timing' })).toBeTruthy();
    const editKeyframes = screen.getByRole('button', { name: /Edit keyframes/ });
    fireEvent.click(editKeyframes);
    expect(onMotionOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Add at playhead' })).toBeTruthy();
  });

  test('moves the selected key one native frame and selects adjacent keys for scrubbing', () => {
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    const onPlayheadChange = mock((_seconds: number) => {});
    render(
      <TemplateLayerTimeline node={node()} durationSec={4} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={onPlayheadChange} disabled={false} onCommand={onCommand} />,
    );
    expect(screen.getByText('Frame 1 / 96')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move keyframe one frame later' }));
    const command = onCommand.mock.calls.at(-1)?.[0];
    if (command?.type !== 'layer.keyframes.replace') throw new Error('Expected a keyframe replacement command');
    expect(command.keyframes[0]).toMatchObject({ keyframeId: 'source:abc:position:0', timeSec: 1 / 24 });
    expect(command.keyframes[1]).toMatchObject({ keyframeId: 'source:abc:position:24', timeSec: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Next keyframe' }));
    expect(onPlayheadChange).toHaveBeenCalledWith(1);
  });

  test('does not move a key onto another keyframe', () => {
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    const crowdedNode = node({ keyframes: [
      { keyframeId: 'source:abc:position:0', timeSec: 0, value: [10, 20, 7], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [], outEase: [] },
      { keyframeId: 'source:abc:position:1', timeSec: 1 / 24, value: [11, 21, 7], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [], outEase: [] },
    ] });
    render(
      <TemplateLayerTimeline node={crowdedNode} durationSec={4} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={() => {}} disabled={false} onCommand={onCommand} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move keyframe one frame later' }));
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('same frame');
  });

  test('keeps typed keyframe time local until Enter commits and Escape restores without a command', () => {
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    render(
      <TemplateLayerTimeline node={node()} durationSec={4} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={() => {}} disabled={false} onCommand={onCommand} />,
    );
    const time = screen.getByRole('spinbutton', { name: 'Keyframe time' });
    fireEvent.change(time, { target: { value: '0.5' } });
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.keyDown(time, { key: 'Escape' });
    fireEvent.blur(time);
    expect(onCommand).not.toHaveBeenCalled();
    expect((time as HTMLInputElement).value).toBe('0');
    fireEvent.change(time, { target: { value: '-0.25' } });
    fireEvent.keyDown(time, { key: 'Enter' });
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('within the composition');
    fireEvent.change(time, { target: { value: '1' } });
    fireEvent.keyDown(time, { key: 'Enter' });
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('same frame');
    fireEvent.change(time, { target: { value: '0.5' } });
    fireEvent.keyDown(time, { key: 'Enter' });
    fireEvent.blur(time);
    const command = onCommand.mock.calls.at(-1)?.[0];
    if (command?.type !== 'layer.keyframes.replace') throw new Error('Expected a keyframe replacement command');
    expect(command.keyframes[0]).toMatchObject({ keyframeId: 'source:abc:position:0', timeSec: 0.5 });
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  test('keeps the selected key editor in one compact, accessible control group', () => {
    render(
      <TemplateLayerTimeline node={node()} durationSec={4} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={() => {}} disabled={false} onCommand={() => {}} />,
    );
    const controls = screen.getByRole('group', { name: 'Selected keyframe controls' });
    expect(controls.className).toContain('grid');
    expect(screen.getByRole('spinbutton', { name: 'Keyframe time' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move keyframe one frame earlier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move keyframe one frame later' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Position X value' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Position Y value' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'in interpolation' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'out interpolation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete selected keyframe' })).toBeTruthy();
    expect(screen.getByText('Incoming interpolation')).toBeTruthy();
    expect(screen.getByText('Outgoing interpolation')).toBeTruthy();
  });

  test('keeps a hundred keys reachable in one bounded horizontal rail', () => {
    const manyKeys = node({ keyframes: Array.from({ length: 100 }, (_, index) => ({
      keyframeId: `source:abc:position:${index}`,
      timeSec: index / 24,
      value: [10 + index, 20 + index, 7],
      inInterpolation: 'LINEAR',
      outInterpolation: 'LINEAR',
      inEase: [],
      outEase: [],
    })) });
    const onPlayheadChange = mock((_seconds: number) => {});
    render(
      <TemplateLayerTimeline node={manyKeys} durationSec={6} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={onPlayheadChange} disabled={false} onCommand={() => {}} />,
    );
    const rail = screen.getByRole('list', { name: 'Keyframe key list' });
    expect(rail.className).toContain('overflow-x-auto');
    expect(rail.className).toContain('flex');
    expect(rail.className).not.toContain('flex-wrap');
    expect(rail.querySelectorAll(':scope > li')).toHaveLength(100);
    expect(within(rail).getAllByRole('button', { name: /^Edit Position keyframe/ })).toHaveLength(100);
    expect(screen.getByRole('button', { name: /^Edit Position keyframe 100 at/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next keyframe' }));
    expect(onPlayheadChange).toHaveBeenCalledWith(1 / 24);
  });

  test('previews a dragged key locally, restores on pointer cancel, and commits once on pointer up', () => {
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    render(
      <TemplateLayerTimeline node={node()} durationSec={4} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={() => {}} disabled={false} onCommand={onCommand} />,
    );
    const track = screen.getByTestId('keyframe-track');
    track.getBoundingClientRect = () => ({ left: 100, right: 500, top: 0, bottom: 24, width: 400, height: 24, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    const key = screen.getByRole('button', { name: 'Drag Position keyframe at 0.000 s' });
    fireEvent.pointerDown(key, { pointerId: 7, clientX: 100 });
    fireEvent.pointerMove(key, { pointerId: 7, clientX: 120 });
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Drag Position keyframe at 0.208 s' })).toBeTruthy();
    fireEvent.pointerCancel(key, { pointerId: 7, clientX: 120 });
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Drag Position keyframe at 0.000 s' })).toBeTruthy();

    fireEvent.pointerDown(key, { pointerId: 8, clientX: 100 });
    fireEvent.pointerMove(key, { pointerId: 8, clientX: 120 });
    fireEvent.pointerUp(key, { pointerId: 8, clientX: 120 });
    const command = onCommand.mock.calls.at(-1)?.[0];
    if (command?.type !== 'layer.keyframes.replace') throw new Error('Expected a keyframe replacement command');
    expect(command.keyframes[0]?.keyframeId).toBe('source:abc:position:0');
    expect(command.keyframes[0]?.timeSec).toBeCloseTo(5 / 24, 8);
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  test('creates the first vector key from the exact native base value, preserving Z', () => {
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    render(
      <TemplateLayerTimeline
        node={node({ keyframes: [], baseValue: [12, 34, 56] })}
        durationSec={4}
        compositionFrameRate={24}
        playheadSec={0.5}
        onPlayheadChange={() => {}}
        disabled={false}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add at playhead' }));
    const command = onCommand.mock.calls[0]?.[0];
    if (command?.type !== 'layer.keyframes.replace') throw new Error('Expected a keyframe replacement command');
    expect(command.keyframes).toEqual([expect.objectContaining({ timeSec: 0.5, value: [12, 34, 56] })]);
  });

  test('edits Position Bezier as one Path ease and reports mixed interpolation at the playhead', () => {
    const bezierNode = node({ keyframes: [
      { keyframeId: 'source:abc:position:0', timeSec: 0, value: [10, 20, 7], inInterpolation: 'LINEAR', outInterpolation: 'BEZIER', inEase: [], outEase: [] },
      { keyframeId: 'source:abc:position:24', timeSec: 1, value: [34, 44, 7], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [], outEase: [] },
    ] });
    const onCommand = mock((_command: TemplateAuthoringCommand) => {});
    render(
      <TemplateLayerTimeline
        node={bezierNode}
        durationSec={4}
        compositionFrameRate={24}
        playheadSec={0.5}
        onPlayheadChange={() => {}}
        disabled={false}
        onCommand={onCommand}
      />,
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'out Path ease speed' }), { target: { value: '12' } });
    expect(screen.getByText('Outgoing Path ease')).toBeTruthy();
    expect(screen.queryByText('Outgoing X ease')).toBeNull();
    expect(screen.getByText('Canvas sample unavailable: This segment mixes outgoing BEZIER and incoming LINEAR interpolation.')).toBeTruthy();
    const command = onCommand.mock.calls.at(-1)?.[0];
    if (command?.type !== 'layer.keyframes.replace') throw new Error('Expected a keyframe replacement command');
    expect(command.keyframes[0]?.outInterpolation).toBe('BEZIER');
    expect(command.keyframes[0]?.outEase).toEqual([{ speed: 12, influence: 33.333 }]);
  });

  test('keeps incoming and outgoing Bezier controls side by side without hiding precision fields', () => {
    const bothBezier = node({ keyframes: [
      { keyframeId: 'source:abc:position:0', timeSec: 0, value: [10, 20, 7], inInterpolation: 'BEZIER', outInterpolation: 'BEZIER', inEase: [{ speed: 2, influence: 30 }], outEase: [{ speed: 4, influence: 40 }] },
    ] });
    const view = render(
      <TemplateLayerTimeline node={bothBezier} durationSec={4} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={() => {}} disabled={false} onCommand={() => {}} />,
    );
    const easeControls = screen.getByTestId('motion-ease-controls');
    expect(easeControls.className).toContain('sm:grid-cols-2');
    expect(easeControls.children).toHaveLength(2);
    const help = screen.getByText('Canvas playback evaluates supported Bezier segments from their native speed and influence values.');
    expect(help.className).toContain('sr-only');
    expect(within(easeControls).getByRole('group', { name: 'Incoming Path ease' }).getAttribute('aria-describedby')).toBe(help.id);
    expect(within(easeControls).getByRole('group', { name: 'Outgoing Path ease' }).getAttribute('aria-describedby')).toBe(help.id);
    expect(easeControls.children[0]?.className).not.toContain('sm:grid-cols-2');
    expect(within(easeControls).getByRole('spinbutton', { name: 'in Path ease speed' })).toBeTruthy();
    expect(within(easeControls).getByRole('spinbutton', { name: 'in Path ease influence' })).toBeTruthy();
    expect(within(easeControls).getByRole('spinbutton', { name: 'out Path ease speed' })).toBeTruthy();
    expect(within(easeControls).getByRole('spinbutton', { name: 'out Path ease influence' })).toBeTruthy();

    const scaleNode = { ...node(), keyframeChannels: [{
      channelId: 'scale:ADBE Scale', channel: 'scale', matchName: 'ADBE Scale',
      frameRate: 24, dimensions: 3, separated: false, reason: null,
      keyframes: [{
        keyframeId: 'source:abc:scale:0', timeSec: 0, value: [100, 100, 100],
        inInterpolation: 'BEZIER', outInterpolation: 'BEZIER',
        inEase: [{ speed: 1, influence: 30 }, { speed: 2, influence: 40 }],
        outEase: [{ speed: 3, influence: 50 }, { speed: 4, influence: 60 }],
      }],
    }] } as unknown as TemplateAuthoringNode;
    view.unmount();
    render(
      <TemplateLayerTimeline node={scaleNode} durationSec={4} compositionFrameRate={24} playheadSec={0}
        onPlayheadChange={() => {}} disabled={false} onCommand={() => {}} />,
    );
    const scaleEaseControls = screen.getByTestId('motion-ease-controls');
    expect(scaleEaseControls.children[0]?.className).toContain('sm:grid-cols-2');
    expect(within(scaleEaseControls).getAllByRole('spinbutton')).toHaveLength(8);
  });

  test('does not manufacture a playback clock when the composition rate is missing', () => {
    render(
      <TemplateLayerTimeline
        node={node()}
        durationSec={4}
        compositionFrameRate={null}
        playheadSec={0.5}
        onPlayheadChange={() => {}}
        disabled={false}
        onCommand={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Play' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Timeline playback is unavailable until the composition frame clock is verified.')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Timeline playhead' }).hasAttribute('disabled')).toBe(true);
  });

  test('shows the final native frame and an end marker at an exact duration boundary', () => {
    const view = render(
      <TemplateLayerTimeline node={node()} durationSec={6} compositionFrameRate={30} playheadSec={0}
        onPlayheadChange={() => {}} disabled={false} onCommand={() => {}} />,
    );
    expect(screen.getByText('Frame 1 / 180')).toBeTruthy();
    view.rerender(
      <TemplateLayerTimeline node={node()} durationSec={6} compositionFrameRate={30} playheadSec={179 / 30}
        onPlayheadChange={() => {}} disabled={false} onCommand={() => {}} />,
    );
    expect(screen.getByText('Frame 180 / 180')).toBeTruthy();
    view.rerender(
      <TemplateLayerTimeline node={node()} durationSec={6} compositionFrameRate={30} playheadSec={6}
        onPlayheadChange={() => {}} disabled={false} onCommand={() => {}} />,
    );
    expect(screen.getByText('Frame End / 180')).toBeTruthy();
  });

  test('advances playback by elapsed frame time when an animation callback is delayed', () => {
    const originalRequest = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const originalNow = performance.now;
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
    performance.now = () => 1_000;
    const onPlayheadChange = mock((_seconds: number) => {});
    try {
      render(
        <TemplateLayerTimeline node={node()} durationSec={4} compositionFrameRate={24} playheadSec={0.5}
          onPlayheadChange={onPlayheadChange} disabled={false} onCommand={() => {}} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      const runFrame = (timestamp: number) => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        act(() => pending.forEach((callback) => callback(timestamp)));
      };
      runFrame(1_125);
      expect(onPlayheadChange).toHaveBeenLastCalledWith(15 / 24);
      runFrame(1_500);
      expect(onPlayheadChange).toHaveBeenLastCalledWith(24 / 24);
      expect(onPlayheadChange).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
      performance.now = originalNow;
    }
  });

  test('wraps at the composition end while preserving its starting frame phase', () => {
    const originalRequest = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const originalNow = performance.now;
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
    performance.now = () => 1_000;
    try {
      const onPlayheadChange = mock((_seconds: number) => {});
      render(
        <TemplateLayerTimeline node={node()} durationSec={1} compositionFrameRate={24} playheadSec={23 / 24}
          onPlayheadChange={onPlayheadChange} disabled={false} onCommand={() => {}} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      const pending = [...callbacks.values()];
      callbacks.clear();
      act(() => pending.forEach((callback) => callback(1_042)));
      expect(onPlayheadChange).toHaveBeenCalledWith(0);
    } finally {
      cleanup();
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
      performance.now = originalNow;
    }
  });

  test('stops the playback clock when the user scrubs or the selected node changes', () => {
    const originalRequest = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const originalNow = performance.now;
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
    performance.now = () => 1_000;
    try {
      const onPlayheadChange = mock((_seconds: number) => {});
      const view = render(
        <TemplateLayerTimeline node={node()} durationSec={4} compositionFrameRate={24} playheadSec={0}
          onPlayheadChange={onPlayheadChange} disabled={false} onCommand={() => {}} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      expect(callbacks.size).toBe(1);
      fireEvent.change(screen.getByRole('slider', { name: 'Timeline playhead' }), { target: { value: '0.5' } });
      expect(callbacks.size).toBe(0);
      expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
      view.rerender(
        <TemplateLayerTimeline node={node()} durationSec={4} compositionFrameRate={24} playheadSec={0.5}
          onPlayheadChange={onPlayheadChange} disabled={false} onCommand={() => {}} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      expect(callbacks.size).toBe(1);
      view.rerender(
        <TemplateLayerTimeline node={{ ...node(), nodeId: 'aep:12:5' }} durationSec={4} compositionFrameRate={24} playheadSec={0.5}
          onPlayheadChange={onPlayheadChange} disabled={false} onCommand={() => {}} />,
      );
      expect(callbacks.size).toBe(0);
      expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    } finally {
      cleanup();
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
      performance.now = originalNow;
    }
  });
});
