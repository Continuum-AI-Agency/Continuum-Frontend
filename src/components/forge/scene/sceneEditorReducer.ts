import type { BlendField, SceneRenderRequest, SceneTemplateView } from '@continuum/contracts';

/**
 * The Blender scene editor's state, as a pure reducer so the undo model is tested without React.
 *
 * Only CHANGES are held: a field that reads its default is absent, which is what a request sends
 * ("only what you changed") and what Reset means (delete the key). A set back to the default
 * deletes the key too, so the dirty count never counts an edit that changed nothing.
 *
 * History follows the layer editor's `{ present, past, future }` with the same 50-step cap.
 * Consecutive sets of ONE field are one step: typing a headline is a single undo, not one per key.
 */

export type SceneValue = SceneRenderRequest['values'][string];
export type SceneChanges = Readonly<Record<string, SceneValue>>;

export const HISTORY_LIMIT = 50;

export type SceneEditorState = {
  defaults: Readonly<Record<string, BlendField['default']>>;
  changes: SceneChanges;
  past: SceneChanges[];
  future: SceneChanges[];
  /** The field the last set wrote; another set of it extends that undo step. */
  editing: string | null;
  selectedKey: string | null;
  outputId: string | null;
};

export type SceneEditorAction =
  | { type: 'set'; key: string; value: SceneValue }
  | { type: 'resetField'; key: string }
  | { type: 'resetAll' }
  | { type: 'select'; key: string | null }
  | { type: 'chooseOutput'; outputId: string }
  | { type: 'undo' }
  | { type: 'redo' };

export function initialSceneEditor(
  view: Pick<SceneTemplateView, 'fields' | 'outputs'>,
): SceneEditorState {
  return {
    defaults: Object.fromEntries(view.fields.map((field) => [field.key, field.default])),
    changes: {},
    past: [],
    future: [],
    editing: null,
    selectedKey: null,
    outputId: view.outputs[0]?.id ?? null,
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function without(changes: SceneChanges, key: string): SceneChanges {
  const { [key]: _dropped, ...rest } = changes;
  return rest;
}

function commit(
  state: SceneEditorState,
  changes: SceneChanges,
  editing: string | null,
): SceneEditorState {
  const extend = editing !== null && editing === state.editing;
  return {
    ...state,
    changes,
    past: extend ? state.past : [...state.past, state.changes].slice(-HISTORY_LIMIT),
    future: [],
    editing,
  };
}

export function sceneEditorReducer(
  state: SceneEditorState,
  action: SceneEditorAction,
): SceneEditorState {
  switch (action.type) {
    case 'set': {
      const rest = without(state.changes, action.key);
      const changes = sameValue(action.value, state.defaults[action.key])
        ? rest
        : { ...rest, [action.key]: action.value };
      if (sameValue(changes, state.changes)) return state;
      return commit(state, changes, action.key);
    }
    case 'resetField':
      return action.key in state.changes
        ? commit(state, without(state.changes, action.key), null)
        : state;
    case 'resetAll':
      return Object.keys(state.changes).length ? commit(state, {}, null) : state;
    case 'select':
      return action.key === state.selectedKey
        ? state
        : { ...state, selectedKey: action.key, editing: null };
    case 'chooseOutput':
      return { ...state, outputId: action.outputId };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        changes: previous,
        past: state.past.slice(0, -1),
        future: [state.changes, ...state.future],
        editing: null,
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        changes: next,
        past: [...state.past, state.changes].slice(-HISTORY_LIMIT),
        future: rest,
        editing: null,
      };
    }
  }
}
