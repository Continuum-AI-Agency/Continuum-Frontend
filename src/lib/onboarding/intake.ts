import type { OnboardingIntake } from '@continuum/contracts';
import type { OnboardingState } from './state';

/**
 * The link to read for an intake. A website or profile intake must be read; a link typed
 * beside files or a description is extra evidence, so a failed read of it does not stop
 * the analysis the files or description can still drive.
 */
export function intakeSourceUrl(
  intake: OnboardingIntake,
): { url: string; required: boolean } | null {
  if (intake.url) return { url: intake.url, required: true };
  return intake.reference_url ? { url: intake.reference_url, required: false } : null;
}

export function readyIntakeDocuments(state: OnboardingState, now = Date.now()) {
  return state.documents.filter(
    (doc) =>
      doc.status === 'ready' &&
      !doc.archivedAt &&
      (!doc.expiresAt || Date.parse(doc.expiresAt) > now) &&
      (!doc.retention || doc.retention === 'permanent'),
  );
}

export function intakeDocumentsProcessing(state: OnboardingState): boolean {
  return state.documents.some((doc) => doc.status === 'processing' && !doc.archivedAt);
}

export async function intakeInputKey(state: OnboardingState): Promise<string> {
  const text = JSON.stringify({
    intake: state.intake ?? null,
    website: state.brand.website,
    documents: readyIntakeDocuments(state)
      .map((doc) => [doc.id, doc.version ?? 1])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `input:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
