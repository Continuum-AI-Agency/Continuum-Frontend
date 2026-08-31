// The "Add Node" catalog — DERIVED, not authored. Every label, blurb, category and
// provider comes from `STUDIO_NODE_REGISTRY` in contracts, so the palette and the agent
// vocabulary cannot describe the same node differently.
//
// Two axes, in this order: the registry's CATEGORY (Text / Image / Video / Audio /
// Document / Action) is the group, and inside a group the rows run provider by provider.
// The provider rides on the row as its `tag`; `sectionLayout` additionally derives ONE
// nesting level per category for the hover tree — provider submenus where a category
// spans more than one provider, family submenus for the op catalog — while a
// single-provider category stays flat and SEARCH stays a flat ranked list either way.

import {
  ACTION_DEFS,
  ACTION_IDS,
  type ActionId,
  type ActionModality,
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

// The implemented-op filter comes from the runner itself rather than a copy of its list:
// an op with no runner would be a palette row whose Run button is born greyed out. The
// static import is safe for the page bundle — `runAction.ts` reaches 28 modules and NONE
// of them import mediabunny, because the two heavy paths (`subtitlesOp`, and
// `actionEngines`/`composeTimeline` behind `WORKER_OPS_WITH_ENGINES`) are already kept
// dynamic/duplicated for exactly this reason. Re-run the trace before adding a static
// import to any of them.
import { isImplementedAction } from '../utils/actions/runAction';

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
  'layerEditor',
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
  'batch',
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
 * Mountable types the palette holds back on purpose. EMPTY today, and kept as the one
 * declared home for that state: `action` used to sit here because an op-less action node
 * is born with no `actionId`, and contracts gives it no handles and refuses every
 * connection. It graduated as one row PER OP (the way `videoGen` is one row per model) —
 * see `actionOpRows` below — so there is nothing left to hold back. A type that mounts
 * but must not be offered belongs here with the reason, never silently missing from
 * `plainRows`; `addNodeCatalog.test.ts` proves every entry still mounts.
 */
export const PENDING_PALETTE_NODE_TYPES = [] as const;

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
  /** Set on `action` rows: the op the created node is born configured for. */
  actionId?: ActionId;
  /**
   * Set on `action` rows: the op registry's menu grouping inside the family (`Colour`,
   * `Transform`, …), read from `ACTION_DEFS` — the third hover level derives from it.
   */
  group?: string;
  /**
   * Set on `action` rows: what the op operates on. Contracts gives five pairs of ops the
   * SAME label — Blur, Colour Grade, Filter, Crop to Ratio, Pad to Ratio all exist once
   * for stills and once for clips — and two rows reading `Blur` with no way to tell them
   * apart is the exact trap `LEGACY_VIDEO_ALIAS_NODE_TYPES` above warns about. The family
   * rides on the row next to the provider tag rather than being folded into the label, so
   * `Blur` stays the thing you type and the row still says which `Blur` it is.
   */
  family?: ActionModality;
};

/** What an op works on, for the row's tag. */
export const ACTION_FAMILY_LABELS: Record<ActionModality, string> = {
  image: 'Image',
  video: 'Video',
  text: 'Text',
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

/**
 * The action catalog's group order, taken from the order `ACTION_DEFS` first mentions each
 * group rather than authored a second time here — the registry is where the reading order
 * was decided, and a hand-kept copy is a list that drifts the next time an op lands.
 */
const ACTION_GROUP_ORDER: readonly string[] = [
  ...new Set(ACTION_IDS.map((id) => ACTION_DEFS[id].group)),
];

/**
 * One row per IMPLEMENTED op — the `videoGen`-per-model pattern. An `action` node with no
 * op has no handles and accepts nothing, so the op is what makes the row addable at all:
 * it rides on the row as `actionId` and `createNodeConfig` stamps it into the new node.
 */
const actionOpRows = (): readonly PlacedRow[] => {
  const definition = studioNodeDefinition('action');
  return ACTION_IDS.filter(isImplementedAction)
    .map((id) => ACTION_DEFS[id])
    .sort(
      (a, b) =>
        ACTION_GROUP_ORDER.indexOf(a.group) - ACTION_GROUP_ORDER.indexOf(b.group) ||
        a.label.localeCompare(b.label),
    )
    .map((def) => ({
      type: 'action' as const,
      label: def.label,
      desc: def.description,
      tag: PROVIDER_LABELS[definition.provider],
      actionId: def.id,
      family: def.family,
      group: def.group,
      category: definition.category,
      provider: definition.provider,
    }));
};

/** Registry key order, not the mountable-list order: the registry is where the reading
 *  order was authored (utilities before terminal handoffs), and the list below it is just
 *  a filter. */
const mountable = new Set<string>(STUDIO_CANVAS_NODE_TYPES);

const plainRows = (): readonly PlacedRow[] =>
  (Object.keys(STUDIO_NODE_REGISTRY) as StudioNodeType[])
    // `videoGen` and `action` are expanded per model / per op above; a plain row for
    // either would create a node the expansion already offers, or an op-less one.
    .filter(
      (type) => mountable.has(type) && type !== 'videoGen' && type !== 'action' && isOffered(type),
    )
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

// Op rows last inside their category: 32 of them at the top would bury the handoff nodes
// (Planner Draft, Organic Publish, …) that share the Action group.
const ALL_ROWS: readonly PlacedRow[] = [...videoModelRows(), ...plainRows(), ...actionOpRows()];

/** The Action category's utility split: builders vs. ship-it handoffs. */
export type ActionUtilityGroup = 'tools' | 'implementation';

/** The third hover level: one op-registry group (`Colour`, `Time`, …) inside a family.
 *  Keyed `family:group` because families share group names (image Colour / video Colour). */
export type AddNodeOpGroup = {
  key: string;
  label: string;
  rows: readonly AddNodeRow[];
};

/** A nested hover submenu inside a category — a provider's, an op family's, or an
 *  Action utility group's rows. */
export type AddNodeSubGroup = {
  key: StudioNodeProvider | ActionModality | ActionUtilityGroup;
  label: string;
  rows: readonly AddNodeRow[];
  /** Present when a family spans more than one op-registry group: the ops nest once
   *  more, per group, and `rows` is empty. A single-group family (Text) stays flat. */
  subGroups?: readonly AddNodeOpGroup[];
};

const UTILITY_GROUP_ORDER: readonly ActionUtilityGroup[] = ['tools', 'implementation'];

const UTILITY_GROUP_LABELS: Record<ActionUtilityGroup, string> = {
  tools: 'Tools',
  implementation: 'Implementation',
};

/**
 * The Action utilities' split, an FE presentation decision: builders that shape media in
 * the flow vs. handoffs that ship the result somewhere (API Render delivers into the
 * brand library, so it files under implementation). A handoff type missing here fails
 * the exactly-once catalog test rather than silently vanishing from the hover tree.
 */
const ACTION_UTILITY_GROUP: Partial<Record<StudioCanvasNodeType, ActionUtilityGroup>> = {
  batch: 'tools',
  router: 'tools',
  export: 'tools',
  frameExtract: 'tools',
  plannerDraft: 'implementation',
  organicPublish: 'implementation',
  paidPublisher: 'implementation',
  apiRender: 'implementation',
};

/**
 * How the hover tree renders one category: `direct` rows first, then one submenu per
 * sub-group. Every section row appears exactly once across the two. Search mode ignores
 * this entirely — the ranked list stays flat, the tag already names the provider.
 */
export type AddNodeSectionLayout = {
  direct: readonly AddNodeRow[];
  subGroups: readonly AddNodeSubGroup[];
};

/** The op catalog's reading order: stills, clips, text — mirrors ACTION_FAMILY_LABELS. */
const FAMILY_ORDER: readonly ActionModality[] = ['image', 'video', 'text'];

type SectionEntry = { row: AddNodeRow; provider: StudioNodeProvider };

/**
 * Family nesting wins over provider nesting: the op catalog is all-Continuum today, so
 * the two never coexist — if a second op host ever lands, decide the combined shape then.
 */
const layoutFor = (entries: readonly SectionEntry[]): AddNodeSectionLayout => {
  const ops = entries.filter((entry) => entry.row.family !== undefined);
  if (ops.length > 0) {
    // A family spanning more than one registry group nests its ops once more, per group,
    // in the registry's reading order. The registry's own "two hover levels, never
    // three (#260)" ruling is explicitly superseded by the 2026-08 product request for
    // per-group nesting; the single-group Text family stays flat.
    const familySub = (family: ActionModality): AddNodeSubGroup => {
      const rows = ops.filter((entry) => entry.row.family === family).map((entry) => entry.row);
      const groups = ACTION_GROUP_ORDER.filter((group) => rows.some((row) => row.group === group));
      if (groups.length <= 1) {
        return { key: family, label: ACTION_FAMILY_LABELS[family], rows };
      }
      return {
        key: family,
        label: ACTION_FAMILY_LABELS[family],
        rows: [],
        subGroups: groups.map((group) => ({
          key: `${family}:${group.toLowerCase()}`,
          label: group,
          rows: rows.filter((row) => row.group === group),
        })),
      };
    };
    const utilities = entries.filter((entry) => entry.row.family === undefined);
    return {
      direct: [],
      subGroups: [
        ...UTILITY_GROUP_ORDER.map(
          (group): AddNodeSubGroup => ({
            key: group,
            label: UTILITY_GROUP_LABELS[group],
            rows: utilities
              .filter((entry) => ACTION_UTILITY_GROUP[entry.row.type] === group)
              .map((entry) => entry.row),
          }),
        ),
        ...FAMILY_ORDER.map(familySub),
      ].filter((sub) => sub.rows.length > 0 || (sub.subGroups?.length ?? 0) > 0),
    };
  }

  const providers = new Set(entries.map((entry) => entry.provider));
  if (providers.size > 1) {
    return {
      direct: [],
      subGroups: PROVIDER_ORDER.filter((provider) => providers.has(provider)).map((provider) => ({
        key: provider,
        label: PROVIDER_LABELS[provider],
        rows: entries.filter((entry) => entry.provider === provider).map((entry) => entry.row),
      })),
    };
  }

  return { direct: entries.map((entry) => entry.row), subGroups: [] };
};

const buildSection = (
  category: AddNodeGroup,
): { section: AddNodeGroupSection; layout: AddNodeSectionLayout } => {
  const entries: SectionEntry[] = PROVIDER_ORDER.flatMap((provider) =>
    ALL_ROWS.filter((row) => row.category === category && row.provider === provider).map(
      ({ category: _category, provider: rowProvider, ...row }) => ({ row, provider: rowProvider }),
    ),
  );
  return {
    section: {
      group: category,
      label: CATEGORY_LABELS[category],
      rows: entries.map((entry) => entry.row),
    },
    layout: layoutFor(entries),
  };
};

const BUILT_SECTIONS = STUDIO_NODE_CATEGORY_ORDER.map(buildSection).filter(
  (built) => built.section.rows.length > 0,
);

/** Categories in the order contracts publishes them; an empty one is not rendered. */
export const ADD_NODE_GROUPS: readonly AddNodeGroupSection[] = BUILT_SECTIONS.map(
  (built) => built.section,
);

const SECTION_LAYOUTS = new Map<AddNodeGroup, AddNodeSectionLayout>(
  BUILT_SECTIONS.map((built) => [built.section.group, built.layout]),
);

/** The hover tree's shape for one category. Same row objects the section carries. */
export const sectionLayout = (section: AddNodeGroupSection): AddNodeSectionLayout =>
  SECTION_LAYOUTS.get(section.group) ?? { direct: section.rows, subGroups: [] };

export const ADD_NODE_GROUP_ORDER: readonly AddNodeGroup[] = ADD_NODE_GROUPS.map(
  (section) => section.group,
);

/**
 * Everything cmdk should match a query against: name, blurb, provider, group, and the op
 * id. The id is not decoration — cmdk KEYS an item by its value, so two ops that contracts
 * gave the same label AND the same blurb (`image.crop` / `video.crop`) would collapse into
 * one row without it. It also makes "image.rotate" a query that works.
 */
export const addNodeSearchValue = (section: AddNodeGroupSection, row: AddNodeRow): string =>
  [
    row.label,
    row.desc,
    row.tag,
    section.label,
    row.model,
    row.actionId,
    row.family && ACTION_FAMILY_LABELS[row.family],
  ]
    .filter(Boolean)
    .join(' ');

/** Stable per-row key — a videoGen row exists once per model, an action once per op. */
export const addNodeRowKey = (row: AddNodeRow): string =>
  row.model ? `${row.type}-${row.model}` : row.actionId ? `${row.type}-${row.actionId}` : row.type;
