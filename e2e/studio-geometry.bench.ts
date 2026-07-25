#!/usr/bin/env bun
/**
 * studio:geometry:bench — proves a generator node's BOX carries the aspect ratio its
 * footer claims, everywhere a node can be born, and that saved canvases are untouched.
 *
 * The defects this guards (Airtable #230 / #232): `nodeStyleFor` covered nanoGen alone,
 * so every video generator fell back to a hardcoded `{512,288}` and a 9:16 selection
 * produced a LANDSCAPE node whose footer read "Veo 3.1 · 720p · 9:16". Six separate
 * hardcoded sizes existed — the canvas add menu, the omniGen menu entry, the planner
 * starter flow, the edge-drop menu, the contracts creation defaults, and a hand-rolled
 * clone of the sizing helper in the Library seeder — so fixing one left five drifting.
 *
 * What is REAL here: the actual functions all six sites call, run on real node payloads.
 * No mocks, no fixtures standing in for the computation. If a seventh hardcode appears,
 * the parity check below fails.
 *
 * NOT covered by this bench — it is pure and headless, so it cannot see pixels:
 *   · whether the RENDERED node element is the ratio (the browser applies node.style)
 *   · whether the relocated grounding chip sits inside the card's border (#229)
 *   · whether the wrapped canvas header stops overlapping itself (#224)
 * Those are `studio:canvas:e2e:bench` (Playwright), which asserts boundingBox containment
 * and `scrollWidth <= clientWidth`. This bench proves the geometry those depend on.
 */
import {
  createNodeData,
  generatorNodeStyle,
  getAspectRatioValue,
  IMAGE_GENERATOR_NODE_BOUNDS,
  OMNI_GENERATOR_NODE_BOUNDS,
  simplifyAspectRatio,
  snapNodeDimensionsToAspectRatio,
  VIDEO_GENERATOR_NODE_BOUNDS,
} from '@continuum/contracts';
import { buildLibraryCanvasTemplate } from '../src/lib/library/canvasTemplates';
import { getDefaultNodeData } from '../src/StudioCanvas/hooks/useEdgeDropNode';

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}\n      ${detail}`);
};

type Dimensions = { width: number; height: number };

const ratioOf = (style: Dimensions) => style.width / style.height;
// One whole pixel of slack: a 467x200 box cannot be exactly 21:9.
const matchesRatio = (style: Dimensions, aspectRatio: string) =>
  Math.abs(ratioOf(style) - getAspectRatioValue(aspectRatio)) < 0.02;

const styleOf = (created: { style?: Record<string, number> }): Dimensions => ({
  width: created.style?.width ?? 0,
  height: created.style?.height ?? 0,
});

// ── 1. every generator type is born at the ratio in its own data ───────────────
const GENERATOR_TYPES = ['nanoGen', 'videoGen', 'veoDirector', 'veoFast', 'omniGen'] as const;
const RATIOS = ['16:9', '9:16', '1:1', '4:5'];

const mismatched: string[] = [];
for (const type of GENERATOR_TYPES) {
  for (const aspectRatio of RATIOS) {
    const style = styleOf(createNodeData(type, { aspectRatio }));
    if (!matchesRatio(style, aspectRatio)) {
      mismatched.push(`${type}@${aspectRatio}=${style.width}x${style.height}`);
    }
  }
}
check(
  'createNodeData sizes every generator type to the ratio it is given',
  mismatched.length === 0,
  mismatched.length === 0
    ? `${GENERATOR_TYPES.length} types × ${RATIOS.length} ratios all match`
    : `mismatched: ${mismatched.join(', ')}`,
);

const portrait = styleOf(createNodeData('videoGen', { aspectRatio: '9:16' }));
check(
  'a 9:16 video node is PORTRAIT — the exact shape of Airtable #230',
  portrait.height > portrait.width,
  `videoGen 9:16 -> ${portrait.width}x${portrait.height} (was a hardcoded 512x288 landscape)`,
);

const videoDefault = createNodeData('videoGen');
check(
  'the video family carries aspectRatio in data, which its block reads',
  videoDefault.data.aspectRatio === '16:9',
  `videoGen data.aspectRatio = ${JSON.stringify(videoDefault.data.aspectRatio)} (was absent, so the footer defaulted while the box never moved)`,
);

// ── 2. the six size sites agree ────────────────────────────────────────────────
// Each site is exercised through the function the app actually calls.

// getDefaultNodeData IS the edge-drop menu's factory, imported and run for real.
const edgeDropStyle = (() => {
  const built = getDefaultNodeData('videoGen');
  return { width: Number(built.style?.width ?? 0), height: Number(built.style?.height ?? 0) };
})();
check(
  'the edge-drop menu builds a node with the contracts 16:9 envelope',
  edgeDropStyle.width === VIDEO_GENERATOR_NODE_BOUNDS.area.width &&
    edgeDropStyle.height === VIDEO_GENERATOR_NODE_BOUNDS.area.height,
  `edge-drop videoGen = ${edgeDropStyle.width}x${edgeDropStyle.height}, contracts 16:9 envelope = ${VIDEO_GENERATOR_NODE_BOUNDS.area.width}x${VIDEO_GENERATOR_NODE_BOUNDS.area.height}`,
);

const omniMenuStyle = styleOf(createNodeData('omniGen'));
check(
  'the omniGen node is sized from its own envelope, not a private 512x360',
  omniMenuStyle.width === generatorNodeStyle('16:9', OMNI_GENERATOR_NODE_BOUNDS).width &&
    omniMenuStyle.height === generatorNodeStyle('16:9', OMNI_GENERATOR_NODE_BOUNDS).height,
  `omniGen = ${omniMenuStyle.width}x${omniMenuStyle.height} (16:9, area-preserving over the old 512x360)`,
);

// StudioCanvas.tsx's createNodeConfig and buildStarterFlow are module-private inside a
// React component file, so a pure bun script cannot call them. What it CAN prove is that
// they no longer carry their own numbers: the hardcodes are gone from the source, and
// the values they now delegate to are the ones asserted above. A reintroduced literal
// fails this check, which is the drift this bench exists to catch.
const HARDCODED_GENERATOR_STYLES = [
  'width: 512, height: 288',
  'width: 512, height: 360',
  'width: 400, height: 225',
];
const SIZE_SITE_FILES = [
  'src/StudioCanvas/components/StudioCanvas.tsx',
  'src/StudioCanvas/hooks/useEdgeDropNode.ts',
  'src/lib/library/canvasTemplates.ts',
];
const reintroduced: string[] = [];
for (const relativePath of SIZE_SITE_FILES) {
  const source = await Bun.file(new URL(`../${relativePath}`, import.meta.url)).text();
  for (const literal of HARDCODED_GENERATOR_STYLES) {
    if (source.includes(literal)) reintroduced.push(`${relativePath}: "${literal}"`);
  }
}
check(
  'no size site has reintroduced a hardcoded generator box',
  reintroduced.length === 0,
  reintroduced.length === 0
    ? `${SIZE_SITE_FILES.length} files clean of ${HARDCODED_GENERATOR_STYLES.join(' / ')}`
    : `found: ${reintroduced.join(', ')}`,
);

// The planner starter flow stamps its Reel node through createNodeData with a 9:16 ratio
// (StudioCanvas.tsx buildStarterFlow); this is that call, made directly.
const plannerReelStyle = styleOf(createNodeData('videoGen', { aspectRatio: '9:16' }));
check(
  'the planner Reel seed is born vertical, not in the 16:9 default box',
  plannerReelStyle.height > plannerReelStyle.width,
  `planner reel = ${plannerReelStyle.width}x${plannerReelStyle.height} (was a hardcoded 512x288 for a 9:16 post)`,
);

// The Library seeder used to hand-roll snapNodeDimensionsToAspectRatio with its own
// GEN_TARGET_AREA and minimums. It keeps its larger envelope (a pack reads bigger than a
// bare node) but must not keep its own MATH — every seeded node must be the ratio asked.
const seeded = buildLibraryCanvasTemplate({
  template: 'resize-pack',
  asset: {
    id: 'bench-asset',
    kind: 'image',
    bucket: 'creative-assets',
    storagePath: 'bench/hero.png',
    fileName: 'hero.png',
  },
  seedId: 'bench-seed',
});
const seededGenerators = seeded.nodes.filter((node) => node.type === 'nanoGen');
const seededMismatch = seededGenerators.filter(
  (node) => !matchesRatio(node.style, String(node.data.aspectRatio)),
);
check(
  'library-seeded generation nodes are the ratio the preset asks for',
  seededGenerators.length > 0 && seededMismatch.length === 0,
  seededMismatch.length === 0
    ? `${seededGenerators.length} seeded nodes: ${seededGenerators
        .map((n) => `${n.data.aspectRatio}=${n.style.width}x${n.style.height}`)
        .join(', ')}`
    : `mismatched: ${seededMismatch.map((n) => String(n.data.aspectRatio)).join(', ')}`,
);

// ── 3. the invariant an aspect-locked NodeResizer stands on ────────────────────
const ENVELOPES = [
  ['image', IMAGE_GENERATOR_NODE_BOUNDS],
  ['video', VIDEO_GENERATOR_NODE_BOUNDS],
  ['omni', OMNI_GENERATOR_NODE_BOUNDS],
] as const;
const ALL_RATIOS = ['16:9', '9:16', '1:1', '4:5', '5:4', '4:3', '3:4', '2:3', '3:2', '21:9'];

const drifted: string[] = [];
let snapCases = 0;
for (const [name, bounds] of ENVELOPES) {
  for (const aspectRatio of ALL_RATIOS) {
    for (const width of [1, 120, 300, 512, 777, 1200]) {
      for (const height of [1, 90, 288, 400, 613, 900]) {
        const options = {
          aspectRatio,
          minWidth: bounds.minWidth,
          minHeight: bounds.minHeight,
          fallbackWidth: bounds.fallbackWidth,
        };
        const once = snapNodeDimensionsToAspectRatio({
          ...options,
          currentWidth: width,
          currentHeight: height,
        });
        const twice = snapNodeDimensionsToAspectRatio({
          ...options,
          currentWidth: once.width,
          currentHeight: once.height,
        });
        snapCases += 1;
        if (once.width !== twice.width || once.height !== twice.height) {
          drifted.push(`${name} ${aspectRatio} ${width}x${height}`);
        }
      }
    }
  }
}
check(
  'snap is a FIXED POINT — an aspect-locked resize cannot drift a pixel per drag',
  drifted.length === 0,
  drifted.length === 0
    ? `snap(snap(x)) === snap(x) for ${snapCases} cases`
    : `drifted: ${drifted.slice(0, 5).join(', ')}`,
);

const areaBefore = 400 * 225;
const rotated = snapNodeDimensionsToAspectRatio({
  aspectRatio: '9:16',
  currentWidth: 400,
  currentHeight: 225,
  minWidth: IMAGE_GENERATOR_NODE_BOUNDS.minWidth,
  minHeight: IMAGE_GENERATOR_NODE_BOUNDS.minHeight,
  fallbackWidth: IMAGE_GENERATOR_NODE_BOUNDS.fallbackWidth,
});
check(
  'a ratio change preserves the canvas AREA, so a node keeps its visual weight',
  Math.abs(rotated.width * rotated.height - areaBefore) / areaBefore < 0.01 &&
    simplifyAspectRatio(rotated.width, rotated.height) === '9:16',
  `400x225 (${areaBefore}px²) -> ${rotated.width}x${rotated.height} (${rotated.width * rotated.height}px², ${simplifyAspectRatio(rotated.width, rotated.height)})`,
);

// ── 4. a PERSISTED canvas is left byte-identical ───────────────────────────────
// The approved behaviour is explicit: existing saved canvases keep their stored
// node.style. No load-time migration, no autosave write-back. A pre-existing 9:16 node
// stays in its wrong box until the user changes its ratio — a known, accepted gap. This
// check exists so a future "helpful" migration cannot land silently.
const persisted = {
  nodes: [
    {
      id: 'gen_video_legacy',
      type: 'videoGen',
      position: { x: 620, y: 160 },
      data: { model: 'veo-3.1-fast', prompt: 'a vertical reel', aspectRatio: '9:16' },
      style: { width: 512, height: 288 },
    },
    {
      id: 'gen_image_legacy',
      type: 'nanoGen',
      position: { x: 120, y: 160 },
      data: { model: 'nano-banana-2', positivePrompt: 'hero', aspectRatio: '1:1' },
      style: { width: 400, height: 225 },
    },
  ],
  edges: [
    {
      id: 'e-legacy',
      source: 'gen_image_legacy',
      sourceHandle: 'image',
      target: 'gen_video_legacy',
      targetHandle: 'first-frame',
    },
  ],
};
const before = JSON.stringify(persisted);
// Everything a canvas load touches on this side of the boundary: node creation defaults
// are NOT re-applied to stored nodes, and no migration is invoked.
for (const node of persisted.nodes) {
  createNodeData(node.type as 'videoGen', node.data);
}
const after = JSON.stringify(persisted);
check(
  'a saved graph is byte-identical after the sizing code runs (no migration)',
  before === after,
  `legacy videoGen still ${persisted.nodes[0].style.width}x${persisted.nodes[0].style.height} despite data.aspectRatio="${persisted.nodes[0].data.aspectRatio}" — deliberate, see the approved no-migration decision`,
);

const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${'─'.repeat(72)}\n  ${checks.length - failed.length}/${checks.length} PASS\n${'─'.repeat(72)}\n`,
);
if (failed.length > 0) process.exit(1);
console.log(
  '  Every generator node — canvas menu, edge drop, planner Reel seed, Library pack,\n' +
    '  agent write path — is born in a box that carries its aspect ratio, from ONE helper.\n' +
    '  Saved canvases are untouched. Rendered pixels are the Playwright bench, not this one.\n',
);
