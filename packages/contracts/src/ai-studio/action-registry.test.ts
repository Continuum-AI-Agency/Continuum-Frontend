import { describe, expect, it } from 'bun:test';

import {
  ACTION_DEFS,
  ACTION_IDS,
  actionDef,
  actionInputPort,
  actionOutputModality,
  isActionId,
} from './action-registry';

describe('ACTION_DEFS', () => {
  it('defines every declared op, and nothing that is not declared', () => {
    expect([...Object.keys(ACTION_DEFS)].sort()).toEqual([...ACTION_IDS].sort());
  });

  // A count, not a floor: silently trimming the catalog is exactly the drift this
  // registry exists to stop, and a shrinking list should have to be edited on purpose.
  it('declares the whole catalog up front', () => {
    expect(ACTION_IDS).toHaveLength(31);
    expect(ACTION_IDS.filter((id) => id.startsWith('image.'))).toHaveLength(9);
    expect(ACTION_IDS.filter((id) => id.startsWith('video.'))).toHaveLength(19);
    expect(ACTION_IDS.filter((id) => id.startsWith('text.'))).toHaveLength(3);
  });

  it('keeps each id, family and label honest', () => {
    for (const id of ACTION_IDS) {
      const def = ACTION_DEFS[id];
      expect(def.id, id).toBe(id);
      expect(id.startsWith(`${def.family}.`), `${id} family`).toBe(true);
      expect(def.label.length, `${id} label`).toBeGreaterThan(0);
      expect(def.description.length, `${id} description`).toBeGreaterThan(10);
      expect(def.group.length, `${id} group`).toBeGreaterThan(0);
      expect(def.inputs.length, `${id} inputs`).toBeGreaterThan(0);
      for (const port of def.inputs) {
        expect(port.handle.length, `${id} ${port.handle}`).toBeGreaterThan(0);
        expect(port.max, `${id} ${port.handle} max`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every op distinct input handles', () => {
    for (const id of ACTION_IDS) {
      const handles = ACTION_DEFS[id].inputs.map((port) => port.handle);
      expect(new Set(handles).size, id).toBe(handles.length);
    }
  });

  // The sync-vs-worker rule, as an assertion rather than a comment: re-encoding video goes
  // through the splicer worker; anything that lands on a still or on text runs in-node the
  // way the frameExtract branch already does.
  it('sends exactly the video-producing ops to the worker', () => {
    for (const id of ACTION_IDS) {
      const def = ACTION_DEFS[id];
      expect(def.execution === 'worker', `${id} (${def.output})`).toBe(def.output === 'video');
    }
  });

  it('parses its own defaults for every op', () => {
    for (const id of ACTION_IDS) {
      const parsed = ACTION_DEFS[id].config.safeParse({});
      expect(parsed.success, `${id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });

  it('rejects a config the op does not accept', () => {
    expect(ACTION_DEFS['image.rotate'].config.safeParse({ degrees: 4000 }).success).toBe(false);
    expect(ACTION_DEFS['video.speed'].config.safeParse({ rate: 0 }).success).toBe(false);
    expect(ACTION_DEFS['image.tint'].config.safeParse({ color: 'red' }).success).toBe(false);
  });

  it('marks the ops whose runtime emits several items', () => {
    const collections = ACTION_IDS.filter((id) => ACTION_DEFS[id].outputsCollection);
    expect([...collections].sort()).toEqual(['text.split', 'video.extractFrames', 'video.split']);
  });
});

describe('lookups', () => {
  it('recognises only catalog ids', () => {
    expect(isActionId('image.rotate')).toBe(true);
    expect(isActionId('image.deepfry')).toBe(false);
    expect(isActionId(undefined)).toBe(false);
    expect(isActionId(7)).toBe(false);
  });

  it('answers with undefined rather than throwing on unset node data', () => {
    expect(actionDef(null)).toBeUndefined();
    expect(actionOutputModality(undefined)).toBeUndefined();
    expect(actionInputPort(null, 'in')).toBeUndefined();
  });

  it('resolves the modality and the port an op declares', () => {
    expect(actionOutputModality('video.longExposure')).toBe('image');
    expect(actionOutputModality('text.concat')).toBe('text');
    expect(actionInputPort('video.overlay', 'overlay-in')?.modality).toBe('image');
    expect(actionInputPort('video.overlay', 'nope')).toBeUndefined();
  });
});
