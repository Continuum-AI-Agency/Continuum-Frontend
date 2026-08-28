import { DESIGN_SECTIONS } from '../design-system/sections';
import { ACTION_DEFS, ACTION_IDS, type ActionDef, type ActionId } from './action-registry';
import { BATCH_COMBINE_MODES, BATCH_ITEM_KINDS } from './batch-node';
import { designRefModeSchema } from './design-grounding';
import { IMAGE_EXPORT_FORMATS, VIDEO_EXPORT_FORMATS } from './export-formats';
import {
  IMAGE_GENERATOR_MODELS,
  IMAGE_SIZES,
  imageSizesForModel,
  supportsImageSize,
} from './image-size';
import { STUDIO_NODE_REGISTRY } from './node-registry';
import { workflowEditOpSchema } from './workflow-builder';
import {
  CLIP_TRANSITION_TYPES,
  createNodeData,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  getTargetHandleConnectionLimit,
  getVideoGeneratorReferenceModes,
  getVideoGeneratorTargetHandles,
  STUDIO_NODE_TYPES,
  type StudioNodeType,
  type TimelineItemSpec,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_MODELS,
} from './workflow-graph';
import { AGENT_FIELD_WHITELIST } from './workflow-projection';

// The node catalog an agent is shown, RENDERED FROM the canvas rules rather than
// written alongside them. A hand-maintained prompt copy of the node vocabulary is
// a guaranteed drift: adding a node type already means touching several places, and
// a stale prompt fails silently (the model emits a type the builder rejects).
//
// The purpose sentences used to live here as their own `Record<StudioNodeType, string>`.
// They are now read straight off `STUDIO_NODE_REGISTRY`, which is the single description
// of every node type — so the sentence an agent is told and the sentence the palette
// shows cannot disagree, and the registry's `satisfies Record<StudioNodeType, …>` is what
// keeps a new node type from compiling until somebody says what it is for.

const nodePurpose = (type: StudioNodeType): string => STUDIO_NODE_REGISTRY[type].purpose;

const formatHandle = (type: StudioNodeType, handle: string): string => {
  const node = { id: '_', type, data: createNodeData(type).data };
  const limit = getTargetHandleConnectionLimit(node, handle, []);
  return limit === undefined ? handle : `${handle} (max ${limit})`;
};

// Legal values for the enum-shaped config fields the whitelist advertises. These are
// now COERCED at write time (coerceNodeConfig), so an invented value no longer reaches
// the generation endpoint — but the model still writes better nodes when it is told the
// vocabulary up front, and a coerced node is not the node the user asked for.
//
// Keyed `type.field` FIRST, bare `field` second — the same two-level lookup
// `CONFIG_TRANSFORMS` uses in workflow-projection.ts, and for the same reason: `format`
// is a field on `export`, `plannerDraft` AND `paidPublisher`, and `mode` is a field on
// both `designRef` and `plannerDraft`. A bare hint would print one node's legal values
// on the other two. Every value is read off the schema or const that enforces it.
const CONFIG_FIELD_HINTS: Record<string, string> = {
  imageSize: `${IMAGE_SIZES.join('|')} — MODEL-DEPENDENT, see below`,
  aspectRatio: '16:9, 9:16, 1:1, …',
  durationSeconds: '4|6|8',
  resolution: '720p|1080p',
  outputFormat: 'mp4',
  items: 'READ-ONLY here — place clips with the set_timeline op, never update_node',
  referenceMode:
    'images|frames — Veo takes ONE or the other per request; it CHANGES the node handles',
  'action.actionId': 'one of the ACTION OPS ids below',
  'action.config': "that op's keys, from the ACTION OPS table",
  'batch.combine': BATCH_COMBINE_MODES.join('|'),
  // The lock, and the reason a batch that has one can be wired at all — see the rule line
  // under WIRING RULES. Without it the node has no output modality and every edge from it
  // to a generator is refused.
  'batch.itemType': `${BATCH_ITEM_KINDS.join('|')} — SET THIS or nothing can be wired downstream`,
  'batch.items': 'READ-ONLY here — items arrive by wiring producers into `items`',
  'designRef.section': DESIGN_SECTIONS.join('|'),
  'designRef.mode': designRefModeSchema.options.join('|'),
  'export.format': `${IMAGE_EXPORT_FORMATS.join('|')} for a still, ${VIDEO_EXPORT_FORMATS.join('|')} for a clip — ids are case-exact`,
  'element.elementId': 'a saved element id from the list_elements tool — never invent one',
};

const formatConfigField = (type: StudioNodeType, field: string): string => {
  const hint = CONFIG_FIELD_HINTS[`${type}.${field}`] ?? CONFIG_FIELD_HINTS[field];
  return hint ? `${field} (${hint})` : field;
};

// The two node types whose handles come from their own config rather than their type.
// Probing `createNodeData(type)` reports the handles of an UNCONFIGURED node — none —
// which reads as "this is a source" and is a lie. These sentences say where the shape
// actually comes from. Prose, not a second copy of a vocabulary: the `action` ports are
// rendered in full below, and an apiRender's come from a template the agent must read.
const DERIVED_HANDLE_NOTES: Partial<Record<StudioNodeType, { in?: string; out?: string }>> = {
  action: {
    in: 'set by data.actionId — see ACTION OPS below',
    out: 'out — present only once data.actionId is set',
  },
  // Only the `in` line: an apiRender genuinely IS a terminal sink, so its `out` is true.
  apiRender: {
    in: 'one handle per connectable variable in data.variableDefinitions — pick the template and read the node back, then wire',
  },
};

function describeNode(type: StudioNodeType): string {
  const node = { id: '_', type, data: createNodeData(type).data };
  const inputs = getAllowedTargetHandles(node);
  const outputs = getAllowedSourceHandles(node);
  const config = AGENT_FIELD_WHITELIST[type] ?? [];
  const derived = DERIVED_HANDLE_NOTES[type];

  const parts = [`- ${type} — ${nodePurpose(type)}`];
  parts.push(
    `    in: ${inputs.length ? inputs.map((h) => formatHandle(type, h)).join(', ') : (derived?.in ?? '(none — it is a source)')}`,
  );
  parts.push(
    `    out: ${outputs.length ? outputs.join(', ') : (derived?.out ?? '(none — it is a sink)')}`,
  );
  if (config.length)
    parts.push(`    config: ${config.map((field) => formatConfigField(type, field)).join(', ')}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// The action catalog
// ---------------------------------------------------------------------------

// `ACTION_DEFS[id].config` is typed `z.ZodType`, so the object shape is not on the type.
// Every op's config is a `z.object` today; a future one that is not degrades to "no keys"
// rather than throwing inside a prompt builder.
const configKeys = (id: ActionId): string[] => {
  const shape = (ACTION_DEFS[id].config as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
};

/** Group reading order, taken from the order `ACTION_IDS` first mentions each group —
 *  the same derivation the Frontend palette uses (`addNodeCatalog.ts`), rather than a
 *  second authored copy of the order on this side. */
const actionGroupOrder = (): string[] => [
  ...new Set(ACTION_IDS.map((id) => ACTION_DEFS[id].group)),
];

const actionFamilyOrder = (): string[] => [
  ...new Set(ACTION_IDS.map((id) => ACTION_DEFS[id].family)),
];

/**
 * One line per op, with the ports PROBED rather than described: `createNodeData` runs the
 * `actionId` through the same `coerceActionConfig` the builder uses, so the handles below
 * are the handles the node will actually have. Rendering the op-less node instead — which
 * is what the plain `action` row does — reports no handles at all and reads as a source.
 */
function describeActionOp(id: ActionId): string {
  // Annotated, not inferred: `ACTION_DEFS` is a `satisfies` literal, so the union member
  // for an op that never sets `outputsCollection` has no such property to read.
  const def: ActionDef = ACTION_DEFS[id];
  const node = { id: '_', type: 'action', data: createNodeData('action', { actionId: id }).data };
  const inputs = getAllowedTargetHandles(node)
    .map((handle) => {
      const limit = getTargetHandleConnectionLimit(node, handle, []);
      return limit === undefined ? handle : `${handle}(${limit})`;
    })
    .join(' ');
  // The output handle is the same one for every op; what differs is the modality it
  // carries, and that is only worth a char when it is NOT the family's own.
  const outputs =
    getAllowedSourceHandles(node)
      .map((handle) => (def.output === def.family ? handle : `${handle}:${def.output}`))
      .join(',') + (def.outputsCollection ? '*' : '');
  const keys = configKeys(id);
  const config = keys.length ? ` · ${keys.join(' ')}` : '';
  return `  ${id} ${def.label} · ${inputs}→${outputs}${config}`;
}

function describeActionOps(): string {
  const lines = [
    'ACTION OPS — the only legal `data.actionId`; anything else is cleared to null, leaving an',
    'inert node with no handles. Set the op FIRST, then wire. `in(n)` is an input handle and its',
    'connection limit, `out` the single output (carrying the family modality unless written',
    '`out:image`), `*` a COLLECTION output a downstream batch fans out over. After the last `·`',
    "are that op's `data.config` keys. They are checked on write against that op's own",
    'schema: an unknown key, or a value outside its range, is dropped and that ONE field',
    'falls back to its default — the rest of the config you set still stands.',
  ];
  for (const family of actionFamilyOrder()) {
    for (const group of actionGroupOrder()) {
      const ids = ACTION_IDS.filter(
        (id) => ACTION_DEFS[id].family === family && ACTION_DEFS[id].group === group,
      );
      if (!ids.length) continue;
      lines.push(`${family} · ${group}`);
      for (const id of ids) lines.push(describeActionOp(id));
    }
  }
  return lines.join('\n');
}

function describeVideoModels(): string {
  const rows = VIDEO_GENERATOR_MODELS.flatMap((model) => {
    const modes = getVideoGeneratorReferenceModes(model);
    return modes.map((mode) => {
      const handles = getVideoGeneratorTargetHandles(model, mode);
      const label = `${model} (${VIDEO_GENERATOR_MODEL_LABELS[model]})`;
      const modeSuffix =
        modes.length > 1 ? ` + referenceMode "${mode}"` : ` [referenceMode "${mode}"]`;
      return `- ${label}${modeSuffix} — accepts: ${handles.join(', ')}`;
    });
  });
  return [
    'VIDEO GENERATOR MODELS — a videoGen/veoDirector/veoFast node CHANGES ITS INPUT HANDLES',
    'with `data.model` AND `data.referenceMode`. Pick both first, then wire to the handles',
    'it actually has. Veo REJECTS reference images and first/last frames in one request —',
    'set referenceMode "frames" for a first-frame→last-frame shot, "images" for a moodboard:',
    ...rows,
    '',
    `IMAGE GENERATOR MODELS — the ONLY values a nanoGen \`data.model\` accepts: ${IMAGE_GENERATOR_MODELS.join(', ')}.`,
    'DO NOT set `model` on a nanoGen at all unless the user names one — the default',
    '(nano-banana-2) is the first-party model. gpt-image-2 / flux-2-* are external',
    'paid providers reserved for an explicit user request.',
    '',
    'IMAGE SIZES — a nanoGen `data.imageSize` is only legal for the models that take one:',
    ...IMAGE_GENERATOR_MODELS.map((model) =>
      supportsImageSize(model)
        ? `- ${model} — ${imageSizesForModel(model).join(' | ')}`
        : `- ${model} — takes NO imageSize; do not set one`,
    ),
  ].join('\n');
}

// The exact wire shape of a set_timeline item, spelled out so the model emits it
// on the FIRST try. Field-name guessing (mediaId, durationMs, clipIndex, …) burns
// a whole tool-loop step per wrong shape — the drift test in agent-vocabulary.test
// keeps this line honest against timelineItemSpecSchema.
const TIMELINE_ITEM_SHAPE: Record<keyof TimelineItemSpec, string> = {
  sourceNodeId: 'id of a clip node wired into media-in',
  order: '0-based position in the cut',
  kind: "'video' | 'image' (optional)",
  trimStartSec: 'seconds (optional)',
  trimEndSec: 'seconds (optional)',
  durationSec: 'seconds a still holds; images only (optional)',
  muteAudio: 'boolean (optional)',
  transition: `{ type: ${CLIP_TRANSITION_TYPES.join('|')}, durationSec } — INTO this clip (optional)`,
};

// ---------------------------------------------------------------------------
// The edit-op wire shape
// ---------------------------------------------------------------------------

// Same lesson as TIMELINE_ITEM_SHAPE, one level up: an op whose field names are guessed
// is rejected by a `.strict()` union and costs a whole tool-loop step per wrong guess.
// Measured on the toolloop bench's `edit` scenario before this block existed — the model
// spent NINE consecutive edit_canvas calls cycling ref/value/config against
// id/label/data, burned 100k input tokens, and still dropped half the edit.
//
// The trap is not ignorance, it is INTERFERENCE: build_canvas names a new node `ref` and
// wires `from_ref`/`to_ref`, so those spellings are already in the turn's context when
// the edit is written. Every op below is derived from `workflowEditOpSchema` itself, so
// the two spellings cannot drift apart in the prompt the way they did in the model.
const EDIT_OP_FIELD_NOTES: Record<string, string> = {
  id: 'the EXISTING node id, from inspect_canvas or build_canvas refToId — never your own ref',
  ref: 'your name for a node being ADDED — add_node is the one op that takes a ref',
  data: 'config fields, e.g. { positivePrompt } — not `config`, not `value`',
  label: 'the new display name — not `value`',
  from: 'source node id — not `from_ref`',
  to: 'target node id — not `to_ref`',
  role: 'optional hint like "prompt" or "ref-images"; the canvas resolves the handle',
  items: 'see TIMELINE PLACEMENT below',
};

interface EditOpShape {
  op: string;
  required: string[];
  optional: string[];
}

/** Every member of the discriminated union, read off the schema rather than retyped. */
function editOpShapes(): EditOpShape[] {
  const union = workflowEditOpSchema as unknown as {
    options?: Array<{
      shape: Record<string, { safeParse: (input: unknown) => { success: boolean } }>;
    }>;
    def?: {
      options?: Array<{
        shape: Record<string, { safeParse: (input: unknown) => { success: boolean } }>;
      }>;
    };
  };
  const options = union.options ?? union.def?.options ?? [];
  return options.flatMap((option) => {
    const shape = option.shape;
    // The discriminant's literal value is the op name. Zod does not expose it the same
    // way across minor versions, so probe it: exactly one string parses.
    const opField = shape.op as unknown as { def?: { values?: string[]; value?: string } };
    const op = opField?.def?.values?.[0] ?? opField?.def?.value;
    if (typeof op !== 'string') return [];
    const required: string[] = [];
    const optional: string[] = [];
    for (const key of Object.keys(shape)) {
      if (key === 'op') continue;
      (shape[key]?.safeParse(undefined).success ? optional : required).push(key);
    }
    return [{ op, required, optional }];
  });
}

function describeEditOps(): string {
  const lines = [
    'EDIT OPS — the exact wire shape of every `edit_canvas` op. A `[key]` is optional.',
    "These field names are NOT build_canvas's. A build names a NEW node `ref` and wires",
    '`from_ref`/`to_ref`; an edit names an EXISTING node `id` and wires `from`/`to`. Carrying',
    'the build spelling into an edit is rejected outright and costs a whole tool call.',
  ];
  for (const { op, required, optional } of editOpShapes()) {
    const fields = [...required, ...optional.map((key) => `[${key}]`)];
    lines.push(`  ${op}: ${['op', ...fields].join(', ')}`);
  }
  const notes = Object.entries(EDIT_OP_FIELD_NOTES).map(([key, note]) => `  ${key} — ${note}`);
  return [...lines, 'What each field means:', ...notes].join('\n');
}

function describeTimelinePlacement(): string {
  const fields = Object.entries(TIMELINE_ITEM_SHAPE)
    .map(([field, hint]) => `    ${field}: ${hint}`)
    .join('\n');
  return [
    'TIMELINE PLACEMENT (timelineEditor)',
    'Wiring a clip into `media-in` puts it in the pool; PLACING it on the timeline is a',
    'separate step: edit_canvas with ONE op — { op: "set_timeline", id, items: [...] }.',
    'Each item is exactly:',
    fields,
    'All times are SECONDS. Every sourceNodeId must already be wired into media-in.',
  ].join('\n');
}

/**
 * The full node vocabulary + wiring rules, as a prompt block. Deterministic — safe
 * to embed in a cached system prompt.
 */
export function describeNodeVocabulary(): string {
  return [
    'NODE TYPES — every type the canvas accepts. Anything else is rejected.',
    STUDIO_NODE_TYPES.map(describeNode).join('\n'),
    '',
    describeActionOps(),
    '',
    describeVideoModels(),
    '',
    describeEditOps(),
    '',
    describeTimelinePlacement(),
    '',
    'WIRING RULES',
    '- You never choose a handle. Say `connect A -> B` and, if it helps, name a `role`',
    '  (e.g. "prompt", "first-frame", "ref-images"); the canvas resolves the legal handle.',
    '- Text flows from `string` / `videoDecode`. Images flow from `image` / `nanoGen` / `frameExtract`.',
    '  Video flows from `video`, any video generator, `extendVideo`, `timelineEditor`, `omniGen`.',
    '- A prompt handle takes exactly ONE text input. Reference-image handles take many.',
    '- `image` / `video` / `audio` / `document` / `element` / `designRef` are SOURCES: they',
    '  take no inputs. To use a library asset, add the node and `attach_media` its storage',
    '  coordinates to it.',
    '- An `action` takes its shape from `data.actionId` (ACTION OPS above). A `router` passes',
    '  one input to many consumers unchanged. A `batch` holds a list and repeats everything',
    '  downstream of it once per item — SET its `itemType` when you add it, because a batch',
    '  with no itemType has no output modality and every edge from it is refused.',
    '  `export` and `note` never produce an output.',
  ].join('\n');
}
