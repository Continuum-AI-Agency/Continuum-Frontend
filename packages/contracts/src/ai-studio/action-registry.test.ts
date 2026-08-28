import { describe, expect, it } from 'bun:test';
import {
  BURN_IN_ANCHORS,
  VERNE_TITLE_ANCHOR_OFFSET_Y,
  VERNE_TITLE_BOX_TOP,
  VERNE_TITLE_MEASURE,
  VERNE_TITLE_MIN_CONTRAST,
  VERNE_TITLE_RIGHT_MARGIN,
} from '../design-system/placement';
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
    expect(ACTION_IDS).toHaveLength(33);
    expect(ACTION_IDS.filter((id) => id.startsWith('image.'))).toHaveLength(11);
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
    // A measure wider than the piece and a contrast ratio no pair of colours can reach are
    // both settings that would produce a plan nothing can honour — refuse them at the edge.
    expect(ACTION_DEFS['image.text'].config.safeParse({ measure: 1.4 }).success).toBe(false);
    expect(ACTION_DEFS['image.text'].config.safeParse({ minContrast: 25 }).success).toBe(false);
  });

  it('marks the ops whose runtime emits several items', () => {
    const collections = ACTION_IDS.filter((id) => ACTION_DEFS[id].outputsCollection);
    expect([...collections].sort()).toEqual([
      'image.duplicate',
      'text.split',
      'video.extractFrames',
      'video.split',
    ]);
  });
});

// The op that exists because a diffusion model cannot set type: the still arrives on `in`,
// the words on `text-in`, and the placement is decided afterwards by code.
describe('image.text', () => {
  it('is in the catalog as a sync image op', () => {
    expect(isActionId('image.text')).toBe(true);
    expect(ACTION_DEFS['image.text'].execution).toBe('sync');
    expect(actionOutputModality('image.text')).toBe('image');
  });

  it('takes the picture and the words on separate ports', () => {
    expect(actionInputPort('image.text', 'in')?.modality).toBe('image');
    expect(actionInputPort('image.text', 'text-in')?.modality).toBe('text');
    expect(ACTION_DEFS['image.text'].inputs).toHaveLength(2);
  });

  // Defaults come from placement.ts rather than being retyped, so a retune of the calibrated
  // constants moves the planner and this node's default together.
  it('defaults to the calibrated measure and contrast floor', () => {
    const parsed = ACTION_DEFS['image.text'].config.parse({});
    expect(parsed).toEqual({
      anchor: 'top-right',
      offsetX: 0,
      offsetY: VERNE_TITLE_ANCHOR_OFFSET_Y,
      marginFrac: VERNE_TITLE_RIGHT_MARGIN,
      inkToken: '',
      measure: VERNE_TITLE_MEASURE,
      minContrast: VERNE_TITLE_MIN_CONTRAST,
      escalate: true,
    });
  });

  // The whole point of carrying the offset as a default rather than re-anchoring the op:
  // `top-right` + this nudge lands the block exactly where ten measured adaptations put it.
  it('reproduces the calibrated headline top from the anchor plus its nudge', () => {
    const parsed = ACTION_DEFS['image.text'].config.parse({}) as {
      marginFrac: number;
      offsetY: number;
    };
    expect(parsed.marginFrac + parsed.offsetY).toBeCloseTo(VERNE_TITLE_BOX_TOP, 6);
  });

  // A section enum offered `motion`, `voice`, `radii` and `iconography` as the source of a
  // text colour. They are gone, and this test is what stops them coming back through a
  // "just one more knob" edit.
  it('asks nothing about design SECTIONS — type is typography, ink is the palette', () => {
    const parsed = ACTION_DEFS['image.text'].config.parse({});
    expect(Object.keys(parsed as object).sort()).toEqual([
      'anchor',
      'escalate',
      'inkToken',
      'marginFrac',
      'measure',
      'minContrast',
      'offsetX',
      'offsetY',
    ]);
  });

  it('accepts all nine anchor points and refuses anything else', () => {
    for (const anchor of BURN_IN_ANCHORS) {
      expect(ACTION_DEFS['image.text'].config.safeParse({ anchor }).success, anchor).toBe(true);
    }
    expect(BURN_IN_ANCHORS).toHaveLength(9);
    expect(ACTION_DEFS['image.text'].config.safeParse({ anchor: 'right' }).success).toBe(false);
  });

  // Fractions, never pixels: the same node runs against 1080x1350 and 1080x1920, and a
  // pixel offset would mean something different in each.
  it('bounds the nudge to the frame it is a fraction of', () => {
    expect(ACTION_DEFS['image.text'].config.safeParse({ offsetX: 1.4 }).success).toBe(false);
    expect(ACTION_DEFS['image.text'].config.safeParse({ offsetY: -1.4 }).success).toBe(false);
    expect(ACTION_DEFS['image.text'].config.safeParse({ offsetX: -0.2 }).success).toBe(true);
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
