import type { TemplateAuthoringCommand } from '@continuum/contracts';

/** One row of "what this draft changes": a layer (or a template-wide change) in plain words. */
export type DraftChange = {
  key: string;
  name: string;
  changes: string[];
  /** Its own layer edits only, referenced by nothing else: dropping them cannot break the draft. */
  undoable: boolean;
};

type Named = { nodeId: string; name: string | null };
const LAYER_EDIT_TYPES = new Set(['layer.edit', 'layer.timing', 'layer.keyframes.replace']);

function editWords(edit: Record<string, unknown>): string[] {
  const words: string[] = [];
  if ('text' in edit) words.push('text');
  if ('font' in edit) words.push('font');
  if ('fontSize' in edit) words.push('text size');
  if ('x' in edit || 'y' in edit || 'position' in edit) words.push('moved');
  if ('width' in edit || 'height' in edit) words.push('resized');
  if ('scale' in edit) words.push('scaled');
  if ('rotation' in edit) words.push('rotated');
  if (typeof edit.opacity === 'number') words.push(`opacity ${Math.round(edit.opacity)}%`);
  if (edit.visible === false) words.push('hidden');
  if (edit.visible === true) words.push('shown');
  if ('fillColor' in edit) words.push('colour');
  return words;
}

const COMMAND_WORDS: Record<string, string> = {
  'layer.timing': 'timing',
  'layer.keyframes.replace': 'animation',
  'mask.create': 'mask added',
  'mask.update': 'mask changed',
  'mask.delete': 'mask removed',
  'text.create': 'added',
  'shape.create': 'added',
  'artwork.create': 'added',
  'layer.duplicate': 'duplicated',
  'layer.delete': 'removed',
  'layer.group': 'grouped',
  'layer.group.transform': 'group moved',
  'layer.ungroup': 'ungrouped',
};

/**
 * What the draft's commands change, grouped by layer, in the words a person uses. Later values win
 * (two opacity edits read as the last one). Commands with no layer (image relinks, fields, layer
 * order, artboards) get a row of their own and are never undone piecemeal.
 */
export function describeDraftChanges(commands: readonly TemplateAuthoringCommand[], nodes: readonly Named[]): DraftChange[] {
  const rows = new Map<string, { name: string; words: string[]; types: Set<string> }>();
  const nameOf = (nodeId: string) => nodes.find((node) => node.nodeId === nodeId)?.name || 'Unnamed layer';
  const add = (key: string, name: string, type: string, words: string[]) => {
    const row = rows.get(key) ?? { name, words: [], types: new Set<string>() };
    row.types.add(type);
    for (const word of words) {
      // A later opacity replaces an earlier one; every other word appears once.
      if (word.startsWith('opacity ')) row.words = row.words.filter((item) => !item.startsWith('opacity '));
      if (!row.words.includes(word)) row.words.push(word);
    }
    rows.set(key, row);
  };
  for (const command of commands) {
    const nodeId = 'nodeId' in command && typeof command.nodeId === 'string' ? command.nodeId : null;
    if (nodeId) {
      const words = command.type === 'layer.edit' ? editWords(command.edit as Record<string, unknown>) : [COMMAND_WORDS[command.type] ?? 'changed'];
      add(nodeId, nameOf(nodeId), command.type, words);
    } else if (command.type === 'dependency.relink') add('images', 'Images', command.type, ['replaced']);
    else if (command.type === 'exposure.set') add('fields', 'Fields', command.type, [command.exposed ? 'field shown' : 'field hidden']);
    else if (command.type === 'composition.order') add('order', 'Layer order', command.type, ['reordered']);
    else add('artboards', 'Artboards', command.type, ['changed']);
  }
  const text = (command: TemplateAuthoringCommand) => JSON.stringify(command);
  return [...rows].map(([key, row]) => {
    const own = commands.filter((command) => 'nodeId' in command && command.nodeId === key);
    const referencedElsewhere = commands.some((command) => !own.includes(command) && text(command).includes(`"${key}"`));
    return {
      key,
      name: row.name,
      changes: row.words.length ? row.words : ['changed'],
      undoable: own.length > 0 && [...row.types].every((type) => LAYER_EDIT_TYPES.has(type)) && !referencedElsewhere,
    };
  });
}

/** The commands left once one layer's own edits are dropped (undo for a single row). */
export function withoutLayerChanges(commands: readonly TemplateAuthoringCommand[], nodeId: string): TemplateAuthoringCommand[] {
  return commands.filter((command) => !('nodeId' in command) || command.nodeId !== nodeId);
}

const REFERENCE_FIELDS = new Set(['compId', 'layerId', 'designLayerId', 'artboardId']);
/** Each edited field's latest value on one layer, across the commands. */
function editFields(commands: readonly TemplateAuthoringCommand[], nodeId: string) {
  const fields: Record<string, unknown> = {};
  for (const command of commands)
    if (command.type === 'layer.edit' && command.nodeId === nodeId)
      for (const [field, value] of Object.entries(command.edit as Record<string, unknown>))
        if (!REFERENCE_FIELDS.has(field)) fields[field] = value;
  return fields;
}

/**
 * What one agent turn changed on `nodeIds`: the layer fields whose value differs between the draft
 * before the turn and after it, plus any other command the turn added there. Compares values, not
 * commands, so the editor merging edits on one layer does not read as a change.
 */
export function describeTurnChanges(
  before: readonly TemplateAuthoringCommand[],
  after: readonly TemplateAuthoringCommand[],
  nodeIds: readonly string[],
  nodes: readonly Named[],
): DraftChange[] {
  const had = new Set(before.map((command) => JSON.stringify(command)));
  const changed: TemplateAuthoringCommand[] = [];
  for (const nodeId of new Set(nodeIds)) {
    const was = editFields(before, nodeId);
    const now = editFields(after, nodeId);
    const edit = Object.fromEntries(Object.entries(now).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(was[field])));
    if (Object.keys(edit).length) changed.push({ type: 'layer.edit', nodeId, edit } as TemplateAuthoringCommand);
    for (const command of after)
      if (command.type !== 'layer.edit' && 'nodeId' in command && command.nodeId === nodeId && !had.has(JSON.stringify(command)))
        changed.push(command);
  }
  return describeDraftChanges(changed, nodes);
}
