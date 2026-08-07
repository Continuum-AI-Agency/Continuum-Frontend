'use client';

import { DOCUMENT_CATEGORY_DEFAULT } from '@continuum/contracts';
import { uploadBrandDocument } from './uploadBrandDocument';

export type EphemeralChatDocument = {
  documentId: string;
  storagePath: string;
  name: string;
  expiresAt?: string;
};

/**
 * Ingests a file a user dropped into a chat as a ONE-OFF document: same table, same
 * bucket, same extract → chunk → embed pipeline as curated brand knowledge, but marked
 * ephemeral and scoped to the conversation that produced it.
 *
 * Going through the real pipeline rather than stashing text on the session is what
 * makes it retrievable at all — and it means "Save to Knowledge" later is a flag flip
 * with no data movement and no re-embed.
 *
 * `scopeKey` is what keeps it private to this conversation: the retrieval predicate
 * fails closed, so without a matching scope key the document is invisible to every
 * other session and to all brand-wide grounding.
 */
export async function uploadEphemeralChatDocument({
  brandId,
  file,
  scopeKey,
}: {
  brandId: string;
  file: File;
  scopeKey: string;
}): Promise<EphemeralChatDocument> {
  const result = await uploadBrandDocument({
    brandId,
    file,
    // A chat drop carries no stated purpose. Categorising it as brand_guidelines or
    // creative_strategy would let a throwaway file weight itself as brand truth.
    category: DOCUMENT_CATEGORY_DEFAULT,
    retention: 'ephemeral',
    scopeKey,
    // Never mirror a one-off into the brand's onboarding intake.
    syncOnboardingState: false,
  });

  return {
    documentId: result.documentId,
    storagePath: result.storagePath,
    name: result.document.name,
    expiresAt: result.document.expiresAt,
  };
}
