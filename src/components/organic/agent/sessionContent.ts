import type { AgentMentionReference, AgentMentionSuggestion } from '@/lib/agent-references';
import { resolveConceptPreviewUrls } from './conceptPreview';
import type { AgentJobState, PipelineCardState } from './types';

const LABEL_MAX = 48;

// PromptInput folds a chip's preview URL into the reference metadata that is sent and persisted,
// so a base64 preview would ride every later turn. Only a real link is worth carrying.
const isLinkable = (url: string | null | undefined): url is string =>
  typeof url === 'string' && /^https?:\/\//.test(url);

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

/**
 * The drafts this session generated, newest first, as `draft` chips. The chip is a pointer: the
 * Backend grounds it as `draft_id=…` and the agent reads and revises the real row through its
 * getDraft / updateDraft tools, so only an identity plus a short caption travel on the turn.
 *
 * Reads pipeline cards AND durable jobs, the same pair the in-flight feed mirrors: a job can carry
 * a draftId with no pipeline card behind it.
 */
export function organicSessionContent(
  pipeline: Readonly<Record<string, PipelineCardState>>,
  jobs: Readonly<Record<string, AgentJobState>>,
): AgentMentionSuggestion[] {
  const jobIds = [...Object.keys(pipeline), ...Object.keys(jobs).filter((id) => !pipeline[id])];
  const byDraft = new Map<string, AgentMentionSuggestion>();
  for (const jobId of jobIds) {
    const card = pipeline[jobId];
    const job = jobs[jobId];
    const draftId = job?.draftId ?? card?.draftId;
    if (!draftId) continue;
    const post = job?.uiPostCard;
    const caption = (card?.preview?.caption ?? post?.caption)?.trim() || null;
    const format = card?.preview?.format ?? post?.format ?? null;
    const platform = job?.platform ?? card?.platform ?? null;
    const status = card?.status ?? job?.status;
    const label = caption
      ? shorten(caption)
      : [format, platform, 'draft'].filter(Boolean).join(' ');
    const reference = {
      id: draftId,
      type: 'draft',
      label,
      source: 'organic',
      metadata: {
        draftId,
        backendDraftId: draftId,
        platforms: platform ? [platform] : [],
        ...(caption ? { captionPreview: caption.slice(0, 240) } : {}),
        ...(format ? { format } : {}),
      },
    } satisfies AgentMentionReference;
    // A draft's later card (a re-run, a blueprint) supersedes the earlier one.
    byDraft.delete(draftId);
    byDraft.set(draftId, {
      key: `draft:${draftId}`,
      label,
      type: 'draft',
      source: 'organic',
      group: 'This session',
      // A failed card can still hold a real draft (text landed, media did not) — "fix this one"
      // is exactly the iteration this tray is for, so it stays, labelled.
      description: [platform, format, status === 'completed' ? null : status]
        .filter(Boolean)
        .join(' · '),
      reference,
      preview: {
        url: [
          ...resolveConceptPreviewUrls(card?.preview),
          ...(job?.previewImages ?? []),
          post?.imageUrl,
        ].find(isLinkable),
        kind: 'image',
      },
    });
  }
  return [...byDraft.values()].reverse();
}
