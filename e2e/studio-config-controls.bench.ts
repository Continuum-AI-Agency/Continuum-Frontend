/**
 * studio-config-controls-bench — proves that EVERY numeric knob on an AI Studio node
 * renders a control you can drag, and that none of them fell back to a bare number box.
 *
 * The unit tests assert this op by op. They cannot answer the question that actually
 * matters, which is a property of the WHOLE registry: an op added later, or a schema
 * that grows a key, gets its controls from `configFieldsFor` with no UI change to
 * review — so the way this regresses is silently, one new op at a time, and no
 * existing test would name it.
 *
 * So this bench renders the REAL `ActionConfigFields` — the same component mounted by
 * both the on-node gear popover and the selection inspector — for EVERY id in the real
 * `ACTION_DEFS`, with the real zod schemas, and reads the controls back out of the
 * produced DOM. No mocked registry, no hand-written field list.
 *
 * What it proves:
 *   1. NO BARE NUMBER BOX SURVIVES  — zero user-facing `input[type=number]` anywhere in
 *      the registry. (Base UI's number field ships a hidden one for form validation;
 *      that is `aria-hidden` and is excluded, because it is not what a user touches.)
 *   2. BOUNDED KNOBS GET A TRACK    — every field `numericControlFor` calls a slider
 *      renders a real `slider-field` with the schema's own min/max on it.
 *   3. THE REST GET A SCRUB HANDLE  — unbounded, nullable and too-wide fields render a
 *      `number-scrub-field` instead, rather than being dropped.
 *   4. NULL STAYS REACHABLE         — a nullable numeric field keeps a way to say
 *      "unset", which is not 0 and cannot be expressed on a track.
 *
 * NOT covered here, stated rather than implied: this renders in happy-dom, so it proves
 * the control that is MOUNTED, not how it looks or that a real pointer drag moves it.
 * Pointer-drag behaviour belongs to Base UI, whose own suite covers it; the keyboard
 * path is asserted in ActionConfigPopover.test.tsx.
 *
 * Run with: bun run studio:config-controls:bench
 */
import { Window } from 'happy-dom';

const startedAt = new Date().toISOString();
const startedMs = Date.now();

// happy-dom has to be installed as the global DOM BEFORE React or testing-library are
// evaluated, so every import below this block is dynamic on purpose.
const win = new Window({ url: 'http://localhost:3000', width: 1024, height: 768 });
const g = globalThis as Record<string, unknown>;
g['window'] = win;
g['document'] = win.document;
g['navigator'] = win.navigator;
for (const key of [
  'Element',
  'SVGElement',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLFormElement',
  'HTMLTextAreaElement',
  'DocumentFragment',
  'Node',
  'NodeFilter',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'DOMRect',
  'getComputedStyle',
] as const) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g['requestAnimationFrame'] = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16);
g['cancelAnimationFrame'] = (h: number) => clearTimeout(h);
// Base UI's positioner measures itself on mount; without this it throws before a single
// assertion runs, which reads as a broken component rather than a missing browser API.
g['ResizeObserver'] = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

const { ACTION_DEFS, ACTION_IDS } = await import('@continuum/contracts');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createElement } = await import('react');
const { cleanup, render } = await import('@testing-library/react');
const { ToastProvider } = await import('../src/components/ui/ToastProvider');
const { ActionConfigFields } = await import('../src/StudioCanvas/nodes/action/ActionConfigFields');
const { configFieldsFor } = await import('../src/StudioCanvas/utils/actions/actionConfig');
const { isOverlayActionId } = await import('../src/StudioCanvas/utils/actions/overlayOp');

/**
 * Three ops answer to a hand-written panel instead of the generic renderer, because
 * their config does not survive four field kinds: a burn-in's placement is a spot on a
 * frame, an overlay's image arrives on a port, and a watermark has no time window at
 * all. Those panels are held to the rule that matters here — every number you can
 * change is draggable — but NOT to control-per-schema-field parity, which for them
 * would assert a design they deliberately do not have.
 */
const handWritten = (id: string): boolean =>
  id === 'video.subtitles' || id === 'image.text' || isOverlayActionId(id as never);

/**
 * Deliberately NOT `numericControlFor`. Importing the rule the component uses would
 * make this a check that reads from the place it wrote: the two agree by construction,
 * and the sweep stays green while every slider quietly turns into a number box. So the
 * expectation is restated here from the SCHEMA — a bound is a bound whatever the UI
 * decides — and a change to the rule has to be made deliberately in both places.
 */
const MAX_AIMABLE_STEPS = 1000;
const shouldHaveTrack = (field: { min?: number; max?: number; step: number; nullable: boolean }) =>
  !field.nullable &&
  field.min !== undefined &&
  field.max !== undefined &&
  field.step > 0 &&
  (field.max - field.min) / field.step <= MAX_AIMABLE_STEPS;

type Grade = 'PASS' | 'FAIL';
const results: Array<{ step: string; grade: Grade; detail?: string }> = [];
const GLYPH: Record<Grade, string> = { PASS: '✓', FAIL: '✗' };

function check(step: string, ok: boolean, detail?: string): void {
  const grade: Grade = ok ? 'PASS' : 'FAIL';
  results.push({ step, grade, detail });
  console.log(`${GLYPH[grade]} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
}

const bareNumberBoxes: string[] = [];
const missingSliders: string[] = [];
const missingScrubs: string[] = [];
const unreachableNulls: string[] = [];
const genericOps: string[] = [];
const handWrittenOps: string[] = [];
let sliderCount = 0;
let scrubCount = 0;
let numericTotal = 0;

for (const actionId of ACTION_IDS) {
  const numeric = configFieldsFor(actionId).filter((field) => field.kind === 'number');
  if (numeric.length === 0) continue;
  numericTotal += numeric.length;

  // The panels that read brand data (the burn-in reads the brand book) go through
  // React Query, so the real component needs a real client to mount at all.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { container } = render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ToastProvider,
        null,
        createElement(ActionConfigFields, { nodeId: 'bench-node', actionId, config: {} }),
      ),
    ),
  );

  // A user-facing number box. Base UI keeps a hidden one per scrub field for native
  // form validation — that is not something anyone types into, so it does not count.
  const visibleNumberBoxes = container.querySelectorAll(
    'input[type="number"]:not([aria-hidden="true"])',
  );
  if (visibleNumberBoxes.length > 0) {
    bareNumberBoxes.push(`${actionId} (${visibleNumberBoxes.length})`);
  }

  const sliders = Array.from(container.querySelectorAll('[data-slot="slider-field"]'));
  const scrubs = Array.from(container.querySelectorAll('[data-slot="number-scrub-field"]'));
  sliderCount += sliders.length;
  scrubCount += scrubs.length;

  if (handWritten(actionId)) {
    handWrittenOps.push(actionId);
    // The only claim these owe: a panel with numbers in it offers something to drag.
    if (sliders.length + scrubs.length === 0) {
      missingSliders.push(`${actionId}: hand-written panel drew no draggable control`);
    }
    cleanup();
    continue;
  }

  genericOps.push(actionId);
  const wantSliders = numeric.filter(
    (field) => field.kind === 'number' && shouldHaveTrack(field),
  );
  const wantScrubs = numeric.filter(
    (field) => field.kind === 'number' && !shouldHaveTrack(field),
  );

  if (sliders.length !== wantSliders.length) {
    missingSliders.push(`${actionId}: drew ${sliders.length}, wanted ${wantSliders.length}`);
  }
  if (scrubs.length !== wantScrubs.length) {
    missingScrubs.push(`${actionId}: drew ${scrubs.length}, wanted ${wantScrubs.length}`);
  }

  // Every slider carries the schema's own bounds, so the track spans the real range.
  for (const field of wantSliders) {
    if (field.kind !== 'number') continue;
    const range = Array.from(container.querySelectorAll('input[type="range"]')).find(
      (input) =>
        input.getAttribute('min') === String(field.min) &&
        input.getAttribute('max') === String(field.max),
    );
    if (!range) {
      missingSliders.push(`${actionId}.${field.key}: no track spanning ${field.min}…${field.max}`);
    }
  }

  // A nullable field must keep a way back to "no value", which a track cannot express.
  for (const field of numeric) {
    if (field.kind !== 'number' || !field.nullable) continue;
    const clear = container.querySelector(`[aria-label="Clear ${field.label}"]`);
    if (!clear) unreachableNulls.push(`${actionId}.${field.key}`);
  }

  cleanup();
}

check(
  'every numeric knob in the registry is draggable',
  bareNumberBoxes.length === 0,
  bareNumberBoxes.length === 0
    ? `${numericTotal} numeric fields across ${ACTION_IDS.length} ops, 0 bare number boxes`
    : `bare number boxes still rendered by: ${bareNumberBoxes.join(', ')}`,
);
check(
  'bounded knobs render a track with the schema bounds',
  missingSliders.length === 0,
  missingSliders.length === 0
    ? `${sliderCount} sliders over ${genericOps.length} generic ops`
    : missingSliders.join('; '),
);
check(
  'unbounded, nullable and too-wide knobs render a scrub handle',
  missingScrubs.length === 0,
  missingScrubs.length === 0 ? `${scrubCount} scrub fields` : missingScrubs.join('; '),
);
check(
  'a nullable knob can still be set back to null',
  unreachableNulls.length === 0,
  unreachableNulls.length === 0
    ? 'every nullable numeric field keeps its clear control'
    : `no way to unset: ${unreachableNulls.join(', ')}`,
);
// A run that rendered nothing is not a pass. The registry has numeric fields in both
// classes, so a zero on either side means the sweep never reached the components.
check(
  'the sweep actually exercised both controls',
  sliderCount > 0 && scrubCount > 0 && numericTotal > 0,
  `${numericTotal} numeric fields → ${sliderCount} sliders, ${scrubCount} scrub fields`,
);

const counts = {
  pass: results.filter((r) => r.grade === 'PASS').length,
  warn: 0,
  skip: 0,
  fail: results.filter((r) => r.grade === 'FAIL').length,
};
const exitCode = counts.fail > 0 ? 1 : 0;
const envelope = {
  bench: 'studio:config-controls:bench',
  startedAt,
  durationMs: Date.now() - startedMs,
  results,
  notes: [
    'Renders in happy-dom: proves which control is mounted, not pointer-drag behaviour.',
    `Control-per-field parity is asserted for the ${genericOps.length} ops the generic ` +
      `renderer draws. The ${handWrittenOps.length} hand-written panels ` +
      `(${handWrittenOps.join(', ')}) are held only to "every number is draggable" — ` +
      'their per-field layout is theirs to choose and is covered by their own specs.',
  ],
  counts,
  exitCode,
};

console.log(
  `\n${counts.fail > 0 ? 'FAIL' : 'PASS'} — ${counts.pass} pass, ${counts.fail} fail ` +
    `(${ACTION_IDS.length} ops, ${Object.keys(ACTION_DEFS).length} in registry)`,
);
console.log(JSON.stringify(envelope));
process.exit(exitCode);
