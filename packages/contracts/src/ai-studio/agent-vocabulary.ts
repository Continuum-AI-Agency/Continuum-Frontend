import {
  IMAGE_GENERATOR_MODELS,
  IMAGE_SIZES,
  imageSizesForModel,
  supportsImageSize,
} from './image-size';
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
// a guaranteed drift: adding a node type already means touching seven places, and
// a stale prompt fails silently (the model emits a type the builder rejects).
//
// `NODE_PURPOSE` is typed Record<StudioNodeType, string>, so a new node type does
// not compile until someone says what it is for.

const NODE_PURPOSE: Record<StudioNodeType, string> = {
  string: 'a text / prompt box — the usual way to feed wording into a generator',
  nanoGen: 'image generator',
  videoGen: 'video generator (model-selectable)',
  veoDirector: 'video generator pinned to Veo 3.1 (highest quality, slowest)',
  veoFast: 'video generator pinned to Veo 3.1 Fast (first/last frame driven)',
  omniGen: 'Gemini Omni video generator, conversational variations',
  extendVideo: 'extends an existing video by a few more seconds',
  timelineEditor:
    'Video Editor — the real timeline. Wire clips into its `media-in` pool, then place them as timeline items',
  hyperframesAgent:
    'agentic HTML-to-video composer — accepts a prompt plus image, video, and audio references, then renders a video',
  organicPublisher:
    'terminal sink — attaches image, carousel, or video creative to an existing organic Planner draft',
  paidPublisher:
    'terminal sink — replaces image, carousel, or video creative on an existing Meta ad',
  apiRender:
    'terminal sink — prepares a version-pinned API template render and PAUSED Meta delivery for explicit confirmation',
  image: 'a reference image already in the brand library or uploaded',
  video: 'a reference video already in the brand library or uploaded',
  audio: 'a reference audio file',
  document: 'a reference document (pdf / txt) whose text can be read',
  videoDecode: 'decodes a video into a text description of its frames',
  frameExtract:
    'extracts an exact first, last, or timestamped frame from a video in the browser for shot continuity',
};

const formatHandle = (type: StudioNodeType, handle: string): string => {
  const node = { id: '_', type, data: createNodeData(type).data };
  const limit = getTargetHandleConnectionLimit(node, handle, []);
  return limit === undefined ? handle : `${handle} (max ${limit})`;
};

// Legal values for the enum-shaped config fields the whitelist advertises. These are
// now COERCED at write time (coerceNodeConfig), so an invented value no longer reaches
// the generation endpoint — but the model still writes better nodes when it is told the
// vocabulary up front, and a coerced node is not the node the user asked for.
const CONFIG_FIELD_HINTS: Record<string, string> = {
  imageSize: `${IMAGE_SIZES.join('|')} — MODEL-DEPENDENT, see below`,
  aspectRatio: '16:9, 9:16, 1:1, …',
  durationSeconds: '4|6|8',
  resolution: '720p|1080p',
  outputFormat: 'mp4',
  items: 'READ-ONLY here — place clips with the set_timeline op, never update_node',
  referenceMode:
    'images|frames — Veo takes ONE or the other per request; it CHANGES the node handles',
};

const formatConfigField = (field: string): string => {
  const hint = CONFIG_FIELD_HINTS[field];
  return hint ? `${field} (${hint})` : field;
};

function describeNode(type: StudioNodeType): string {
  const node = { id: '_', type, data: createNodeData(type).data };
  const inputs = getAllowedTargetHandles(node);
  const outputs = getAllowedSourceHandles(node);
  const config = AGENT_FIELD_WHITELIST[type] ?? [];

  const parts = [`- ${type} — ${NODE_PURPOSE[type]}`];
  parts.push(
    `    in: ${inputs.length ? inputs.map((h) => formatHandle(type, h)).join(', ') : '(none — it is a source)'}`,
  );
  parts.push(`    out: ${outputs.length ? outputs.join(', ') : '(none — it is a sink)'}`);
  if (config.length) parts.push(`    config: ${config.map(formatConfigField).join(', ')}`);
  return parts.join('\n');
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
    describeVideoModels(),
    '',
    describeTimelinePlacement(),
    '',
    'WIRING RULES',
    '- You never choose a handle. Say `connect A -> B` and, if it helps, name a `role`',
    '  (e.g. "prompt", "first-frame", "ref-images"); the canvas resolves the legal handle.',
    '- Text flows from `string` / `videoDecode`. Images flow from `image` / `nanoGen` / `frameExtract`.',
    '  Video flows from `video`, any video generator, `extendVideo`, `timelineEditor`, `omniGen`.',
    '- A prompt handle takes exactly ONE text input. Reference-image handles take many.',
    '- `image` / `video` / `audio` / `document` are SOURCES: they take no inputs. To use a',
    '  library asset, add the node and `attach_media` its storage coordinates to it.',
  ].join('\n');
}
