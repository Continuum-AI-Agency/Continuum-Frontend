// The "Add Node" catalog, grouped by who runs the node rather than by what it
// produces. Two hover levels only — group, then row. Grouping video models under a
// nested provider level cost four hover-throughs to reach a generator (#260), so the
// provider IS the first level and the models sit flat inside it alongside that
// provider's other nodes.

import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  VIDEO_GENERATOR_MODEL_GROUPS,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_PROVIDER_LABELS,
  type VideoGeneratorModel,
  type VideoGeneratorProvider,
} from '@continuum/contracts';

export type StudioCanvasNodeType =
  | 'nanoGen'
  | 'videoGen'
  | 'veoDirector'
  | 'veoFast'
  | 'omniGen'
  | 'extendVideo'
  | 'hyperframesAgent'
  | 'timelineEditor'
  | 'plannerDraft'
  | 'organicPublish'
  | 'paidPublisher'
  | 'apiRender'
  | 'string'
  | 'note'
  | 'image'
  | 'audio'
  | 'document'
  | 'video'
  | 'videoDecode'
  | 'frameExtract';

export type AddNodeGroup = VideoGeneratorProvider | 'continuum' | 'publishing' | 'inputs';

// A model row carries no desc: the model name IS the description, and six rows
// repeating one generator's blurb reads as a rendering bug.
export type AddNodeRow = {
  type: StudioCanvasNodeType;
  label: string;
  desc?: string;
  tag: string;
  model?: VideoGeneratorModel;
};

export type AddNodeGroupSection = {
  group: AddNodeGroup;
  label: string;
  rows: readonly AddNodeRow[];
};

const VIDEO_MODEL_TAG = 'Creative';

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

const videoModelRows = (provider: VideoGeneratorProvider): readonly AddNodeRow[] =>
  VIDEO_GENERATOR_MODEL_GROUPS.filter((group) => group.provider === provider).flatMap((group) =>
    modelsInMenuOrder(group.models).map((model) => ({
      type: 'videoGen' as const,
      label: VIDEO_GENERATOR_MODEL_LABELS[model],
      tag: VIDEO_MODEL_TAG,
      model,
    })),
  );

const ADD_NODE_GROUP_LABELS: Record<AddNodeGroup, string> = {
  ...VIDEO_GENERATOR_PROVIDER_LABELS,
  continuum: 'Continuum',
  publishing: 'Publishing',
  inputs: 'Inputs & Utility',
};

const ADD_NODE_ROWS: Record<AddNodeGroup, readonly AddNodeRow[]> = {
  google: [
    {
      type: 'nanoGen',
      label: 'Image Generation',
      desc: 'Canvas and generator output',
      tag: 'Creative',
    },
    ...videoModelRows('google'),
    {
      type: 'omniGen',
      label: 'Omni Flash (Edit)',
      desc: 'Generate a clip, then chat to edit it into variations',
      tag: 'Creative',
    },
    {
      type: 'extendVideo',
      label: 'Extend Video',
      desc: 'Continue existing footage',
      tag: 'Creative',
    },
    {
      type: 'videoDecode',
      label: 'Video Decoder',
      desc: 'Frame-by-frame creative breakdown',
      tag: 'Intelligence',
    },
  ],
  fal: videoModelRows('fal'),
  continuum: [
    {
      type: 'hyperframesAgent',
      label: 'HyperFrames Agent',
      desc: 'Agentic HTML video creation with media references',
      tag: 'Creative',
    },
    {
      type: 'timelineEditor',
      label: 'Video Editor',
      desc: 'Full editor — trim, split & sequence clips + stills',
      tag: 'Editing',
    },
    {
      type: 'frameExtract',
      label: 'Continuity Frame',
      desc: 'Extract a first, last, or exact video frame',
      tag: 'Editing',
    },
    {
      type: 'apiRender',
      label: 'API Render',
      desc: 'Discover a template, prepare variables, and hand off a PAUSED Meta delivery',
      tag: 'Render',
    },
  ],
  publishing: [
    {
      type: 'plannerDraft',
      label: 'Planner Draft',
      desc: 'Find or create an organic Planner draft, with caption, schedule and creative',
      tag: 'Publishing',
    },
    {
      type: 'organicPublish',
      label: 'Post to Platform',
      desc: 'Post a saved Planner draft now, or arm its schedule',
      tag: 'Publishing',
    },
    {
      type: 'paidPublisher',
      label: 'Paid Ad',
      desc: 'Replace creative on a paused or active Meta ad',
      tag: 'Publishing',
    },
  ],
  inputs: [
    {
      type: 'image',
      label: 'Image Reference',
      desc: 'Image file input',
      tag: 'Utility',
    },
    {
      type: 'video',
      label: 'Video Reference',
      desc: 'Video file input',
      tag: 'Utility',
    },
    {
      type: 'audio',
      label: 'Audio Reference',
      desc: 'Voice or sound input',
      tag: 'Utility',
    },
    {
      type: 'document',
      label: 'Document Context',
      desc: 'PDF and text knowledge',
      tag: 'Utility',
    },
    {
      type: 'string',
      label: 'Text Block',
      desc: 'Prompt and enrichment input',
      tag: 'Intelligence',
    },
    {
      type: 'note',
      label: 'Note / Annotation',
      desc: 'Free-text canvas note with bold (⌘B)',
      tag: 'Utility',
    },
  ],
};

/** Provider groups lead, in the order contracts publishes them. */
export const ADD_NODE_GROUP_ORDER: readonly AddNodeGroup[] = [
  ...VIDEO_GENERATOR_MODEL_GROUPS.map((group) => group.provider),
  'continuum',
  'publishing',
  'inputs',
];

export const ADD_NODE_GROUPS: readonly AddNodeGroupSection[] = ADD_NODE_GROUP_ORDER.map(
  (group) => ({
    group,
    label: ADD_NODE_GROUP_LABELS[group],
    rows: ADD_NODE_ROWS[group],
  }),
);
