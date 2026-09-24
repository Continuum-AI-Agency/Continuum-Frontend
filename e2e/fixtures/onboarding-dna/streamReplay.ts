// A Brand DNA run that goes wrong in every way production has seen, as the SSE event
// sequence the Backend persists to `preview_run_events` and the `/preview/:runId/events`
// tail replays. The shapes are the Backend's own: `runSection` emits `status: running`,
// raw `stream` deltas of the structured output while it generates, then either `data` +
// `status: done` or `status: error` with the SDK's message. The error text and the
// missing sections are what prod recorded for the 31 runs of the 30 days to 2026-09-24:
// "The operation timed out." is the only error message seen, and strategy + guidelines
// never started in 19 of those runs.
//
// No customer content: every string here is synthetic.

export const AUDIENCE_SUMMARY = 'Practice managers at independent physiotherapy clinics.';
/** Rendered by the audience card; it must survive the bad segment beside it. */
export const KEPT_DEMOGRAPHIC = 'Clinic owners running two to five treatment rooms';

/** The voice model's output, cut off mid-object when the section timed out. */
export const TRUNCATED_VOICE_DELTA =
  '{\n  "tone": "Plain, practical and calm",\n  "voice_style": "Short sentences that';

export const STREAM_REPLAY_EVENTS: Array<Record<string, unknown>> = [
  // TIMED OUT — a truncated JSON delta, then the section fails.
  { kind: 'status', section: 'voice', status: 'running' },
  { kind: 'stream', section: 'voice', delta: TRUNCATED_VOICE_DELTA },
  { kind: 'status', section: 'voice', status: 'error', error: 'The operation timed out.' },

  // MALFORMED — the payload fails its schema on a required field; the Backend still
  // follows it with `done`.
  { kind: 'status', section: 'business', status: 'running' },
  {
    kind: 'stream',
    section: 'business',
    delta: '{"business_name": "DNA Bench Brand", "business_description": "Scheduling for',
  },
  { kind: 'data', section: 'business', data: { business_name: 42, business_description: null } },
  { kind: 'status', section: 'business', status: 'done' },

  // ONE BAD FIELD — a single malformed segment must cost that segment, not the section:
  // the summary and the demographics beside it still render.
  { kind: 'status', section: 'audience', status: 'running' },
  { kind: 'stream', section: 'audience', delta: '{"summary": "Practice managers at' },
  {
    kind: 'data',
    section: 'audience',
    data: {
      summary: AUDIENCE_SUMMARY,
      demographics: [KEPT_DEMOGRAPHIC],
      segments: [
        { name: 'Clinic owners', headline: 'Run the front desk and the P&L.' },
        { name: 7, headline: { text: 'not a string' } },
      ],
    },
  },
  { kind: 'status', section: 'audience', status: 'done' },

  // NEVER FINISHES — still running when the run ends (a crashed lane the reconciler
  // closes), with half an object streamed.
  { kind: 'status', section: 'website', status: 'running' },
  { kind: 'stream', section: 'website', delta: '{"hero_statement": "The bench brand st' },

  { kind: 'status', section: 'first_impression', status: 'running' },
  {
    kind: 'status',
    section: 'first_impression',
    status: 'error',
    error: 'The operation timed out.',
  },

  // MISSING — strategy and guidelines emit nothing at all.

  { kind: 'complete', phase: 'preview', status: 'partial', result: { readiness: null } },
];

/**
 * What an older client SAVED to the onboarding state from those deltas: 50 of 399 prod
 * states carried model JSON as `targetAudience`, 30 as `brandVoice`, 1 as `overview`.
 */
export const SAVED_JSON_BRAND = {
  overview: '{"business_name": "DNA Bench Brand", "business_description": "Scheduling for',
  targetAudience: '{\n  "behaviors": [\n    "Books appointments online",\n    "Compa',
  brandVoice: '{"tone": "Plain, practical and calm", "keywords": ["clinic"',
};

/** Where every card must END once the run is over — content, or an honest reason. */
export const EXPECTED_PHASES: Record<string, 'content' | 'error' | 'unavailable'> = {
  'Business overview': 'error',
  'Brand voice & tone': 'error',
  'Target audience': 'content',
  Strategy: 'unavailable',
  Guidelines: 'unavailable',
  'Website summary': 'error',
  'Understanding brief': 'unavailable',
};
