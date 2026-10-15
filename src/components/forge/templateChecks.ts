import type { ApiRenderTemplateContract, TemplateFontReadiness, TemplateMappingReview } from '@continuum/contracts';
import type { ForgeLadderAction, TemplateRunRow } from '@/lib/library/templateSources';
import type { CheckState, CheckTick } from './CheckTable';

// What a template has been through, as checks that each say what they look at and what they
// found. Pure: every fact is an argument, so every state's copy is pinned by a test and the sheet
// only decides where the words go.

export type TemplateCheck = {
  id: 'parse' | 'fonts' | 'build' | 'mapping' | 'test' | 'publish';
  name: string;
  what: string;
  state: CheckState;
  result: string;
  ticks?: CheckTick[];
  chips?: Array<{ label: string; tone: 'muted' | 'warning' | 'destructive' }>;
  /** The ladder step this row's button takes, when the run is standing where it can be taken. */
  action?: ForgeLadderAction;
};

export const STATE_LABELS: Record<string, string> = {
  created: 'Waiting to start',
  analyzing: 'Reading your file',
  mapping: 'Connecting layers',
  building: 'Setting up',
  validating: 'Checking',
  draft_ready: 'Draft ready',
  needs_input: 'Needs your answer',
  smoking: 'Test rendering',
  review_ready: 'Ready to review',
  promoting: 'Publishing',
  published: 'Published',
  failed: 'Failed',
};

export const labelForState = (state: string): string => STATE_LABELS[state] ?? state;

/** Every state a run passes through once its spec is built. */
const BUILT = new Set(['draft_ready', 'smoking', 'review_ready', 'promoting', 'published']);
const TESTED = new Set(['review_ready', 'promoting', 'published']);

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

function parseCheck(input: TemplateChecksInput): TemplateCheck {
  const base = {
    id: 'parse' as const,
    name: 'Read your file',
    what: 'We open your After Effects file and find its formats, the text and images you can change, and its fonts.',
  };
  switch (input.parseState) {
    case 'parsed':
      return {
        ...base,
        state: 'pass',
        result: `Found ${plural(input.variableCount, 'variable')} in ${plural(input.formatCount, 'format')}`,
      };
    case 'pending':
      return { ...base, state: 'todo', result: 'Not opened yet' };
    case 'failed':
      return {
        ...base,
        state: 'fail',
        result: `We couldn't open this file: ${input.parseError ?? 'no reason was given'}`,
      };
    default:
      return { ...base, state: 'skipped', result: "We don't read this file type" };
  }
}

function fontsCheck(input: TemplateChecksInput): TemplateCheck {
  const base = {
    id: 'fonts' as const,
    name: 'Fonts',
    what: 'We check we have every font your template uses, from your brand\u2019s fonts and Continuum\u2019s shared library. Renders wait until each one is found or swapped.',
  };
  const { fontReadiness: readiness, fontCheckFailed } = input;
  if (input.parseState !== 'parsed' || (readiness && readiness.parseState !== 'parsed')) {
    return { ...base, state: 'todo', result: 'Waiting for your file to be read' };
  }
  if (fontCheckFailed)
    return { ...base, state: 'warn', result: "Couldn't check your fonts" };
  if (!readiness) return { ...base, state: 'running', result: 'Checking your fonts…' };
  const total = readiness.fonts.length;
  if (total === 0) return { ...base, state: 'pass', result: 'No fonts used' };
  const ticks = readiness.fonts.map((font): CheckTick => (font.held ? 'pass' : 'fail'));
  const missing = readiness.fonts.filter((font) => !font.held).map((font) => font.family);
  return missing.length
    ? {
        ...base,
        state: 'fail',
        ticks,
        result: `${missing.length} of ${total} missing: ${missing.join(', ')}`,
      }
    : { ...base, state: 'pass', ticks, result: `All ${total} found` };
}

function buildCheck(input: TemplateChecksInput, state: string | null): TemplateCheck {
  const base = {
    id: 'build' as const,
    name: 'Set up',
    what: 'We turn your file into a template you can fill in and render.',
  };
  const { run } = input;
  const phases = run?.progress?.phases ?? [];
  let failedAt = state === 'failed';
  const ticks = phases.map((phase): CheckTick => {
    // A phase sized 0 had nothing to do — not done, so it never counts toward "done".
    if (phase.total !== null && phase.total > 0 && phase.done >= phase.total) return 'pass';
    if (failedAt) {
      failedAt = false;
      return 'fail';
    }
    return 'todo';
  });
  const needs = run?.needs ?? [];
  const unbound = needs.filter((need) => need.kind !== 'asset').length;
  const findings = run?.findings?.length ?? 0;
  const chips: TemplateCheck['chips'] = [
    ...(unbound ? [{ label: `${unbound} not connected`, tone: 'warning' as const }] : []),
    ...(findings ? [{ label: plural(findings, 'issue'), tone: 'muted' as const }] : []),
  ];
  const extras = { ...(ticks.length ? { ticks } : {}), ...(chips.length ? { chips } : {}) };

  if (!state) {
    return input.templateKey
      ? { ...base, state: 'pass', result: 'Set up', ...extras }
      : { ...base, state: 'todo', result: 'Not set up yet', ...extras };
  }
  if (state === 'failed') {
    return {
      ...base,
      state: 'fail',
      result: run?.error?.message ?? 'Setup stopped on an error.',
      action: 'resume',
      ...extras,
    };
  }
  if (state === 'needs_input') {
    // Waiting on a person, not broken: every from-scratch build stops here until its pictures
    // are chosen, and red would make an ordinary step read as a fault.
    return {
      ...base,
      state: 'warn',
      result: needs.length
        ? needs.every((need) => need.kind === 'asset')
          ? `Pick an image for ${plural(needs.length, 'media variable')}, then set up again`
          : `${plural(needs.length, 'layer')} we couldn't connect`
        : labelForState(state),
      action: 'resume',
      ...extras,
    };
  }
  if (BUILT.has(state)) return { ...base, state: 'pass', result: 'Set up', ...extras };
  return { ...base, state: 'running', result: labelForState(state), ...extras };
}

function mappingCheck(input: TemplateChecksInput): TemplateCheck {
  const base = {
    id: 'mapping' as const,
    name: 'Connect layers',
    what: 'We link every layer you can change in After Effects to a variable you fill in.',
  };
  if (input.parseState !== 'parsed' || (!input.run && !input.templateKey))
    return { ...base, state: 'todo', result: 'Available once setup starts' };
  if (input.mappingCheckFailed)
    return { ...base, state: 'warn', result: "Couldn't load the layer check" };
  const review = input.mappingReview;
  if (!review) return { ...base, state: 'running', result: 'Checking layers…' };
  if (review.state === 'unavailable')
    return { ...base, state: 'warn', result: "Layer check isn't available yet" };
  const additional = review.fields.filter((field) => field.match === 'forge_only').length;
  if (review.state === 'needs_review')
    return { ...base, state: 'fail', result: `${review.matchedSlots} of ${review.slotCount} layers connected · ${review.unmatchedSlots.length} need review` };
  return {
    ...base,
    state: review.identityAvailable ? 'pass' : 'warn',
    result: `${review.matchedSlots} of ${review.slotCount} layers connected${additional ? ` · ${plural(additional, 'extra variable')}` : ''}${review.identityAvailable ? '' : ' (matched by name only)'}`,
  };
}

function testRenderCheck(state: string | null): TemplateCheck {
  const base = {
    id: 'test' as const,
    name: 'Test render',
    what: 'We render one watermarked frame to make sure each variable shows up in the right place.',
  };
  if (state === 'smoking')
    return { ...base, state: 'running', result: 'Rendering a test frame…' };
  if (state && TESTED.has(state)) return { ...base, state: 'pass', result: 'Test frame rendered' };
  return {
    ...base,
    state: 'todo',
    result: 'Not run yet',
    ...(state === 'draft_ready' ? { action: 'smoke' as const } : {}),
  };
}

function publishCheck(input: TemplateChecksInput, state: string | null): TemplateCheck {
  const base = {
    id: 'publish' as const,
    name: 'Publish',
    what: 'We make the template available to render, then double-check where your images land.',
  };
  if (input.templateKey) {
    const check = input.publishVerification;
    if (check)
      return {
        ...base,
        state: check.state,
        result:
          check.issues[0] ??
          `Published · ${plural(check.media.length, 'image spot')} checked`,
      };
    return input.publishCheckFailed
      ? {
          ...base,
          state: 'warn',
          result: "Published, but we couldn't double-check the layout",
        }
      : { ...base, state: 'pass', result: 'Published · checking the layout…' };
  }
  if (state === 'promoting') return { ...base, state: 'running', result: 'Publishing…' };
  return {
    ...base,
    state: 'todo',
    result: 'Not published yet',
    ...(state === 'review_ready' ? { action: 'promote' as const } : {}),
  };
}

export type TemplateChecksInput = {
  parseState: string;
  parseError: string | null;
  variableCount: number;
  formatCount: number;
  fontReadiness: TemplateFontReadiness | null;
  fontCheckFailed: boolean;
  run: TemplateRunRow | null;
  /** The source's own record of the last run, for when the run row itself is not loaded. */
  forgeState: string | null | undefined;
  templateKey: string | null;
  publishVerification?: ApiRenderTemplateContract['publishCheck'];
  publishCheckFailed?: boolean;
  mappingReview?: TemplateMappingReview | null;
  mappingCheckFailed?: boolean;
};

export function templateChecks(input: TemplateChecksInput): TemplateCheck[] {
  const state = input.run?.state ?? input.forgeState ?? null;
  return [
    parseCheck(input),
    fontsCheck(input),
    buildCheck(input, state),
    mappingCheck(input),
    testRenderCheck(state),
    publishCheck(input, state),
  ];
}
