// How far along a Jaina turn is, and roughly how long is left — derived, not reported.
//
// The Backend does not stream a progress percentage, and it should not have to: the parts a turn
// already sends say which stage it is in. `data-jaina-plan` arrives a few seconds in and carries
// the planner's question class (`presentation.question.class`); the hypothesis analysis then
// reports every layer read and every hypothesis tested as `data-jaina-analysis-progress`; the
// answer's text streams last. Each stage gets a typical duration measured on real production
// runs, and the estimate is "what is left of this stage, plus every stage after it".
//
// Three promises the reader is owed, each enforced here rather than in the component:
//   - the bar only moves forward, and never reaches 100% before the turn has actually finished;
//   - when a stage outlasts its estimate the label stops quoting a number and says so
//     ("Tardando más de lo esperado…"), while the bar keeps creeping instead of freezing;
//   - it is only shown for a turn that will take a while: a quick answer never flashes a bar.

import type { JainaUIMessage } from '@continuum/contracts';
import { readsAsSpanish } from '../../components/paid-media/jaina/answerLanguage';

export type RunProgressLanguage = 'es' | 'en';

/** Which kind of turn this is, as far as the parts received so far can tell. */
export type JainaRunRoute = 'pending' | 'analysis' | 'answer';

export type JainaRunStage =
  | 'starting'
  | 'reading'
  | 'testing'
  | 'concluding'
  | 'analyzing'
  | 'writing'
  | 'done';

/** What the parts of the streaming message say, with no notion of time. */
export type JainaRunSignals = {
  planned: boolean;
  questionClass: string | null;
  expectedDuration: string | null;
  language: RunProgressLanguage | null;
  /** Layer, drill or hypothesis rows have arrived. */
  analysisRows: boolean;
  /** A layer or drill read is in flight right now. */
  readingLayers: boolean;
  hypothesesTotal: number;
  hypothesesSettled: number;
  toolCalls: number;
  answerStreaming: boolean;
  finished: boolean;
};

export type JainaRunProgress = {
  route: JainaRunRoute;
  stage: JainaRunStage;
  visible: boolean;
  /** 0..1, never decreasing; exactly 1 only once the turn has finished. */
  fraction: number;
  elapsedSeconds: number;
  /** null once the estimate is exceeded, or when the turn is done. */
  etaSeconds: number | null;
  exceeded: boolean;
  label: string;
};

// ---------------------------------------------------------------------------------------------
// Priors — typical stage durations in seconds, measured on production Jaina runs
// (brand_profiles.jaina_conversation_run_events, 2026-10-13 .. 2026-11-07, 207 runs). Each value
// sits near the median of its stage, so the sum lands near the median turn of that class:
//
//   class          route      reads   hypotheses   conclusions   whole turn (p50)
//   diagnostic     analysis   ~17s    ~28s (p75 116)   ~73s           140s  (n=25)
//   optimization   analysis   ~20s    ~88s (p75 173)  ~106s           259s  (n=46)
//   lookup         answer          plan → answer ~61s                  65s  (n=11)
//   compare        answer          plan → answer ~91s                  95s  (n=10)
//   (no class)     answer          plan → answer ~74s                  77s  (n=21)
//
// A turn with no plan within its first seconds is a direct or conversational answer (p50 4s, or
// a clarification question); those never show the bar.
// ---------------------------------------------------------------------------------------------

type StagePlan = ReadonlyArray<readonly [JainaRunStage, number]>;

const STARTING_SECONDS = 4;

const ANALYSIS_PLANS: Record<string, StagePlan> = {
  diagnostic: [
    ['starting', STARTING_SECONDS],
    ['reading', 18],
    ['testing', 45],
    ['concluding', 80],
    ['writing', 3],
  ],
  optimization: [
    ['starting', STARTING_SECONDS],
    ['reading', 22],
    ['testing', 115],
    ['concluding', 110],
    ['writing', 3],
  ],
};

const DEFAULT_ANALYSIS_PLAN: StagePlan = [
  ['starting', STARTING_SECONDS],
  ['reading', 20],
  ['testing', 80],
  ['concluding', 95],
  ['writing', 3],
];

const ANSWER_SECONDS: Record<string, number> = {
  lookup: 62,
  compare: 92,
};
const DEFAULT_ANSWER_SECONDS = 74;

const answerPlan = (analyzingSeconds: number): StagePlan => [
  ['starting', STARTING_SECONDS],
  ['analyzing', analyzingSeconds],
  ['writing', 4],
];

/** The Backend's hard budget for one turn (Jaina AGENTS.md: 600 s). No estimate runs past it. */
export const JAINA_TURN_BUDGET_SECONDS = 600;
/** Below this a turn is quick enough that a bar would only flash. */
export const SHOW_AFTER_SECONDS = 10;
/** The bar never passes this before the turn has finished. */
export const RUNNING_FRACTION_CAP = 0.97;
/** A middle stage running this far past its estimate stops quoting a number. */
const STAGE_OVERRUN_FACTOR = 1.5;
/** How fast the bar creeps toward the cap while the estimate cannot move it. */
const CREEP_TIME_CONSTANT_SECONDS = 240;
const MIN_ETA_SECONDS = 2;

const STAGE_RANK: Record<JainaRunStage, number> = {
  starting: 0,
  reading: 1,
  analyzing: 1,
  testing: 2,
  concluding: 3,
  writing: 4,
  done: 5,
};

// ---------------------------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const languageOf = (value: unknown): RunProgressLanguage | null => {
  if (typeof value !== 'string') return null;
  if (/^es/iu.test(value)) return 'es';
  if (/^en/iu.test(value)) return 'en';
  return null;
};

const SETTLED_STATUSES = new Set(['completed', 'partial']);

/** Read the stage-bearing parts of one assistant message. Pure; safe to call on every render. */
export function readRunSignals(
  message: Pick<JainaUIMessage, 'parts' | 'metadata'> | undefined,
): JainaRunSignals {
  const signals: JainaRunSignals = {
    planned: false,
    questionClass: null,
    expectedDuration: null,
    language: null,
    analysisRows: false,
    readingLayers: false,
    hypothesesTotal: 0,
    hypothesesSettled: 0,
    toolCalls: 0,
    answerStreaming: false,
    finished: message?.metadata?.status !== undefined,
  };
  const hypotheses = new Map<string, string>();
  const layers = new Map<string, string>();
  for (const part of message?.parts ?? []) {
    switch (part.type) {
      case 'data-jaina-plan': {
        signals.planned = true;
        const question = asRecord(asRecord(asRecord(part.data)?.presentation)?.question);
        if (typeof question?.class === 'string') signals.questionClass = question.class;
        if (typeof question?.expected_duration === 'string')
          signals.expectedDuration = question.expected_duration;
        signals.language = languageOf(question?.language) ?? signals.language;
        break;
      }
      case 'data-jaina-analysis-progress': {
        const row = asRecord(part.data);
        if (!row || row.kind === 'notice') break;
        signals.analysisRows = true;
        if (typeof row.id !== 'string') break;
        if (row.kind === 'hypothesis') hypotheses.set(row.id, String(row.status));
        else layers.set(`${String(row.kind)}:${row.id}`, String(row.status));
        break;
      }
      case 'dynamic-tool':
        signals.toolCalls += 1;
        break;
      case 'text':
        if (part.text.trim().length > 0) signals.answerStreaming = true;
        break;
      default:
        break;
    }
  }
  signals.readingLayers = [...layers.values()].some((status) => status === 'running');
  signals.hypothesesTotal = hypotheses.size;
  signals.hypothesesSettled = [...hypotheses.values()].filter((status) =>
    SETTLED_STATUSES.has(status),
  ).length;
  return signals;
}

export function routeOf(signals: JainaRunSignals): JainaRunRoute {
  // Hypotheses are what make a turn long; a short plan also reads layers (a lookup does), and
  // timing those as the hypothesis analysis would call a one-minute answer late after thirty
  // seconds. Measured on run_4e62dff5040443868e0b8b7595f46e3e (lookup, 14 layer rows, 71s).
  if (signals.hypothesesTotal > 0) return 'analysis';
  if (signals.planned) return signals.expectedDuration === 'long' ? 'analysis' : 'answer';
  return signals.analysisRows ? 'analysis' : 'pending';
}

function stageOf(signals: JainaRunSignals, route: JainaRunRoute): JainaRunStage {
  if (signals.finished) return 'done';
  if (signals.answerStreaming) return 'writing';
  if (route === 'analysis') {
    if (signals.hypothesesTotal === 0) return 'reading';
    return signals.hypothesesSettled < signals.hypothesesTotal ? 'testing' : 'concluding';
  }
  if (route === 'answer') return 'analyzing';
  return 'starting';
}

function stagePlanOf(route: JainaRunRoute, questionClass: string | null): StagePlan {
  if (route === 'analysis')
    return (questionClass && ANALYSIS_PLANS[questionClass]) || DEFAULT_ANALYSIS_PLAN;
  return answerPlan((questionClass && ANSWER_SECONDS[questionClass]) || DEFAULT_ANSWER_SECONDS);
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

const ACTIVITY: Record<RunProgressLanguage, Record<Exclude<JainaRunStage, 'done'>, string>> = {
  es: {
    starting: 'Preparando el análisis',
    reading: 'Leyendo los datos de la cuenta',
    testing: 'Revisando posibles causas',
    concluding: 'Sacando conclusiones',
    analyzing: 'Analizando la cuenta',
    writing: 'Redactando la respuesta',
  },
  en: {
    starting: 'Preparing the analysis',
    reading: 'Reading the account data',
    testing: 'Checking possible causes',
    concluding: 'Drawing conclusions',
    analyzing: 'Analyzing the account',
    writing: 'Writing the answer',
  },
};

const EXCEEDED: Record<RunProgressLanguage, string> = {
  es: 'Tardando más de lo esperado…',
  en: 'Taking longer than expected…',
};

const DONE: Record<RunProgressLanguage, string> = { es: 'Listo', en: 'Done' };

/** "~2 min restantes", rounded so the number does not twitch every second. */
export function formatEta(seconds: number, language: RunProgressLanguage): string {
  if (seconds < 20) return language === 'es' ? 'casi listo' : 'almost done';
  if (seconds < 45) return language === 'es' ? '~30 s restantes' : '~30 s left';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (language === 'es') return `~${minutes} min ${minutes === 1 ? 'restante' : 'restantes'}`;
  return `~${minutes} min left`;
}

function activityOf(
  stage: Exclude<JainaRunStage, 'done'>,
  signals: JainaRunSignals,
  language: RunProgressLanguage,
): string {
  const base = ACTIVITY[language][stage];
  if (stage === 'testing' && signals.hypothesesTotal > 0)
    return `${base} (${signals.hypothesesSettled} ${language === 'es' ? 'de' : 'of'} ${signals.hypothesesTotal})`;
  if (stage === 'analyzing' && signals.readingLayers) return ACTIVITY[language].reading;
  if (stage === 'analyzing' && signals.toolCalls > 0) {
    const reads = language === 'es' ? 'consultas' : 'reads';
    const one = language === 'es' ? 'consulta' : 'read';
    return `${base} · ${signals.toolCalls} ${signals.toolCalls === 1 ? one : reads}`;
  }
  return base;
}

// ---------------------------------------------------------------------------------------------
// The tracker — the only stateful piece: when each stage was entered, and the fraction shown last.
// ---------------------------------------------------------------------------------------------

export type JainaRunProgressTracker = {
  observe: (signals: JainaRunSignals, nowMs: number) => JainaRunProgress;
};

export function createRunProgressTracker(options: {
  startedAtMs: number;
  /** The reader's own question, used for the label language until the plan states one. */
  question?: string;
}): JainaRunProgressTracker {
  const startedAt = options.startedAtMs;
  const questionLanguage: RunProgressLanguage =
    options.question !== undefined && !readsAsSpanish(options.question) ? 'en' : 'es';
  let stage: JainaRunStage = 'starting';
  let stageEnteredAt = startedAt;
  let fraction = 0;
  let lastObservedAt = startedAt;
  let lastRoute: JainaRunRoute = 'pending';

  return {
    observe: (signals, nowMs) => {
      const now = Math.max(nowMs, lastObservedAt);
      const dtSeconds = (now - lastObservedAt) / 1000;
      lastObservedAt = now;
      const language = signals.language ?? questionLanguage;
      const elapsed = (now - startedAt) / 1000;

      // The route only ever sharpens: pending → answer/analysis, answer → analysis.
      const derivedRoute = routeOf(signals);
      if (derivedRoute === 'analysis' && lastRoute === 'answer' && stage === 'analyzing') {
        // Rows arrived after all: the same work, now measured against the analysis stages.
        stage = 'reading';
      }
      if (derivedRoute === 'analysis' || lastRoute === 'pending') lastRoute = derivedRoute;
      const route = lastRoute;

      const next = stageOf(signals, route);
      if (STAGE_RANK[next] > STAGE_RANK[stage]) {
        stage = next;
        stageEnteredAt = now;
      }

      if (stage === 'done') {
        fraction = 1;
        return {
          route,
          stage,
          visible: false,
          fraction,
          elapsedSeconds: elapsed,
          etaSeconds: null,
          exceeded: false,
          label: DONE[language],
        };
      }

      // A turn with no plan yet is estimated as an ordinary answer once it has run long enough
      // to show at all; before that it is invisible, so its estimate is never read.
      const plan = stagePlanOf(route === 'pending' ? 'answer' : route, signals.questionClass);
      const index = plan.findIndex(([name]) => name === stage);
      const [, prior] = plan[Math.max(0, index)] ?? ['starting', STARTING_SECONDS];
      const later = plan.slice(index + 1).reduce((sum, [, seconds]) => sum + seconds, 0);
      const inStage = (now - stageEnteredAt) / 1000;

      let stageRemaining = Math.max(0, prior - inStage);
      if (
        stage === 'testing' &&
        signals.hypothesesSettled > 0 &&
        signals.hypothesesSettled < signals.hypothesesTotal
      ) {
        // The hypotheses settled so far say how fast this account is going; average that pace
        // with the prior so one quick or slow hypothesis cannot swing the estimate on its own.
        const paced =
          (inStage * (signals.hypothesesTotal - signals.hypothesesSettled)) /
          signals.hypothesesSettled;
        stageRemaining = (stageRemaining + paced) / 2;
      }
      const isLastTimedStage = index === plan.length - 1 || stage === 'concluding';
      // An unplanned turn still waiting for its plan has no estimate of its own to outrun: it is
      // quoted as an ordinary answer until the plan says otherwise.
      const stageOverrun =
        route !== 'pending' &&
        stageRemaining === 0 &&
        (isLastTimedStage || inStage > prior * STAGE_OVERRUN_FACTOR);
      const budgetLeft = JAINA_TURN_BUDGET_SECONDS - elapsed;
      const rawEta = Math.min(stageRemaining + later, budgetLeft);
      const exceeded = stageOverrun || rawEta <= 0;
      const eta = exceeded ? null : Math.max(MIN_ETA_SECONDS, rawEta);

      const estimated = eta === null ? 0 : elapsed / (elapsed + eta);
      const creep =
        fraction +
        (RUNNING_FRACTION_CAP - fraction) *
          (1 - Math.exp(-dtSeconds / CREEP_TIME_CONSTANT_SECONDS));
      fraction = Math.min(RUNNING_FRACTION_CAP, Math.max(fraction, estimated, creep));

      const visible = route !== 'pending' || elapsed >= SHOW_AFTER_SECONDS;
      const activity = activityOf(stage, signals, language);
      const label = `${activity} · ${eta === null ? EXCEEDED[language] : formatEta(eta, language)}`;
      return {
        route,
        stage,
        visible,
        fraction,
        elapsedSeconds: elapsed,
        etaSeconds: eta,
        exceeded,
        label,
      };
    },
  };
}
