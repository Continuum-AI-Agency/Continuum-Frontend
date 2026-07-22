const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const DRAFT_ID = new RegExp(`\\bDraft ID:\\s*(${UUID_SOURCE})\\b`, 'giu');
const DRAFT_REFERENCE = new RegExp(`\\bdraft\\s+(${UUID_SOURCE})\\b`, 'giu');
const JOB_REFERENCE = new RegExp(`\\bjob\\s+${UUID_SOURCE}\\b`, 'giu');

// THE one place the planner draft deep-link shape is built. The chat "View post"
// CTA (MessageDraftLinks) and the shell-wide Generations panel both route through
// it, so the URL can never drift between the surfaces that open a draft.
export const buildPlannerDraftDeepLink = (draftId: string): string =>
  `/organic?tab=planner&draftId=${encodeURIComponent(draftId)}`;

export function presentAgentMessage(content: string): string {
  return content
    .replace(
      DRAFT_ID,
      (_match, draftId: string) =>
        `Draft: [Open in Planner](${buildPlannerDraftDeepLink(draftId)})`,
    )
    .replace(
      DRAFT_REFERENCE,
      (_match, draftId: string) => `[Open draft in Planner](${buildPlannerDraftDeepLink(draftId)})`,
    )
    .replace(JOB_REFERENCE, 'the current generation');
}
