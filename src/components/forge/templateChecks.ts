import type { TemplateFontReadiness } from '@continuum/contracts';
import type { ForgeLadderAction, TemplateRunRow } from '@/lib/library/templateSources';
import type { CheckState, CheckTick } from './CheckTable';

// What a template has been through, as five checks that each say what they look at and what they
// found. Pure: every fact is an argument, so every state's copy is pinned by a test and the sheet
// only decides where the words go.

export type TemplateCheck = {
  id: 'parse' | 'fonts' | 'build' | 'test' | 'publish';
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
  created: 'Queued',
  analyzing: 'Reading the project',
  mapping: 'Matching slots to fields',
  building: 'Building the spec',
  validating: 'Checking it',
  draft_ready: 'Draft ready',
  needs_input: 'Needs your answer',
  smoking: 'Test render',
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
    name: 'Parse',
    what: 'Opens the After Effects file and lists its formats, editable layers and fonts.',
  };
  switch (input.parseState) {
    case 'parsed':
      return {
        ...base,
        state: 'pass',
        result: `Read ${plural(input.variableCount, 'variable')} in ${plural(input.formatCount, 'format')}`,
      };
    case 'pending':
      return { ...base, state: 'todo', result: 'Not opened yet' };
    case 'failed':
      return {
        ...base,
        state: 'fail',
        result: `Couldn't read this file: ${input.parseError ?? 'no reason was given'}`,
      };
    default:
      return { ...base, state: 'skipped', result: "This file type isn't read" };
  }
}

function fontsCheck(input: TemplateChecksInput): TemplateCheck {
  const base = {
    id: 'fonts' as const,
    name: 'Fonts',
    what: 'Checks the font repository holds every typeface the template uses — the brand\u2019s own uploads plus house faces. Renders are refused while one is neither held nor substituted.',
  };
  const { fontReadiness: readiness, fontCheckFailed } = input;
  if (input.parseState !== 'parsed' || (readiness && readiness.parseState !== 'parsed')) {
    return { ...base, state: 'todo', result: 'Waits for the file to be read' };
  }
  if (fontCheckFailed)
    return { ...base, state: 'warn', result: "Couldn't check the brand's fonts" };
  if (!readiness) return { ...base, state: 'running', result: "Checking the brand's fonts" };
  const total = readiness.fonts.length;
  if (total === 0) return { ...base, state: 'pass', result: 'Uses no typefaces' };
  const ticks = readiness.fonts.map((font): CheckTick => (font.held ? 'pass' : 'fail'));
  const missing = readiness.fonts.filter((font) => !font.held).map((font) => font.family);
  return missing.length
    ? {
        ...base,
        state: 'fail',
        ticks,
        result: `${missing.length} of ${total} not uploaded: ${missing.join(', ')}`,
      }
    : { ...base, state: 'pass', ticks, result: `All ${total} uploaded` };
}

function buildCheck(input: TemplateChecksInput, state: string | null): TemplateCheck {
  const base = {
    id: 'build' as const,
    name: 'Build',
    what: 'Turns the file into a renderable template: works out its fields, builds its table, seeds a sample row, validates the spec.',
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
    ...(unbound ? [{ label: `${unbound} couldn't bind`, tone: 'warning' as const }] : []),
    ...(findings ? [{ label: plural(findings, 'finding'), tone: 'muted' as const }] : []),
  ];
  const extras = { ...(ticks.length ? { ticks } : {}), ...(chips.length ? { chips } : {}) };

  if (!state) {
    return input.templateKey
      ? { ...base, state: 'pass', result: 'Built', ...extras }
      : { ...base, state: 'todo', result: 'Not built yet', ...extras };
  }
  if (state === 'failed') {
    return {
      ...base,
      state: 'fail',
      result: run?.error?.message ?? 'The run stopped on an error.',
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
          ? `Pick a picture for ${plural(needs.length, 'media variable')}, then build again`
          : `${plural(needs.length, 'slot')} nothing could bind`
        : labelForState(state),
      action: 'resume',
      ...extras,
    };
  }
  if (BUILT.has(state)) return { ...base, state: 'pass', result: 'Built', ...extras };
  return { ...base, state: 'running', result: labelForState(state), ...extras };
}

function testRenderCheck(state: string | null): TemplateCheck {
  const base = {
    id: 'test' as const,
    name: 'Test render',
    what: 'Renders one watermarked frame to prove each variable reaches its layer.',
  };
  if (state === 'smoking')
    return { ...base, state: 'running', result: 'Rendering the test frame…' };
  if (state && TESTED.has(state)) return { ...base, state: 'pass', result: 'Test frame rendered' };
  return {
    ...base,
    state: 'todo',
    result: 'Not run',
    ...(state === 'draft_ready' ? { action: 'smoke' as const } : {}),
  };
}

function publishCheck(input: TemplateChecksInput, state: string | null): TemplateCheck {
  const base = {
    id: 'publish' as const,
    name: 'Publish',
    what: 'Adds it to the render catalog so this brand can render it.',
  };
  // Only a template key means renderable: a run can say `published` against a package the fleet
  // never promoted, and that template renders a blank frame.
  if (input.templateKey) return { ...base, state: 'pass', result: 'Published' };
  if (state === 'promoting') return { ...base, state: 'running', result: 'Publishing…' };
  return {
    ...base,
    state: 'todo',
    result: 'Not published',
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
};

export function templateChecks(input: TemplateChecksInput): TemplateCheck[] {
  const state = input.run?.state ?? input.forgeState ?? null;
  return [
    parseCheck(input),
    fontsCheck(input),
    buildCheck(input, state),
    testRenderCheck(state),
    publishCheck(input, state),
  ];
}
