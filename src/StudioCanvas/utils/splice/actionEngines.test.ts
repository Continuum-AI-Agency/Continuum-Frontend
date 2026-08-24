// The registry's job is to route, refuse, and shape the engine's input. Those three
// are pure and are what is asserted here.
//
// NOT covered: the mediabunny encode inside `videoSpeed` itself. Reaching it means
// mocking `composeTimeline`, and `mock.module` in bun is process-wide — it would leak
// into every other file in the same run. The encode is exercised by the real worker,
// and `studio:actions:smoke:e2e:bench` drives the sync (`image.rotate`) half of the
// dispatcher end to end. A worker-op bench lands with Wave 3's video action shell.

import { describe, expect, it } from 'bun:test';
import { ACTION_DEFS, ACTION_IDS, type ActionId } from '@continuum/contracts';
import { isImplementedAction } from '../actions/runAction';
import {
  ACTION_ENGINES,
  type ActionEngineArgs,
  actionEngine,
  requireInput,
  speedTimelineItem,
} from './actionEngines';

const blob = (name: string): Blob => new Blob([name], { type: 'video/mp4' });

const argsWith = (inputs: { handle: string; blob: Blob }[]): ActionEngineArgs => ({
  inputs,
  config: {},
});

describe('ACTION_ENGINES', () => {
  it('registers only ops the catalog marks as worker execution', () => {
    for (const id of Object.keys(ACTION_ENGINES) as ActionId[]) {
      expect(ACTION_DEFS[id].execution, `${id} execution`).toBe('worker');
    }
  });

  it('registers only ids that exist in the catalog', () => {
    for (const id of Object.keys(ACTION_ENGINES)) {
      expect(ACTION_IDS).toContain(id as ActionId);
    }
  });

  it('ships video.speed as this wave’s one proof op', () => {
    expect(Object.keys(ACTION_ENGINES)).toEqual(['video.speed']);
  });
});

describe('actionEngine', () => {
  it('returns the engine for a registered worker op', () => {
    expect(typeof actionEngine('video.speed')).toBe('function');
  });

  it('refuses a sync op by name rather than running it in the worker', () => {
    // Spinning up a mediabunny pipeline to rotate a JPEG is the failure this prevents.
    expect(() => actionEngine('image.rotate')).toThrow(/runs in the page/);
  });

  it('refuses a declared-but-unimplemented worker op by its label', () => {
    expect(() => actionEngine('video.reverse')).toThrow(/not implemented yet/);
  });
});

describe('requireInput', () => {
  it('returns the blob wired to the named handle', () => {
    const wanted = blob('base');
    const args = argsWith([
      { handle: 'in', blob: wanted },
      { handle: 'overlay-in', blob: blob('logo') },
    ]);
    expect(requireInput(args, 'in')).toBe(wanted);
  });

  it('names the missing handle instead of failing deep in the encoder', () => {
    expect(() => requireInput(argsWith([]), 'in')).toThrow(/"in" input/);
  });
});

describe('speedTimelineItem', () => {
  it('carries the rate through as a clip effect', () => {
    const item = speedTimelineItem(blob('clip'), { rate: 2 });
    expect(item.effects?.speed).toBe(2);
    expect(item.kind).toBe('video');
  });

  it('falls back to the identity rate when the stored config is not a number', () => {
    // A hand-edited canvas row must not hand NaN to the encoder.
    expect(speedTimelineItem(blob('clip'), {}).effects?.speed).toBe(1);
    expect(speedTimelineItem(blob('clip'), { rate: 'fast' }).effects?.speed).toBe(1);
    expect(speedTimelineItem(blob('clip'), { rate: Number.NaN }).effects?.speed).toBe(1);
  });

  it('accepts the catalog default for the op', () => {
    const parsed = ACTION_DEFS['video.speed'].config.parse({}) as { rate: number };
    expect(speedTimelineItem(blob('clip'), parsed).effects?.speed).toBe(parsed.rate);
  });
});

describe('the engine table and the node UI agree', () => {
  it('registers an engine for exactly the worker ops the UI enables', () => {
    // `isImplementedAction` keeps its own copy of this list so the node UI does not
    // import mediabunny. This is the assertion that stops the two from drifting — and
    // a drift here means a Run button that is enabled on an op with no engine.
    const enabled = ACTION_IDS.filter(
      (id) => ACTION_DEFS[id].execution === 'worker' && isImplementedAction(id),
    );
    expect([...enabled].sort()).toEqual(Object.keys(ACTION_ENGINES).sort());
  });
});
