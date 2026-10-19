#!/usr/bin/env bun

import {
  buildPlannerReelCompositionCluster,
  PUBLISH_VIDEO_INPUT_HANDLE,
} from '@continuum/contracts';

import {
  extractPlannerCompositionClips,
  fingerprintPlannerCompositionClips,
  mergePlannerCompositionCluster,
} from '../src/lib/organic/plannerComposition.server';
import { toReelClip } from '../src/lib/organic/plannerReelStitch';
import { publishCanvasRequestSchema } from '../src/lib/organic/publish-canvas';
import {
  normalizeWorkflowSnapshot,
  serializeWorkflowSnapshot,
} from '../src/StudioCanvas/utils/workflowSerialization';
import { createBenchRecorder } from './support/benchRecorder';

// Pure fixtures — no network, DB, model or browser. Each assertion is one Recorder row and
// the last stdout line is the JSON envelope the factory and organic:qa:bench read.
const recorder = createBenchRecorder('planner:composition:bench', [
  'pure: fixture clips → composition cluster → persisted graph; no render, storage or route hop',
]);
let failures = 0;

const assert = (condition: unknown, message: string) => {
  if (!condition) failures += 1;
  recorder.record(message, condition ? 'PASS' : 'FAIL');
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

const contentJson = {
  creative: {
    mediaSuggestion: {
      reel: {
        scenes: [
          {
            index: 1,
            role: 'body',
            durationSec: 6,
            bucket: 'organic-media',
            clipUrl: 'bench/scene-2.mp4',
            signedClipUrl: 'https://media.example/scene-2.mp4',
            captionText: 'Proof, then payoff.',
          },
          {
            index: 0,
            role: 'hook',
            durationSec: 6,
            bucket: 'organic-media',
            clipUrl: 'bench/scene-1.mp4',
            signedClipUrl: 'https://media.example/scene-1.mp4',
            captionText: 'Start with the tension.',
          },
        ],
      },
    },
  },
};

const clips = extractPlannerCompositionClips(contentJson);
assert(clips.map((clip) => clip.index).join(',') === '0,1', 'orders persisted clips');
assert(
  fingerprintPlannerCompositionClips(clips).startsWith('sha256:'),
  'fingerprints the durable source revision',
);
const plannerStitchClips = clips.map((clip) =>
  toReelClip({ ...clip, signedUrl: clip.signedUrl ?? 'https://media.example/refreshed.mp4' }),
);
assert(
  plannerStitchClips.every((clip) => clip.signedClipUrl.length > 0),
  'maps the same durable clips to the Planner stitch path',
);

const cluster = buildPlannerReelCompositionCluster({
  compositionId: '00000000-0000-4000-8000-000000000001',
  draftId: '00000000-0000-4000-8000-000000000002',
  platform: 'instagram',
  clips,
});
const merged = mergePlannerCompositionCluster(
  [{ id: 'existing', type: 'string', position: { x: 0, y: 0 }, data: { value: 'Keep me' } }],
  [],
  cluster,
);
assert(
  merged.nodes.some((node) => node.id === 'existing'),
  'preserves unrelated Canvas work',
);

const timeline = merged.nodes.find((node) => node.id === cluster.timelineNodeId);
const publish = merged.nodes.find((node) => node.id === cluster.publishNodeId);
const publishEdge = merged.edges.find((edge) => edge.target === cluster.publishNodeId);
assert(timeline?.type === 'timelineEditor', 'seeds the editable Video Editor node');
assert(
  Array.isArray(timeline?.data.items) && timeline.data.items.length === clips.length,
  'places every clip on the timeline',
);
assert(publish?.type === 'plannerDraft', 'adds the Planner attachment sink (plannerDraft)');
assert(
  publishEdge?.targetHandle === PUBLISH_VIDEO_INPUT_HANDLE,
  'connects the rendered timeline output to Planner',
);

const persisted = serializeWorkflowSnapshot(merged.nodes, merged.edges, 'default');
const restored = normalizeWorkflowSnapshot(persisted, 'default');
const restoredTimeline = restored.nodes.find((node) => node.id === cluster.timelineNodeId);
assert(
  restoredTimeline?.data.plannerCompositionId === '00000000-0000-4000-8000-000000000001',
  'preserves composition identity across Canvas persistence',
);

const publishRequest = publishCanvasRequestSchema.parse({
  brandId: '00000000-0000-4000-8000-000000000003',
  draftId: '00000000-0000-4000-8000-000000000002',
  compositionId: '00000000-0000-4000-8000-000000000001',
  resultAssetId: '00000000-0000-4000-8000-000000000004',
  bucket: 'media-library',
  storagePath: 'bench/final-reel.mp4',
  mimeType: 'video/mp4',
});
assert(
  publishRequest.compositionId === cluster.publishNodeId.split(':')[1],
  'validates the automatic attachment request',
);

recorder.print();
process.exit(failures > 0 ? 1 : 0);
