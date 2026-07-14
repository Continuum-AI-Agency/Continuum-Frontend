const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const DRAFT_ID = new RegExp(`\\bDraft ID:\\s*(${UUID_SOURCE})\\b`, 'giu');
const DRAFT_REFERENCE = new RegExp(`\\bdraft\\s+(${UUID_SOURCE})\\b`, 'giu');
const JOB_REFERENCE = new RegExp(`\\bjob\\s+${UUID_SOURCE}\\b`, 'giu');

export function presentAgentMessage(content: string): string {
  return content
    .replace(
      DRAFT_ID,
      (_match, draftId: string) =>
        `Draft: [Open in Planner](/organic?tab=planner&draftId=${encodeURIComponent(draftId)})`,
    )
    .replace(
      DRAFT_REFERENCE,
      (_match, draftId: string) =>
        `[Open draft in Planner](/organic?tab=planner&draftId=${encodeURIComponent(draftId)})`,
    )
    .replace(JOB_REFERENCE, 'the current generation');
}
