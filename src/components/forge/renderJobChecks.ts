import type {
  ApiRenderFitVerdict,
  ApiRenderJob,
  ApiRenderJudgeFrame,
  JudgeFindingKind,
} from '@continuum/contracts';
import type { CheckRow, CheckState, CheckTick } from '@/components/forge/CheckTable';
import { approvalState, deliveryReasonText } from '@/components/forge/DeliveryChain';
import { describeRenderJobFailure } from '@/components/forge/renderJobFailureCopy';
import { formatRelativeTime } from '@/lib/time/relativeTime';

// What happened to one render, as the checks it went through: each row says what it looks at and
// what it found, in words a person reads without opening the job's JSON. Pure, so every state and
// every sentence is asserted in renderJobChecks.test.ts.

type Tone = 'muted' | 'warning' | 'success' | 'destructive';

/** `unknown` is never a pass: the judge could not run, and the badge says so. */
export function verdictOf(job: ApiRenderJob): { text: string; tone: Tone; title?: string } {
  if (job.judge) {
    return job.judge.state === 'pass'
      ? { text: 'Judged · pass', tone: 'success' }
      : job.judge.state === 'fail'
        ? { text: 'Judged · fail', tone: 'destructive' }
        : {
            text: 'Judge unknown',
            tone: 'warning',
            title: 'The judge could not run on this frame',
          };
  }
  if (!job.fit) return { text: '—', tone: 'muted' };
  if (!job.fit.escalate) return { text: 'Fits', tone: 'success', title: job.fit.why };
  return job.status === 'finished'
    ? { text: 'Judging…', tone: 'warning', title: job.fit.why }
    : { text: 'AI check after render', tone: 'warning', title: job.fit.why };
}

type StepState = 'done' | 'active' | 'error' | 'pending' | 'skipped';
type Step = { label: string; state: StepState; detail?: string; at?: string | null };

/** Queued → Rendering → Checks → Library → Slack → Meta approval → Published. */
export function jobSteps(job: ApiRenderJob): Step[] {
  const finished = job.status === 'finished';
  const failed = job.status === 'failed';
  const verdict = verdictOf(job);
  const saved = job.outputs.filter((output) => output.assetId).length;
  const slack = job.slackDelivery;
  const approval = approvalState(job);
  const receipt = job.delivery[0];
  const failure = failed ? describeRenderJobFailure(job.error) : null;

  const checks: Step = job.judge
    ? {
        label: 'Checks',
        state:
          job.judge.state === 'pass' ? 'done' : job.judge.state === 'fail' ? 'error' : 'skipped',
        detail: verdict.title ?? verdict.text,
      }
    : job.fit && !job.fit.escalate
      ? { label: 'Checks', state: 'done', detail: 'Fits' }
      : job.fit
        ? { label: 'Checks', state: finished ? 'active' : 'pending', detail: verdict.text }
        : {
            label: 'Checks',
            state: finished || failed ? 'skipped' : 'pending',
            detail: 'No placement check',
          };

  return [
    { label: 'Queued', state: 'done', at: job.createdAt },
    {
      label: 'Rendering',
      state: finished
        ? 'done'
        : failed
          ? 'error'
          : job.status === 'rendering'
            ? 'active'
            : 'pending',
      ...(failure ? { detail: failure } : {}),
      ...(finished || failed ? { at: job.finishedAt ?? job.updatedAt } : {}),
    },
    checks,
    saved
      ? { label: 'Library', state: 'done', detail: `${saved} file${saved === 1 ? '' : 's'} saved` }
      : { label: 'Library', state: finished ? 'active' : failed ? 'skipped' : 'pending' },
    !slack
      ? { label: 'Slack', state: 'skipped', detail: 'No channel chosen' }
      : {
          label: 'Slack',
          state:
            slack.status === 'posted'
              ? 'done'
              : slack.status === 'error'
                ? 'error'
                : slack.status === 'skipped'
                  ? 'skipped'
                  : finished
                    ? 'active'
                    : 'pending',
          detail: slack.reason
            ? `#${slack.channelName} · ${slack.reason}`
            : `#${slack.channelName}`,
          at: slack.postedAt,
        },
    !approval
      ? { label: 'Meta approval', state: 'skipped', detail: 'Library only' }
      : {
          label: 'Meta approval',
          state:
            approval.tone === 'destructive'
              ? 'error'
              : approval.tone === 'success'
                ? 'done'
                : job.approval
                  ? 'active'
                  : 'pending',
          detail: approval.text,
          at: job.approval?.decidedAt,
        },
    !job.deliveryTarget
      ? { label: 'Published', state: 'skipped', detail: 'Library only' }
      : receipt?.status === 'published' || job.approval?.status === 'published'
        ? { label: 'Published', state: 'done', at: receipt?.publishedAt }
        : receipt?.status === 'error'
          ? {
              label: 'Published',
              state: 'error',
              detail: deliveryReasonText(receipt.reason) ?? undefined,
            }
          : receipt?.status === 'dropped' || job.approval?.status === 'rejected'
            ? {
                label: 'Published',
                state: 'skipped',
                detail: deliveryReasonText(receipt?.reason) ?? 'Not approved',
              }
            : receipt?.reason === 'delivery_bridge_unconfigured'
              ? {
                  label: 'Published',
                  state: 'skipped',
                  detail: deliveryReasonText(receipt.reason) ?? undefined,
                }
              : { label: 'Published', state: 'pending' },
  ];
}

/** A check row with plain-string findings; the table turns `lines` into its detail. */
export type JobCheck = Omit<CheckRow, 'result' | 'detail'> & { result: string; lines: string[] };

const WAIT_BEFORE_BACKGROUND_MS = 10 * 60_000;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const between = (from: string | null | undefined, to: string | null | undefined) =>
  from && to ? formatDuration(Date.parse(to) - Date.parse(from)) : undefined;

const EDGES = ['left', 'top', 'right', 'bottom'] as const;

/** `[0, 120, 0, 120]` → "120 px off top and bottom". */
function clipWords(clippedPx: [number, number, number, number]): string {
  const byPx = new Map<number, string[]>();
  clippedPx.forEach((px, index) => {
    if (px > 0) byPx.set(px, [...(byPx.get(px) ?? []), EDGES[index]!]);
  });
  return [...byPx].map(([px, edges]) => `${px} px off ${edges.join(' and ')}`).join(', ');
}

const coverWords = (slot: ApiRenderFitVerdict) =>
  slot.covers.length
    ? ` Covers ${slot.covers.map((cover) => `${Math.round(cover.coverage * 100)}% of ${cover.label}`).join(' and ')}.`
    : '';

const drawnAt = (box: [number, number, number, number]) =>
  `drawn at ${Math.round(box[2] - box[0])}×${Math.round(box[3] - box[1])}`;

// ponytail: the unknown reasons are read off the fit port's own `why` sentences (api-render-fit.ts
// checkAssetSwap); a `reason` code on the verdict retires the prefix match.
function slotSentence(slot: ApiRenderFitVerdict, label: string): string {
  if (slot.state === 'clipped' && slot.box && slot.clippedPx) {
    const off =
      slot.insideFraction === null
        ? ''
        : ` (${Math.round((1 - slot.insideFraction) * 100)}% off-frame)`;
    return `${label} — ${drawnAt(slot.box)}; ${clipWords(slot.clippedPx)}${off}.${coverWords(slot)}`;
  }
  if (slot.state === 'ok' && slot.box) {
    return `${label} — ${drawnAt(slot.box)}; lands inside the frame.${coverWords(slot)}`;
  }
  if (slot.box) {
    return `${label} — Placed by a rig that sizes the image at render time. Can't be predicted; the frame goes to the judge.`;
  }
  if (slot.why.startsWith('no asset is chosen')) return `${label} — No image picked.`;
  if (slot.why.startsWith('this template has no measured placement')) {
    return `${label} — This template has no measured position for this slot.`;
  }
  return `${label} — Couldn't be measured: ${slot.why}.`;
}

const SLOT_TICK: Record<ApiRenderFitVerdict['state'], CheckTick> = {
  ok: 'pass',
  clipped: 'warn',
  unknown: 'todo',
};

function placementCheck(job: ApiRenderJob, labelByKey: Record<string, string>): JobCheck {
  const base = {
    name: 'Placement',
    what: "Works out where each picked image lands from its size and the slot's measured position. Arithmetic, not a look at the frame.",
  };
  if (!job.fit) return { ...base, state: 'skipped', result: 'No placement check', lines: [] };
  const { slots, comp } = job.fit;
  if (!slots.length) return { ...base, state: 'skipped', result: 'No image slots', lines: [] };
  const count = (state: ApiRenderFitVerdict['state']) =>
    slots.filter((slot) => slot.state === state).length;
  const [clipped, unknown, ok] = [count('clipped'), count('unknown'), count('ok')];
  const result = [
    clipped ? `${plural(clipped, 'image', 'images')} cut off` : null,
    unknown ? `${unknown} couldn't be measured` : null,
    ok ? `${plural(ok, 'image fits', 'images fit')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const state: CheckState = clipped ? 'warn' : unknown ? 'skipped' : 'pass';
  return {
    ...base,
    state,
    result,
    ticks: slots.map((slot) => SLOT_TICK[slot.state]),
    lines: [
      ...slots.map((slot) => slotSentence(slot, labelByKey[slot.key] ?? slot.key)),
      ...(comp ? [`Measured in ${comp.name} ${comp.width}×${comp.height} only.`] : []),
    ],
  };
}

const FINDING_WORDS: Record<JudgeFindingKind, (layer: string) => string> = {
  occluded: (layer) => `Something covers ${layer}`,
  clipped: (layer) => `${layer} is cut off at the edge`,
  overlap: (layer) => `${layer} overlaps another element`,
  unreadable_text: (layer) => `${layer} is hard to read`,
  off_brand: (layer) => `${layer} looks off-brand`,
  placeholder: (layer) => `${layer} still shows placeholder content`,
  missing: (layer) => `${layer} is missing`,
  stray_element: (layer) => `Unexpected element near ${layer}`,
  text_overflow: (layer) => `${layer} text runs past its box`,
};

type JudgeAnswer = Pick<ApiRenderJudgeFrame, 'state' | 'verdict'>;

const markOf = (answer: JudgeAnswer) => {
  if (answer.state === 'pass') return '✓';
  if (answer.state === 'unknown') return "? couldn't judge";
  const problems = answer.verdict?.findings.length ?? 0;
  return problems ? `✗ ${plural(problems, 'problem', 'problems')}` : '✗';
};

const TICK_OF: Record<JudgeAnswer['state'], CheckTick> = {
  pass: 'pass',
  fail: 'fail',
  unknown: 'warn',
};
const STATE_OF: Record<JudgeAnswer['state'], CheckState> = {
  pass: 'pass',
  fail: 'fail',
  unknown: 'warn',
};

function judgeCheck(job: ApiRenderJob, now: number): JobCheck {
  const base = {
    name: 'Judge',
    what: "An AI model looks at the finished frame for cut-off, covered or unreadable elements, leftover placeholders and off-brand content. Runs only when placement couldn't answer.",
  };
  const { judge, fit } = job;
  const finished = job.status === 'finished';
  const videoOnly =
    finished && job.outputs.length > 0 && job.outputs.every((output) => output.kind !== 'image');

  if (videoOnly && (!judge || judge.state === 'unknown')) {
    return {
      ...base,
      state: 'skipped',
      result: 'This render has no still frame; the judge reads images.',
      lines: [],
    };
  }

  if (judge) {
    const frames = judge.frames ?? [];
    const couldNotJudge = judge.state === 'unknown' && frames.every((f) => f.state === 'unknown');
    const result = couldNotJudge
      ? judge.why
        ? `Couldn't judge: ${judge.why}`
        : "Couldn't judge"
      : frames.length
        ? frames.map((f) => `${f.ratio ?? f.fileName} ${markOf(f)}`).join(' · ')
        : `Judged one frame ${markOf(judge)}`;
    const findings = (frames.length ? frames : [{ ...judge, ratio: null, fileName: '' }]).flatMap(
      (answer) =>
        (answer.verdict?.findings ?? []).map((finding) => {
          const words = FINDING_WORDS[finding.kind](finding.layerHint);
          return answer.ratio ? `${answer.ratio}: ${words}` : words;
        }),
    );
    const about = [
      judge.model ? `Model ${judge.model}` : null,
      judge.level,
      judge.judgedAt ? formatRelativeTime(judge.judgedAt, now) : null,
    ].filter(Boolean);
    return {
      ...base,
      state: STATE_OF[judge.state],
      result,
      ticks: frames.length ? frames.map((f) => TICK_OF[f.state]) : [TICK_OF[judge.state]],
      duration: between(job.finishedAt, judge.judgedAt),
      lines: [
        ...findings,
        ...(about.length ? [about.join(' · ')] : []),
        'The judge catches about half of real problems, and is right about 9 in 10 of the ones it flags.',
      ],
    };
  }

  if (job.status === 'failed') {
    return { ...base, state: 'skipped', result: 'Not run — the render failed.', lines: [] };
  }
  if (!fit) {
    return {
      ...base,
      state: 'skipped',
      result: 'Not run — this render had no placement check.',
      lines: [],
    };
  }
  if (!fit.escalate) {
    return {
      ...base,
      state: 'skipped',
      result: 'Not needed — every image was measured and fits.',
      lines: [],
    };
  }
  if (!finished) {
    return {
      ...base,
      state: 'todo',
      result: `Will check the frames when the render finishes. Sent because: ${fit.why}`,
      lines: [],
    };
  }
  // The judge runs on the reconciler's leased pass, so a finished job can sit unjudged a while:
  // spin briefly, then say so and show how long — never a spinner that never ends.
  const since = job.finishedAt ?? job.updatedAt;
  const waited = now - Date.parse(since);
  return waited < WAIT_BEFORE_BACKGROUND_MS
    ? { ...base, state: 'running', result: 'Waiting for the judge…', lines: [] }
    : {
        ...base,
        state: 'todo',
        result: 'Still waiting — the judge runs on a background pass.',
        duration: formatDuration(waited),
        lines: [`Sent because: ${fit.why}`],
      };
}

function renderCheck(job: ApiRenderJob): JobCheck {
  const base = { name: 'Render', what: 'The render farm builds each format.', lines: [] };
  if (job.status === 'failed') {
    return {
      ...base,
      state: 'fail',
      result: describeRenderJobFailure(job.error) ?? 'The render failed.',
      duration: between(job.createdAt, job.finishedAt),
    };
  }
  if (job.status !== 'finished') {
    return {
      ...base,
      state: 'running',
      result: job.status === 'rendering' ? 'Rendering…' : 'Queued',
    };
  }
  return {
    ...base,
    state: job.outputs.length ? 'pass' : 'warn',
    result: job.outputs.length ? plural(job.outputs.length, 'file', 'files') : 'No files',
    duration: between(job.createdAt, job.finishedAt),
  };
}

const STEP_TICK: Record<StepState, CheckTick | null> = {
  done: 'pass',
  error: 'fail',
  active: 'todo',
  pending: 'todo',
  skipped: null,
};

function deliveryCheck(job: ApiRenderJob): JobCheck {
  const base = {
    name: 'Delivery',
    what: 'Saves to Library, posts to Slack, sends to Meta for approval.',
    lines: [],
  };
  const steps = jobSteps(job).slice(3);
  if (job.status === 'failed') {
    return { ...base, state: 'skipped', result: 'Nothing delivered — the render failed.' };
  }
  if (job.status !== 'finished') {
    return { ...base, state: 'todo', result: 'Waits for the render.' };
  }
  const [library, slack, approval, published] = steps as [Step, Step, Step, Step];
  const result = [
    library.state === 'done' ? 'Saved to Library' : 'Saving to Library',
    slack.state === 'done'
      ? `posted to ${slack.detail}`
      : slack.state === 'error'
        ? `Slack post failed (${slack.detail})`
        : slack.state === 'skipped'
          ? null
          : `posts to ${slack.detail}`,
    approval.state === 'skipped' ? null : approval.detail,
    published.state === 'done'
      ? 'published to Meta'
      : published.state === 'error'
        ? (published.detail ?? 'Meta delivery failed')
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const states = steps.map((step) => step.state);
  return {
    ...base,
    state: states.includes('error')
      ? 'fail'
      : states.includes('active')
        ? 'running'
        : states.includes('pending')
          ? 'todo'
          : 'pass',
    result,
    ticks: steps.flatMap((step) => STEP_TICK[step.state] ?? []),
  };
}

export function renderJobChecks(
  job: ApiRenderJob,
  labelByKey: Record<string, string>,
  now: number = Date.now(),
): JobCheck[] {
  return [
    {
      name: 'Inputs',
      what: 'Confirms every required variable is filled and every picked asset belongs to this brand.',
      state: 'pass',
      result: 'All inputs accepted.',
      lines: [],
    },
    placementCheck(job, labelByKey),
    {
      name: 'Brand',
      what: 'Checks colors are from the brand palette and every template font is uploaded. A failure stops the render before it starts.',
      state: 'pass',
      result: 'No blocking issues',
      lines: [],
    },
    renderCheck(job),
    judgeCheck(job, now),
    deliveryCheck(job),
  ];
}
