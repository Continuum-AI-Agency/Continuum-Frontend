import { describe, expect, it } from 'bun:test';
import { assertVeoFrameMode, planContactSheetFrames } from './contact-sheet';

describe('planContactSheetFrames', () => {
  it('opens every shot on its own panel', () => {
    const plan = planContactSheetFrames({ panelCount: 3 });
    expect(plan.map((shot) => shot.firstFramePanelIndex)).toEqual([0, 1, 2]);
    expect(plan.map((shot) => shot.sceneIndex)).toEqual([0, 1, 2]);
  });

  it('defaults to cut, so no shot carries a closing frame', () => {
    const plan = planContactSheetFrames({ panelCount: 3 });
    expect(plan.map((shot) => shot.lastFramePanelIndex)).toEqual([null, null, null]);
  });

  // The whole point of D5: continuity without serialization. Shot i closes on the
  // panel shot i+1 opens on, and every panel already exists before any clip runs.
  it('closes each match shot on the next shot opening panel', () => {
    const plan = planContactSheetFrames({ panelCount: 3, continuity: 'match' });
    expect(plan.map((shot) => shot.lastFramePanelIndex)).toEqual([1, 2, null]);
  });

  it('never gives the final shot a closing frame, even when match is requested', () => {
    for (const continuity of ['match', 'cut'] as const) {
      const plan = planContactSheetFrames({ panelCount: 4, continuity });
      expect(plan.at(-1)?.lastFramePanelIndex).toBeNull();
    }
  });

  it('accepts per-shot continuity so a piece can mix match cuts and jump cuts', () => {
    const plan = planContactSheetFrames({
      panelCount: 4,
      continuity: ['match', 'cut', 'match', 'cut'],
    });
    expect(plan.map((shot) => shot.lastFramePanelIndex)).toEqual([1, null, 3, null]);
  });

  it('treats a short continuity array as cut for the shots it does not cover', () => {
    const plan = planContactSheetFrames({ panelCount: 3, continuity: ['match'] });
    expect(plan.map((shot) => shot.lastFramePanelIndex)).toEqual([1, null, null]);
  });

  it('handles a single-panel sheet', () => {
    expect(planContactSheetFrames({ panelCount: 1, continuity: 'match' })).toEqual([
      { sceneIndex: 0, firstFramePanelIndex: 0, lastFramePanelIndex: null },
    ]);
  });

  it('rejects an empty or non-integer sheet', () => {
    expect(() => planContactSheetFrames({ panelCount: 0 })).toThrow('at least one panel');
    expect(() => planContactSheetFrames({ panelCount: 2.5 })).toThrow('at least one panel');
  });
});

describe('assertVeoFrameMode', () => {
  it('allows frames alone', () => {
    expect(() => assertVeoFrameMode({ firstFrame: {}, lastFrame: {} })).not.toThrow();
  });

  it('allows reference images alone', () => {
    expect(() => assertVeoFrameMode({ referenceImages: [{}, {}] })).not.toThrow();
  });

  it('allows a request carrying neither', () => {
    expect(() => assertVeoFrameMode({})).not.toThrow();
    expect(() => assertVeoFrameMode({ referenceImages: [] })).not.toThrow();
  });

  // The Organic reel path builds its request with a cast and never parses it, so
  // this call is the only thing standing between a malformed request and a 400.
  it('refuses frames and reference images together', () => {
    expect(() => assertVeoFrameMode({ firstFrame: {}, referenceImages: [{}] })).toThrow(
      'EITHER reference_images OR first_frame/last_frame',
    );
    expect(() => assertVeoFrameMode({ lastFrame: {}, referenceImages: [{}] })).toThrow(
      'EITHER reference_images OR first_frame/last_frame',
    );
  });

  it('refuses a closing frame with no opening frame', () => {
    expect(() => assertVeoFrameMode({ lastFrame: {} })).toThrow(
      'first_frame is required when last_frame is provided',
    );
  });
});
