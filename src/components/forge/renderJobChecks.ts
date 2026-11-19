import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
export type ForgeCheckUi = { t: ReturnType<typeof useTranslations<'forge'>>; locale: UiLocale };

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
export function verdictOf(
  job: ApiRenderJob,
  ui?: ForgeCheckUi,
): { text: string; tone: Tone; title?: string } {
  if (job.judge) {
    return job.judge.state === 'pass'
      ? { text: ui?.t('judged_pass_b0de2358') ?? 'Judged · pass', tone: 'success' }
      : job.judge.state === 'fail'
        ? { text: ui?.t('judged_fail_5c521154') ?? 'Judged · fail', tone: 'destructive' }
        : {
            text: ui?.t('judge_unknown_1287016d') ?? 'Judge unknown',
            tone: 'warning',
            title:
              ui?.t('the_judge_could_not_run_on_this_fra_451100cf') ??
              'The judge could not run on this frame',
          };
  }
  if (!job.fit) return { text: '—', tone: 'muted' };
  if (!job.fit.escalate)
    return { text: ui?.t('fits_71d396e0') ?? 'Fits', tone: 'success', title: job.fit.why };
  return job.status === 'finished'
    ? { text: ui?.t('judging_48444ca4') ?? 'Judging…', tone: 'warning', title: job.fit.why }
    : {
        text: ui?.t('ai_check_after_render_654e7c58') ?? 'AI check after render',
        tone: 'warning',
        title: job.fit.why,
      };
}

type StepState = 'done' | 'active' | 'error' | 'pending' | 'skipped';
type Step = { label: string; state: StepState; detail?: string; at?: string | null };

/** Queued → Rendering → Checks → Library → Slack → Meta approval → Published. */
export function jobSteps(job: ApiRenderJob, ui?: ForgeCheckUi): Step[] {
  const finished = job.status === 'finished';
  const failed = job.status === 'failed';
  const verdict = verdictOf(job, ui);
  const saved = job.outputs.filter((output) => output.assetId).length;
  const slack = job.slackDelivery;
  const approval = approvalState(job, ui?.t);
  const receipt = job.delivery[0];
  const failure = failed ? describeRenderJobFailure(job.error, ui?.t) : null;

  const checks: Step = job.judge
    ? {
        label: ui?.t('checks_de07d072') ?? 'Checks',
        state:
          job.judge.state === 'pass' ? 'done' : job.judge.state === 'fail' ? 'error' : 'skipped',
        detail: verdict.title ?? verdict.text,
      }
    : job.fit && !job.fit.escalate
      ? {
          label: ui?.t('checks_de07d072') ?? 'Checks',
          state: 'done',
          detail: ui?.t('fits_71d396e0') ?? 'Fits',
        }
      : job.fit
        ? {
            label: ui?.t('checks_de07d072') ?? 'Checks',
            state: finished ? 'active' : 'pending',
            detail: verdict.text,
          }
        : {
            label: ui?.t('checks_de07d072') ?? 'Checks',
            state: finished || failed ? 'skipped' : 'pending',
            detail: ui?.t('no_placement_check_ea070b5c') ?? 'No placement check',
          };

  return [
    { label: ui?.t('queued_661ff40a') ?? 'Queued', state: 'done', at: job.createdAt },
    {
      label: ui?.t('rendering_e2fe3539') ?? 'Rendering',
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
      ? {
          label: ui?.t('library_dc20b3d5') ?? 'Library',
          state: 'done',
          detail:
            ui?.t('checkSavedFiles', { count: saved }) ??
            `${saved} file${saved === 1 ? '' : 's'} saved`,
        }
      : {
          label: ui?.t('library_dc20b3d5') ?? 'Library',
          state: finished ? 'active' : failed ? 'skipped' : 'pending',
        },
    !slack
      ? {
          label: ui?.t('slack_b27fb38b') ?? 'Slack',
          state: 'skipped',
          detail: ui?.t('no_channel_chosen_63fcb2d6') ?? 'No channel chosen',
        }
      : {
          label: ui?.t('slack_b27fb38b') ?? 'Slack',
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
      ? {
          label: ui?.t('meta_approval_52587788') ?? 'Meta approval',
          state: 'skipped',
          detail: ui?.t('library_only_c143238b') ?? 'Library only',
        }
      : {
          label: ui?.t('meta_approval_52587788') ?? 'Meta approval',
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
      ? {
          label: ui?.t('published_2ef42ec2') ?? 'Published',
          state: 'skipped',
          detail: ui?.t('library_only_c143238b') ?? 'Library only',
        }
      : receipt?.status === 'published' || job.approval?.status === 'published'
        ? {
            label: ui?.t('published_2ef42ec2') ?? 'Published',
            state: 'done',
            at: receipt?.publishedAt,
          }
        : receipt?.status === 'error'
          ? {
              label: ui?.t('published_2ef42ec2') ?? 'Published',
              state: 'error',
              detail: deliveryReasonText(receipt.reason, ui?.t) ?? undefined,
            }
          : receipt?.status === 'dropped' || job.approval?.status === 'rejected'
            ? {
                label: ui?.t('published_2ef42ec2') ?? 'Published',
                state: 'skipped',
                detail:
                  deliveryReasonText(receipt?.reason, ui?.t) ??
                  ui?.t('not_approved_ad281501') ??
                  'Not approved',
              }
            : receipt?.reason === 'delivery_bridge_unconfigured'
              ? {
                  label: ui?.t('published_2ef42ec2') ?? 'Published',
                  state: 'skipped',
                  detail: deliveryReasonText(receipt.reason) ?? undefined,
                }
              : { label: ui?.t('published_2ef42ec2') ?? 'Published', state: 'pending' },
  ];
}

/** A check row with plain-string findings; the table turns `lines` into its detail. */
export type JobCheck = Omit<CheckRow, 'result' | 'detail'> & {
  result: string;
  lines: string[];
  kind?: string;
};

const WAIT_BEFORE_BACKGROUND_MS = 10 * 60_000;

const plural = (count: number, one: string, many: string, ui?: ForgeCheckUi) =>
  `${count} ${count === 1 ? one : many}`;

export function formatDuration(ms: number, ui?: ForgeCheckUi): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const between = (
  from: string | null | undefined,
  to: string | null | undefined,
  ui?: ForgeCheckUi,
) => (from && to ? formatDuration(Date.parse(to) - Date.parse(from), ui) : undefined);

const EDGES = ['left', 'top', 'right', 'bottom'] as const;

/** `[0, 120, 0, 120]` → "120 px off top and bottom". */
function clipWords(clippedPx: [number, number, number, number], ui?: ForgeCheckUi): string {
  const byPx = new Map<number, string[]>();
  clippedPx.forEach((px, index) => {
    if (px > 0) byPx.set(px, [...(byPx.get(px) ?? []), EDGES[index]!]);
  });
  return [...byPx]
    .map(
      ([px, edges]) =>
        ui?.t('value0_px_off_value1_716269ae', {
          value0: String(px),
          value1: joinWords(
            edges.map((edge) =>
              ui
                ? ui.t(
                    (
                      {
                        left: 'checkEdgeLeft',
                        top: 'checkEdgeTop',
                        right: 'checkEdgeRight',
                        bottom: 'checkEdgeBottom',
                      } as const
                    )[edge as (typeof EDGES)[number]],
                  )
                : edge,
            ),
            ui,
          ),
        }) ?? `${px} px off ${edges.join(' and ')}`,
    )
    .join(', ');
}

const listFormats = new Map<UiLocale, Intl.ListFormat>();
function joinWords(values: string[], ui?: ForgeCheckUi): string {
  if (!ui) return values.join(' and ');
  let formatter = listFormats.get(ui.locale);
  if (!formatter) {
    formatter = new Intl.ListFormat(ui.locale, { type: 'conjunction' });
    listFormats.set(ui.locale, formatter);
  }
  return formatter.format(values);
}
const coverWords = (slot: ApiRenderFitVerdict, ui?: ForgeCheckUi) => {
  if (!slot.covers.length) return '';
  const overlaps = joinWords(
    slot.covers.map(
      (cover) =>
        ui?.t('checkCoverage', { coverage: cover.coverage, label: cover.label }) ??
        `${Math.round(cover.coverage * 100)}% of ${cover.label}`,
    ),
    ui,
  );
  return ui?.t('checkCovers', { overlaps }) ?? ` Covers ${overlaps}.`;
};
const drawnAt = (box: [number, number, number, number], ui?: ForgeCheckUi) =>
  ui?.t('checkDrawnAt', {
    width: Math.round(box[2] - box[0]),
    height: Math.round(box[3] - box[1]),
  }) ?? `drawn at ${Math.round(box[2] - box[0])}×${Math.round(box[3] - box[1])}`;

function slotSentence(slot: ApiRenderFitVerdict, label: string, ui?: ForgeCheckUi): string {
  if (slot.state === 'clipped' && slot.box && slot.clippedPx) {
    const off =
      slot.insideFraction === null
        ? ''
        : (ui?.t('checkOffFrame', { percent: Math.round((1 - slot.insideFraction) * 100) }) ??
          ` (${Math.round((1 - slot.insideFraction) * 100)}% off-frame)`);
    const dimensions = drawnAt(slot.box, ui);
    const clipped = clipWords(slot.clippedPx, ui);
    const covers = coverWords(slot, ui);
    return (
      ui?.t('checkPlacedClipped', { label, dimensions, clipped, off, covers }) ??
      `${label} — ${dimensions}; ${clipped}${off}.${covers}`
    );
  }
  if (slot.state === 'ok' && slot.box) {
    const dimensions = drawnAt(slot.box, ui);
    const covers = coverWords(slot, ui);
    return (
      ui?.t('checkPlacedInside', { label, dimensions, covers }) ??
      `${label} — ${dimensions}; lands inside the frame.${covers}`
    );
  }
  if (slot.box)
    return (
      ui?.t('checkPlacedRigged', { label }) ??
      `${label} — Placed by a rig that sizes the image at render time. Can't be predicted; the frame goes to the judge.`
    );
  if (slot.why.startsWith('no asset is chosen'))
    return ui?.t('checkNoImagePicked', { label }) ?? `${label} — No image picked.`;
  if (slot.why.startsWith('this template has no measured placement'))
    return (
      ui?.t('checkNoMeasuredSlot', { label }) ??
      `${label} — This template has no measured position for this slot.`
    );
  return (
    ui?.t('checkCouldNotMeasure', { label, reason: slot.why }) ??
    `${label} — Couldn't be measured: ${slot.why}.`
  );
}
const SLOT_TICK: Record<ApiRenderFitVerdict['state'], CheckTick> = {
  ok: 'pass',
  clipped: 'warn',
  unknown: 'todo',
};
function placementCheck(
  job: ApiRenderJob,
  labelByKey: Record<string, string>,
  ui?: ForgeCheckUi,
): JobCheck {
  const base = {
    kind: 'placement',
    name: ui?.t('placement_4df99399') ?? 'Placement',
    what:
      ui?.t('checkPlacementExplanation') ??
      "Works out where each picked image lands from its size and the slot's measured position. Arithmetic, not a look at the frame.",
  };
  if (!job.fit)
    return {
      ...base,
      state: 'skipped',
      result: ui?.t('no_placement_check_ea070b5c') ?? 'No placement check',
      lines: [],
    };
  const { slots, comp } = job.fit;
  if (!slots.length)
    return {
      ...base,
      state: 'skipped',
      result: ui?.t('no_image_slots_daa88370') ?? 'No image slots',
      lines: [],
    };
  const count = (state: ApiRenderFitVerdict['state']) =>
    slots.filter((slot) => slot.state === state).length;
  const [clipped, unknown, ok] = [count('clipped'), count('unknown'), count('ok')];
  const result = [
    clipped
      ? (ui?.t('checkImagesCutOff', { count: clipped }) ??
        `${plural(clipped, 'image', 'images')} cut off`)
      : null,
    unknown
      ? (ui?.t('checkImagesUnknown', { count: unknown }) ?? `${unknown} couldn't be measured`)
      : null,
    ok ? (ui?.t('checkImagesFit', { count: ok }) ?? plural(ok, 'image fits', 'images fit')) : null,
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
      ...slots.map((slot) => slotSentence(slot, labelByKey[slot.key] ?? slot.key, ui)),
      ...(comp
        ? [
            ui?.t('checkCompositionMeasurement', {
              name: comp.name,
              width: comp.width,
              height: comp.height,
            }) ?? `Measured in ${comp.name} ${comp.width}×${comp.height} only.`,
          ]
        : []),
    ],
  };
}

// Looked up by string: a kind the judge adds before this build knows it reads as its own note or
// raw kind, never as a crash that takes the job ledger with it. A Map, so `constructor` is a kind
// like any other and never a prototype method.
const FINDING_WORDS = new Map<string, (layer: string, ui?: ForgeCheckUi) => string>(
  Object.entries({
    occluded: (layer, ui?: ForgeCheckUi) =>
      ui?.t('something_covers_value0_91e6675b', { value0: String(layer) }) ??
      `Something covers ${layer}`,
    clipped: (layer, ui?: ForgeCheckUi) =>
      ui?.t('value0_is_cut_off_at_the_edge_450578af', { value0: String(layer) }) ??
      `${layer} is cut off at the edge`,
    overlap: (layer, ui?: ForgeCheckUi) =>
      ui?.t('value0_overlaps_another_element_d8b70c66', { value0: String(layer) }) ??
      `${layer} overlaps another element`,
    unreadable_text: (layer, ui?: ForgeCheckUi) =>
      ui?.t('value0_is_hard_to_read_142e2a9d', { value0: String(layer) }) ??
      `${layer} is hard to read`,
    off_brand: (layer, ui?: ForgeCheckUi) =>
      ui?.t('value0_looks_off_brand_56cdfe82', { value0: String(layer) }) ??
      `${layer} looks off-brand`,
    placeholder: (layer, ui?: ForgeCheckUi) =>
      ui?.t('value0_still_shows_placeholder_cont_ef5e69bf', { value0: String(layer) }) ??
      `${layer} still shows placeholder content`,
    missing: (layer, ui?: ForgeCheckUi) =>
      ui?.t('value0_is_missing_1570def9', { value0: String(layer) }) ?? `${layer} is missing`,
    stray_element: (layer, ui?: ForgeCheckUi) =>
      ui?.t('unexpected_element_near_value0_a1bbb762', { value0: String(layer) }) ??
      `Unexpected element near ${layer}`,
    text_overflow: (layer, ui?: ForgeCheckUi) =>
      ui?.t('value0_text_runs_past_its_box_7c8e3af3', { value0: String(layer) }) ??
      `${layer} text runs past its box`,
  } satisfies Record<JudgeFindingKind, (layer: string, ui?: ForgeCheckUi) => string>),
);

type JudgeAnswer = Pick<ApiRenderJudgeFrame, 'state' | 'verdict'>;

const markOf = (answer: JudgeAnswer, ui?: ForgeCheckUi) => {
  if (answer.state === 'pass') return '✓';
  if (answer.state === 'unknown') return ui?.t('couldn_t_judge_68ac4c78') ?? "? couldn't judge";
  const problems = answer.verdict?.findings.length ?? 0;
  return problems
    ? `✗ ${ui?.t('checkProblems', { count: problems }) ?? plural(problems, 'problem', 'problems', ui)}`
    : '✗';
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

function judgeCheck(job: ApiRenderJob, now: number, ui?: ForgeCheckUi): JobCheck {
  const base = {
    kind: 'judge',
    name: ui?.t('judge_aed6fc7b') ?? 'Judge',
    what:
      ui?.t('an_ai_model_looks_at_the_finished_f_afbf204e') ??
      "An AI model looks at the finished frame for cut-off, covered or unreadable elements, leftover placeholders and off-brand content. Runs only when placement couldn't answer.",
  };
  const { judge, fit } = job;
  const finished = job.status === 'finished';
  const videoOnly =
    finished && job.outputs.length > 0 && job.outputs.every((output) => output.kind !== 'image');

  if (videoOnly && (!judge || judge.state === 'unknown')) {
    return {
      ...base,
      state: 'skipped',
      result:
        ui?.t('this_render_has_no_still_frame_the__8d944a04') ??
        'This render has no still frame; the judge reads images.',
      lines: [],
    };
  }

  if (judge) {
    const frames = judge.frames ?? [];
    const couldNotJudge = judge.state === 'unknown' && frames.every((f) => f.state === 'unknown');
    const result = couldNotJudge
      ? judge.why
        ? (ui?.t('couldn_t_judge_value0_9dcb1b9c', { value0: String(judge.why) }) ??
          `Couldn't judge: ${judge.why}`)
        : (ui?.t('couldn_t_judge_024e4308') ?? "Couldn't judge")
      : frames.length
        ? frames.map((f) => `${f.ratio ?? f.fileName} ${markOf(f, ui)}`).join(' · ')
        : (ui?.t('judged_one_frame_value0_4486c838', { value0: String(markOf(judge, ui)) }) ??
          `Judged one frame ${markOf(judge, ui)}`);
    const findings = (frames.length ? frames : [{ ...judge, ratio: null, fileName: '' }]).flatMap(
      (answer) =>
        (answer.verdict?.findings ?? []).map((finding) => {
          const words =
            FINDING_WORDS.get(finding.kind)?.(finding.layerHint, ui) ??
            finding.note ??
            finding.kind;
          return answer.ratio ? `${answer.ratio}: ${words}` : words;
        }),
    );
    const about = [
      judge.model
        ? (ui?.t('model_value0_6c86000b', { value0: String(judge.model) }) ??
          `Model ${judge.model}`)
        : null,
      judge.level,
      judge.judgedAt ? formatRelativeTime(judge.judgedAt, now, ui?.locale) : null,
    ].filter(Boolean);
    return {
      ...base,
      state: STATE_OF[judge.state],
      result,
      ticks: frames.length ? frames.map((f) => TICK_OF[f.state]) : [TICK_OF[judge.state]],
      duration: between(job.finishedAt, judge.judgedAt, ui),
      lines: [
        ...findings,
        ...(about.length ? [about.join(' · ')] : []),
        ui?.t('the_judge_catches_about_half_of_rea_d6d26be4') ??
          'The judge catches about half of real problems, and is right about 9 in 10 of the ones it flags.',
      ],
    };
  }

  if (job.status === 'failed') {
    return {
      ...base,
      state: 'skipped',
      result: ui?.t('not_run_the_render_failed_b5536cf8') ?? 'Not run — the render failed.',
      lines: [],
    };
  }
  if (!fit) {
    return {
      ...base,
      state: 'skipped',
      result:
        ui?.t('not_run_this_render_had_no_placemen_4d9fe57c') ??
        'Not run — this render had no placement check.',
      lines: [],
    };
  }
  if (!fit.escalate) {
    return {
      ...base,
      state: 'skipped',
      result:
        ui?.t('not_needed_every_image_was_measured_2c998ec8') ??
        'Not needed — every image was measured and fits.',
      lines: [],
    };
  }
  if (!finished) {
    return {
      ...base,
      state: 'todo',
      result:
        ui?.t('will_check_the_frames_when_the_rend_fa4da733', { value0: String(fit.why) }) ??
        `Will check the frames when the render finishes. Sent because: ${fit.why}`,
      lines: [],
    };
  }
  // The judge runs on the reconciler's leased pass, so a finished job can sit unjudged a while:
  // spin briefly, then say so and show how long — never a spinner that never ends.
  const since = job.finishedAt ?? job.updatedAt;
  const waited = now - Date.parse(since);
  return waited < WAIT_BEFORE_BACKGROUND_MS
    ? {
        ...base,
        state: 'running',
        result: ui?.t('waiting_for_the_judge_51e38cfc') ?? 'Waiting for the judge…',
        lines: [],
      }
    : {
        ...base,
        state: 'todo',
        result:
          ui?.t('still_waiting_the_judge_runs_on_a_b_737d5060') ??
          'Still waiting — the judge runs on a background pass.',
        duration: formatDuration(waited, ui),
        lines: [
          ui?.t('sent_because_value0_600a37f3', { value0: String(fit.why) }) ??
            `Sent because: ${fit.why}`,
        ],
      };
}

function renderCheck(job: ApiRenderJob, ui?: ForgeCheckUi): JobCheck {
  const base = {
    kind: 'render',
    name: ui?.t('render_6d89eb7d') ?? 'Render',
    what:
      ui?.t('the_render_farm_builds_each_format_556f354e') ?? 'The render farm builds each format.',
    lines: [],
  };
  if (job.status === 'failed') {
    return {
      ...base,
      state: 'fail',
      result:
        describeRenderJobFailure(job.error) ??
        ui?.t('the_render_failed_b2e6036c') ??
        'The render failed.',
      duration: between(job.createdAt, job.finishedAt, ui),
    };
  }
  if (job.status !== 'finished') {
    return {
      ...base,
      state: 'running',
      result:
        job.status === 'rendering'
          ? (ui?.t('rendering_6241b615') ?? 'Rendering…')
          : (ui?.t('queued_661ff40a') ?? 'Queued'),
    };
  }
  return {
    ...base,
    state: job.outputs.length ? 'pass' : 'warn',
    result: job.outputs.length
      ? (ui?.t('checkFiles', { count: job.outputs.length }) ??
        plural(job.outputs.length, 'file', 'files', ui))
      : (ui?.t('no_files_c219d965') ?? 'No files'),
    duration: between(job.createdAt, job.finishedAt, ui),
  };
}

const STEP_TICK: Record<StepState, CheckTick | null> = {
  done: 'pass',
  error: 'fail',
  active: 'todo',
  pending: 'todo',
  skipped: null,
};

function deliveryCheck(job: ApiRenderJob, ui?: ForgeCheckUi): JobCheck {
  const base = {
    kind: 'delivery',
    name: ui?.t('delivery_52bfe584') ?? 'Delivery',
    what:
      ui?.t('saves_to_library_posts_to_slack_sen_cbe164b2') ??
      'Saves to Library, posts to Slack, sends to Meta for approval.',
    lines: [],
  };
  const steps = jobSteps(job, ui).slice(3);
  if (job.status === 'failed') {
    return {
      ...base,
      state: 'skipped',
      result:
        ui?.t('nothing_delivered_the_render_failed_3551cf47') ??
        'Nothing delivered — the render failed.',
    };
  }
  if (job.status !== 'finished') {
    return {
      ...base,
      state: 'todo',
      result: ui?.t('waits_for_the_render_7da56647') ?? 'Waits for the render.',
    };
  }
  const [library, slack, approval, published] = steps as [Step, Step, Step, Step];
  const result = [
    library.state === 'done'
      ? (ui?.t('saved_to_library_7ffd8133') ?? 'Saved to Library')
      : (ui?.t('saving_to_library_6a2bf333') ?? 'Saving to Library'),
    slack.state === 'done'
      ? (ui?.t('posted_to_value0_efa3a395', { value0: String(slack.detail) }) ??
        `posted to ${slack.detail}`)
      : slack.state === 'error'
        ? (ui?.t('slack_post_failed_value0_c2ceff6d', { value0: String(slack.detail) }) ??
          `Slack post failed (${slack.detail})`)
        : slack.state === 'skipped'
          ? null
          : (ui?.t('posts_to_value0_1aa2d93c', { value0: String(slack.detail) }) ??
            `posts to ${slack.detail}`),
    approval.state === 'skipped' ? null : approval.detail,
    published.state === 'done'
      ? (ui?.t('published_to_meta_a4ed06a2') ?? 'published to Meta')
      : published.state === 'error'
        ? (published.detail ?? ui?.t('meta_delivery_failed_a73d5699') ?? 'Meta delivery failed')
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
  ui?: ForgeCheckUi,
): JobCheck[] {
  return [
    ...(job.acceptMissingFonts
      ? [
          {
            kind: 'font_override',
            name: ui?.t('font_override_66446e01') ?? 'Font override',
            what:
              ui?.t('whether_the_missing_font_check_was__1961e292') ??
              'Whether the missing-font check was bypassed for this render.',
            state: 'warn' as const,
            result: ui?.t('missing_font_check_bypassed_839560d4') ?? 'Missing-font check bypassed',
            lines: [
              ui?.t('explicitly_accepted_value0_the_work_f07f614f', {
                value0: String(job.createdByEmail ? ` by ${job.createdByEmail}` : ''),
              }) ??
                `Explicitly accepted${job.createdByEmail ? ` by ${job.createdByEmail}` : ''}; the worker may substitute missing fonts.`,
            ],
          },
        ]
      : []),
    ...(job.acceptLinkedLineMismatch
      ? [
          {
            kind: 'line_count_override',
            name: ui?.t('line_count_override_4da94002') ?? 'Line-count override',
            what:
              ui?.t('whether_a_split_headline_rendered_w_85a1934b') ??
              'Whether a split headline rendered with a line count its layers did not match.',
            state: 'warn' as const,
            result: ui?.t('line_count_check_bypassed_c099327c') ?? 'Line-count check bypassed',
            lines: [
              ui?.t('explicitly_accepted_value0_extra_li_98597eb2', {
                value0: String(job.createdByEmail ? ` by ${job.createdByEmail}` : ''),
              }) ??
                `Explicitly accepted${job.createdByEmail ? ` by ${job.createdByEmail}` : ''}; extra lines joined onto the last layer, missing ones rendered empty.`,
            ],
          },
        ]
      : []),
    ...(job.acceptOffPaletteColor
      ? [
          {
            kind: 'palette_override',
            name: ui?.t('palette_override_fad09a82') ?? 'Palette override',
            what:
              ui?.t('whether_a_colour_outside_the_brand__d6502467') ??
              'Whether a colour outside the brand palette was rendered on purpose.',
            state: 'warn' as const,
            result:
              ui?.t('brand_palette_check_bypassed_13a059f3') ?? 'Brand-palette check bypassed',
            lines: [
              ui?.t('explicitly_accepted_value0_a_colour_221dd8d1', {
                value0: String(job.createdByEmail ? ` by ${job.createdByEmail}` : ''),
              }) ??
                `Explicitly accepted${job.createdByEmail ? ` by ${job.createdByEmail}` : ''}; a colour renders outside the brand palette.`,
            ],
          },
        ]
      : []),
    ...(job.warnings?.length
      ? [
          {
            kind: 'warnings',
            name: ui?.t('warnings_0e04cd10') ?? 'Warnings',
            what:
              ui?.t('advisories_recorded_for_this_render_626b8abb') ??
              'Advisories recorded for this render. Review these before delivery.',
            state: 'warn' as const,
            result:
              ui?.t('checkWarnings', { count: job.warnings.length }) ??
              `${job.warnings.length} warning${job.warnings.length === 1 ? '' : 's'}`,
            lines: job.warnings.map((warning) => warning.message),
          },
        ]
      : []),
    {
      kind: 'inputs',
      name: ui?.t('inputs_7abc49df') ?? 'Inputs',
      what:
        ui?.t('confirms_every_required_variable_is_755d9b5e') ??
        'Confirms every required variable is filled and every picked asset belongs to this brand.',
      state: 'pass',
      result: ui?.t('all_inputs_accepted_6e2c0fe7') ?? 'All inputs accepted.',
      lines: [],
    },
    placementCheck(job, labelByKey, ui),
    {
      kind: 'brand',
      name: ui?.t('brand_090ed431') ?? 'Brand',
      what:
        ui?.t('checks_brand_colors_and_typefaces_q_b282f0fd') ??
        'Checks brand colors and typefaces. Quality warnings can be accepted before rendering.',
      state: job.warnings?.length ? 'warn' : 'pass',
      result: job.warnings?.length
        ? (ui?.t('review_recorded_warnings_301981ba') ?? 'Review recorded warnings')
        : (ui?.t('no_blocking_issues_65150e76') ?? 'No blocking issues'),
      lines: [],
    },
    renderCheck(job, ui),
    judgeCheck(job, now, ui),
    deliveryCheck(job, ui),
  ];
}
