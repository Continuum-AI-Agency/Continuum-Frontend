// The "Add Node" catalog — DERIVED, not authored. Every label, blurb, category and
// provider comes from `STUDIO_NODE_REGISTRY` in contracts, so the palette and the agent
// vocabulary cannot describe the same node differently.
//
// Two axes, in this order: the registry's CATEGORY (Text / Image / Video / Audio /
// Document / Action) is the group, and inside a group the rows run provider by provider.
// The provider rides on the row as its `tag` rather than as a second nesting level —
// nesting video models under a provider submenu cost four hover-throughs to reach a
// generator (#260), and a searchable palette makes hovering moot anyway.

import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  getVideoGeneratorProvider,
  STUDIO_NODE_CATEGORY_ORDER,
  STUDIO_NODE_REGISTRY,
  type StudioNodeCategory,
  type StudioNodeProvider,
  type StudioNodeType,
  studioNodeDefinition,
  VIDEO_GENERATOR_MODEL_GROUPS,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_PROVIDER_LABELS,
  type VideoGeneratorModel,
} from '@continuum/contracts';

/**
 * The node types this canvas can actually MOUNT — the keys of `nodeTypes` in
 * `canvasNodeTypes.ts`. The registry is deliberately ahead of the canvas (it declares
 * `element`, `designRef`, `layerEditor`, … before their block components land), so the
 * catalog is the registry INTERSECTED with this list.
 *
 * Repeated here rather than imported because `canvasNodeTypes.ts` pulls in every block
 * COMPONENT, and this module is data the palette, the tests and the agent-facing docs all
 * read. `addNodeCatalog.test.ts` pins the list against that file's real `nodeTypes` map,
 * so registering a component without listing it here fails a test rather than silently
 * keeping the node out of the palette.
 */
export const STUDIO_CANVAS_NODE_TYPES = [
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'omniGen',
  'extendVideo',
  'hyperframesAgent',
  'timelineEditor',
  'plannerDraft',
  'organicPublish',
  'paidPublisher',
  'apiRender',
  'string',
  'note',
  'image',
  'audio',
  'document',
  'video',
  'videoDecode',
  'frameExtract',
  'action',
  'router',
  'export',
  'element',
  'designRef',
] as const satisfies readonly StudioNodeType[];

export type StudioCanvasNodeType = (typeof STUDIO_CANVAS_NODE_TYPES)[number];

/**
 * Mountable, but never OFFERED: both are `videoGen` pinned to one model, and
 * `addNodeAtPointer` rewrites them to `videoGen` on the way in. The per-model expansion
 * below already offers "Veo 3.1" and "Veo 3.1 Fast", so listing these too would put two
 * rows with the same name next to each other, both creating the identical node.
 */
export const LEGACY_VIDEO_ALIAS_NODE_TYPES = ['veoDirector', 'veoFast'] as const;

/**
 * Mountable, and NOT offered yet for a different reason: an `action` node is born with no
 * `actionId`, and contracts gives an op-less action no handles and refuses every
 * connection. Offering it would put a row in the palette that creates a node accepting
 * nothing. It belongs here as one row PER OP (the way `videoGen` is one row per model),
 * which needs `addNodeAtPointer`/`createNodeConfig` to carry an `actionId` the way they
 * already carry a `model`. Until then it is declared, not offered.
 */
export const PENDING_PALETTE_NODE_TYPES = ['action'] as const;

/** A category is a menu group. */
export type AddNodeGroup = StudioNodeCategory;

// A model row carries no desc: the model name IS the description, and six rows
// repeating one generator's blurb reads as a rendering bug.
export type AddNodeRow = {
  type: StudioCanvasNodeType;
  label: string;
  desc?: string;
  /** Who runs it — the provider, shown at the end of the row. */
  tag: string;
  model?: VideoGeneratorModel;
};

export type AddNodeGroupSection = {
  group: AddNodeGroup;
  label: string;
  rows: readonly AddNodeRow[];
};

const CATEGORY_LABELS: Record<StudioNodeCategory, string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  action: 'Action',
};

const PROVIDER_LABELS: Record<StudioNodeProvider, string> = {
  ...VIDEO_GENERATOR_PROVIDER_LABELS,
  continuum: 'Continuum',
};

/** Model hosts lead, so a generator is the first thing in any group that has one. */
const PROVIDER_ORDER: readonly StudioNodeProvider[] = ['google', 'fal', 'continuum'];

/** The default model leads its provider's run so the most-reached row is the first one. */
const modelsInMenuOrder = (
  models: readonly VideoGeneratorModel[],
): readonly VideoGeneratorModel[] =>
  models.includes(DEFAULT_VIDEO_GENERATOR_MODEL)
    ? [
        DEFAULT_VIDEO_GENERATOR_MODEL,
        ...models.filter((model) => model !== DEFAULT_VIDEO_GENERATOR_MODEL),
      ]
    : models;

type PlacedRow = AddNodeRow & { category: AddNodeGroup; provider: StudioNodeProvider };

const isOffered = (type: string): boolean =>
  !(LEGACY_VIDEO_ALIAS_NODE_TYPES as readonly string[]).includes(type) &&
  !(PENDING_PALETTE_NODE_TYPES as readonly string[]).includes(type);

/** One row per video model, filed under the model's own host rather than videoGen's. */
const videoModelRows = (): readonly PlacedRow[] =>
  VIDEO_GENERATOR_MODEL_GROUPS.flatMap((group) =>
    modelsInMenuOrder(group.models).map((model) => ({
      type: 'videoGen' as const,
      label: VIDEO_GENERATOR_MODEL_LABELS[model],
      tag: PROVIDER_LABELS[getVideoGeneratorProvider(model)],
      model,
      category: studioNodeDefinition('videoGen').category,
      provider: getVideoGeneratorProvider(model) as StudioNodeProvider,
    })),
  );

/** Registry key order, not the mountable-list order: the registry is where the reading
 *  order was authored (utilities before terminal handoffs), and the list below it is just
 *  a filter. */
const mountable = new Set<string>(STUDIO_CANVAS_NODE_TYPES);

const plainRows = (): readonly PlacedRow[] =>
  (Object.keys(STUDIO_NODE_REGISTRY) as StudioNodeType[])
    .filter((type) => mountable.has(type) && type !== 'videoGen' && isOffered(type))
    .map((type) => {
      const definition = STUDIO_NODE_REGISTRY[type];
      return {
        type: type as StudioCanvasNodeType,
        label: definition.label,
        desc: definition.description,
        tag: PROVIDER_LABELS[definition.provider],
        category: definition.category,
        provider: definition.provider,
      };
    });

const ALL_ROWS: readonly PlacedRow[] = [...videoModelRows(), ...plainRows()];

const sectionFor = (category: AddNodeGroup): AddNodeGroupSection => ({
  group: category,
  label: CATEGORY_LABELS[category],
  rows: PROVIDER_ORDER.flatMap((provider) =>
    ALL_ROWS.filter((row) => row.category === category && row.provider === provider).map(
      ({ category: _category, provider: _provider, ...row }) => row,
    ),
  ),
});

/** Categories in the order contracts publishes them; an empty one is not rendered. */
export const ADD_NODE_GROUPS: readonly AddNodeGroupSection[] = STUDIO_NODE_CATEGORY_ORDER.map(
  sectionFor,
).filter((section) => section.rows.length > 0);

export const ADD_NODE_GROUP_ORDER: readonly AddNodeGroup[] = ADD_NODE_GROUPS.map(
  (section) => section.group,
);

/** Everything cmdk should match a query against: name, blurb, provider, group. */
export const addNodeSearchValue = (section: AddNodeGroupSection, row: AddNodeRow): string =>
  [row.label, row.desc, row.tag, section.label, row.model].filter(Boolean).join(' ');

/** Stable per-row key — a videoGen row exists once per model. */
export const addNodeRowKey = (row: AddNodeRow): string =>
  row.model ? `${row.type}-${row.model}` : row.type;
