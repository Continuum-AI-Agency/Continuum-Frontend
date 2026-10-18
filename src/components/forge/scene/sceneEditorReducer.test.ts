/**
 * The scene editor's state: it holds only changes, a set back to the file's value drops the change,
 * a run of edits to one field is one undo step, and undo / redo / reset move through history the
 * way the layer editor's does.
 */

import { describe, expect, test } from 'bun:test';
import { blendParseSchema } from '@continuum/contracts';
import parseExample from '../../../../packages/contracts/src/media/__fixtures__/blend-parse.example.json';
import {
  HISTORY_LIMIT,
  initialSceneEditor,
  type SceneEditorAction,
  type SceneEditorState,
  sceneEditorReducer,
} from './sceneEditorReducer';

const parse = blendParseSchema.parse(parseExample);
const run = (actions: SceneEditorAction[], from = initialSceneEditor(parse)): SceneEditorState =>
  actions.reduce(sceneEditorReducer, from);

describe('sceneEditorReducer', () => {
  test('starts with no changes, the first output, and the file defaults', () => {
    const state = initialSceneEditor(parse);
    expect(state.changes).toEqual({});
    expect(state.outputId).toBe('Main/CamWide');
    expect(state.defaults.headline).toBe('Summer Sale');
    expect(state.defaults['swatch.location']).toEqual([-5, 0, -2]);
  });

  test('set records a change; setting the default again drops it', () => {
    const changed = run([{ type: 'set', key: 'swatch.location', value: [0, 0, -2] }]);
    expect(changed.changes).toEqual({ 'swatch.location': [0, 0, -2] });
    const back = sceneEditorReducer(changed, {
      type: 'set',
      key: 'swatch.location',
      value: [-5, 0, -2],
    });
    expect(back.changes).toEqual({});
  });

  test('a set that changes nothing is not a history step', () => {
    const state = initialSceneEditor(parse);
    expect(sceneEditorReducer(state, { type: 'set', key: 'headline', value: 'Summer Sale' })).toBe(
      state,
    );
  });

  test('typing into one field is one undo step; another field starts a new one', () => {
    const state = run([
      { type: 'set', key: 'headline', value: 'B' },
      { type: 'set', key: 'headline', value: 'Bl' },
      { type: 'set', key: 'headline', value: 'Black' },
      { type: 'set', key: 'brand_colour', value: '#ff0000' },
    ]);
    expect(state.past).toHaveLength(2);
    const once = sceneEditorReducer(state, { type: 'undo' });
    expect(once.changes).toEqual({ headline: 'Black' });
    const twice = sceneEditorReducer(once, { type: 'undo' });
    expect(twice.changes).toEqual({});
    expect(sceneEditorReducer(twice, { type: 'undo' })).toBe(twice);
  });

  test('selecting another field ends the run, so the next edit of the first is its own step', () => {
    const state = run([
      { type: 'set', key: 'headline', value: 'One' },
      { type: 'select', key: 'brand_colour' },
      { type: 'select', key: 'headline' },
      { type: 'set', key: 'headline', value: 'Two' },
    ]);
    expect(state.past).toHaveLength(2);
    expect(state.selectedKey).toBe('headline');
  });

  test('redo replays what undo took back, and a new edit clears it', () => {
    const undone = run([{ type: 'set', key: 'hide_badge', value: true }, { type: 'undo' }]);
    expect(undone.changes).toEqual({});
    const redone = sceneEditorReducer(undone, { type: 'redo' });
    expect(redone.changes).toEqual({ hide_badge: true });
    expect(sceneEditorReducer(redone, { type: 'redo' })).toBe(redone);
    const branched = run([{ type: 'undo' }, { type: 'set', key: 'key.energy', value: 5 }], redone);
    expect(branched.future).toEqual([]);
  });

  test('resetField and resetAll are undoable and do nothing when nothing changed', () => {
    const state = run([
      { type: 'set', key: 'headline', value: 'Sale' },
      { type: 'set', key: 'key.energy', value: 250 },
    ]);
    const one = sceneEditorReducer(state, { type: 'resetField', key: 'headline' });
    expect(one.changes).toEqual({ 'key.energy': 250 });
    expect(sceneEditorReducer(one, { type: 'resetField', key: 'headline' })).toBe(one);
    const all = sceneEditorReducer(one, { type: 'resetAll' });
    expect(all.changes).toEqual({});
    expect(sceneEditorReducer(all, { type: 'resetAll' })).toBe(all);
    expect(sceneEditorReducer(all, { type: 'undo' }).changes).toEqual({ 'key.energy': 250 });
  });

  test('chooseOutput moves the output and leaves the changes and history alone', () => {
    const state = run([
      { type: 'set', key: 'headline', value: 'Sale' },
      { type: 'chooseOutput', outputId: 'Motion/CamWide' },
    ]);
    expect(state.outputId).toBe('Motion/CamWide');
    expect(state.changes).toEqual({ headline: 'Sale' });
    expect(state.past).toHaveLength(1);
  });

  test(`history keeps the last ${HISTORY_LIMIT} steps`, () => {
    const actions: SceneEditorAction[] = [];
    for (let index = 0; index < HISTORY_LIMIT + 10; index++) {
      actions.push({ type: 'select', key: `step-${index}` });
      actions.push({ type: 'set', key: 'key.energy', value: index + 1 });
    }
    expect(run(actions).past).toHaveLength(HISTORY_LIMIT);
  });
});
