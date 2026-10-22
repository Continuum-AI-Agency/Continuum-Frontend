// One clarification turn exactly as the Backend's Phase 2 planner sends it on beta: the account
// mixes conversations and purchases, so before reading a metric Jaina asks which business result
// to use (`businessResultSurveyOf` + `resolvePhase2Premises` in the Backend's `phase2Planning.ts`,
// emitted by `orchestrator.ts` and mapped to parts by `uiMessageChunks.ts`).
//
// Three parts, in wire order:
//   1. `response.block.delta` → a `jaina-report-block` part holding the `survey` block;
//   2. `response.output_text.delta` → the question again as plain text;
//   3. `response.clarification_request` → a `jaina-clarification` part whose data is the frame's
//      WHOLE `data` — `{ item_id, part_id, clarification }` — with the request nested.

import {
  JAINA_UI_DATA_PART,
  type JainaUIMessage,
  type SurveyBlock,
  surveyBlockSchema,
} from '@continuum/contracts';

export const CLARIFICATION_QUESTION = '¿Qué resultado de negocio debo usar para este análisis?';
export const CLARIFICATION_OPTIONS = ['Leads', 'Compras', 'Conversaciones'];
export const CLARIFICATION_ID = 'clar_5f0c2a7e9b1d4c3a8e6f2b1a0c9d8e7f';

export const businessResultSurvey: SurveyBlock = surveyBlockSchema.parse({
  block_id: 'phase2_business_result',
  category: 'survey',
  scope: 'account',
  title: CLARIFICATION_QUESTION,
  term: 'resultado de negocio',
  used: 'Sin definir; el análisis espera tu elección.',
  alternatives: CLARIFICATION_OPTIONS,
});

export const clarificationTurn = (): JainaUIMessage =>
  ({
    id: 'msg_clarify',
    role: 'assistant',
    metadata: { runId: 'run_clarify', status: 'completed' },
    parts: [
      {
        type: JAINA_UI_DATA_PART.reportBlock,
        id: 'run_clarify:block:phase2_business_result',
        data: businessResultSurvey,
      },
      { type: 'text', text: CLARIFICATION_QUESTION },
      {
        type: JAINA_UI_DATA_PART.clarification,
        id: 'run_clarify:clarification',
        data: {
          item_id: 'item_1',
          part_id: 'part_1',
          clarification: {
            id: CLARIFICATION_ID,
            question: CLARIFICATION_QUESTION,
            source_scope: 'core',
            source_agent: 'Jaina_question_planner',
            requested_at: '2026-10-21T14:02:11.000Z',
          },
        },
      },
    ],
  }) as unknown as JainaUIMessage;
