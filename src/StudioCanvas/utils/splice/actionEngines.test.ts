// The registry's job is to route, refuse, and shape the engine's input. Those three
// are pure and are what is asserted here.
//
// NOT covered: the mediabunny encode inside any engine. Reaching it means mocking
// `composeTimeline`, and `mock.module` in bun is process-wide — it would leak into
// every other file in the same run. The encodes are proven end to end by
// `studio:actions:video:e2e:bench`, which grades reverse, boomerang, speed, split,
// long exposure and greenscreen on DECODED PIXELS of a frame-numbered fixture.

import { describe, expect, it } from 'bun:test';
import { ACTION_DEFS, ACTION_IDS, type ActionId } from '@continuum/contracts';
import { isImplementedAction } from '../actions/runAction';
import {
  ACTION_ENGINES,
  type ActionEngineArgs,
  actionEngine,
  renderSplitParts,
  requireInput,
  speedTimelineItem,
} from './actionEngines';

const blob = (name: string): Blob => new Blob([name], { type: 'video/mp4' });

const argsWith = (inputs: { handle: string; blob: Blob }[]): ActionEngineArgs => ({
  inputs,
  config: {},
});

/** Every video op this shell shipped an engine for. */
const WAVE_3_VIDEO_ENGINES: ActionId[] = [
  'video.grade',
  'video.filter',
  'video.effect',
  'video.blur',
  'video.speed',
  'video.kenBurns',
  'video.stitch',
  'video.split',
  'video.crop',
  'video.pad',
  'video.greenscreen',
  'video.reverse',
  'video.boomerang',
];

/**
 * Engine ids `runAction.ts`'s `WORKER_OPS_WITH_ENGINES` has not been given yet.
 *
 * Self-emptying ratchet: wiring an id makes the test below fail until its entry is
 * deleted. The Wave-3 wiring landed, so the list is empty — its goal state.
 */
const PENDING_RUN_ACTION_WIRING: ActionId[] = [];

/**
 * Worker ops implemented WITHOUT an entry in `ACTION_ENGINES`. `video.overlay` and
 * `video.watermark` build their plan on the main thread and post `start_timeline`;
 * `video.subtitles` orchestrates an authenticated transcribe round trip and then posts
 * `start_single_source`. All three have a runner and an enabled Run button but no
 * engine here. Named rather than loosened, so a FOURTH op arriving this way has to
 * say so.
 */
const IMPLEMENTED_OUTSIDE_THE_ENGINE_TABLE: ActionId[] = [
  'video.overlay',
  'video.watermark',
  'video.subtitles',
];

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

  it('ships the wave-3 video catalog', () => {
    expect(Object.keys(ACTION_ENGINES).sort()).toEqual([...WAVE_3_VIDEO_ENGINES].sort());
  });

  it('leaves exactly the three worker ops that belong to another shell', () => {
    // Named, not counted: an engine that quietly went missing would still pass a count.
    const missing = ACTION_IDS.filter(
      (id) => ACTION_DEFS[id].execution === 'worker' && !(id in ACTION_ENGINES),
    );
    expect(missing.sort()).toEqual(
      [
        // The subtitles shell.
        'video.subtitles',
        // The burn-in shell.
        'video.overlay',
        'video.watermark',
      ].sort(),
    );
  });
});

describe('actionEngine', () => {
  it('returns the engine for every registered worker op', () => {
    for (const id of WAVE_3_VIDEO_ENGINES) {
      expect(typeof actionEngine(id), id).toBe('function');
    }
  });

  it('refuses a sync op by name rather than running it in the worker', () => {
    // Spinning up a mediabunny pipeline to rotate a JPEG is the failure this prevents.
    expect(() => actionEngine('image.rotate')).toThrow(/runs in the page/);
  });

  it('refuses long exposure to the worker — it is a sync op that emits a still', () => {
    expect(() => actionEngine('video.longExposure')).toThrow(/runs in the page/);
  });

  it('refuses a declared-but-unimplemented worker op by its label', () => {
    expect(() => actionEngine('video.subtitles')).toThrow(/not implemented yet/);
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

describe('renderSplitParts', () => {
  it('is exported for the worker’s outputsCollection branch', () => {
    expect(typeof renderSplitParts).toBe('function');
  });

  it('refuses before it decodes anything when nothing is wired', async () => {
    await expect(renderSplitParts(argsWith([]))).rejects.toThrow(/"in" input/);
  });
});

describe('the engine table and the node UI agree', () => {
  it('registers an engine for exactly the worker ops the UI enables', () => {
    // `isImplementedAction` keeps its own copy of this list so the node UI does not
    // import mediabunny. This is the assertion that stops the two from drifting — and
    // a drift here means a Run button that is enabled on an op with no engine.
    const enabled = ACTION_IDS.filter(
      (id) =>
        ACTION_DEFS[id].execution === 'worker' &&
        isImplementedAction(id) &&
        !IMPLEMENTED_OUTSIDE_THE_ENGINE_TABLE.includes(id),
    );
    expect([...enabled, ...PENDING_RUN_ACTION_WIRING].sort()).toEqual(
      Object.keys(ACTION_ENGINES).sort(),
    );
  });

  it('holds nothing in the pending list that runAction has already been given', () => {
    // Self-emptying by design: wiring an id makes this fail until its entry is deleted.
    expect(PENDING_RUN_ACTION_WIRING.filter(isImplementedAction)).toEqual([]);
  });

  it('never lists an op in the pending list that has no engine', () => {
    for (const id of PENDING_RUN_ACTION_WIRING) {
      expect(ACTION_ENGINES[id], `${id} engine`).toBeDefined();
    }
  });
});
