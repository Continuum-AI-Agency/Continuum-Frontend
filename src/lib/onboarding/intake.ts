import type { OnboardingState } from './state';

export function readyIntakeDocuments(state: OnboardingState) {
  return state.documents.filter(
    (doc) =>
      doc.status === 'ready' &&
      !doc.archivedAt &&
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
