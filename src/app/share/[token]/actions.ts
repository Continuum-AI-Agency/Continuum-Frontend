'use server';

import {
  createExternalShareCommentRequestSchema,
  createExternalShareCommentResponseSchema,
  decideExternalShareReviewRequestSchema,
  externalReviewerSessionRequestSchema,
  externalReviewerSessionResponseSchema,
  externalShareReviewDecisionSchema,
} from '@continuum/contracts';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { invokePublicCreativeOperation, reviewerSessionCookieName } from './reviewerSession.server';
import { invokeLibraryShare } from './shareEdge.server';
import { recordShareEvent, viewerContext } from './shareEvents.server';

async function recordReviewerEvent(
  token: string,
  sessionToken: string,
  event: { kind: 'comment' | 'decision'; assetId: string; versionId?: string },
): Promise<void> {
  await recordShareEvent(token, { ...event, sessionToken });
}

export type ShareAccessActionState = { error: string | null };

async function storeReviewerSession(token: string, sessionToken: string, expiresAt: string) {
  const cookieStore = await cookies();
  cookieStore.set(reviewerSessionCookieName(token), sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/share/${token}`,
    expires: new Date(expiresAt),
  });
}

export async function establishReviewerSession(
  token: string,
  _previous: ShareAccessActionState,
  formData: FormData,
): Promise<ShareAccessActionState> {
  const input = externalReviewerSessionRequestSchema.safeParse({
    token,
    passcode: String(formData.get('passcode') ?? '').trim() || undefined,
    displayName: String(formData.get('displayName') ?? '').trim() || undefined,
    email: String(formData.get('email') ?? '').trim() || undefined,
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? 'Check the form.' };

  const result = await invokePublicCreativeOperation({
    action: 'create_external_reviewer_session',
    ...input.data,
  });
  if (!result.ok) return { error: result.message };
  const session = externalReviewerSessionResponseSchema.safeParse(result.data);
  if (!session.success) return { error: 'The review service returned an invalid session.' };

  await storeReviewerSession(token, session.data.sessionToken, session.data.expiresAt);
  redirect(`/share/${token}`);
}

export type ExternalCommentActionState = { error: string | null; posted: boolean };

async function reviewerSessionForMutation(
  token: string,
  formData: FormData,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const existing = (await cookies()).get(reviewerSessionCookieName(token))?.value ?? null;
  const displayName = String(formData.get('displayName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  if (!displayName && !email && existing) return { ok: true, token: existing };
  const identity = externalReviewerSessionRequestSchema.safeParse({
    token,
    displayName: displayName || undefined,
    email: email || undefined,
    passcode: String(formData.get('passcode') ?? '').trim() || undefined,
  });
  if (!identity.success) {
    return {
      ok: false,
      error: identity.error.issues[0]?.message ?? 'Name and email are required.',
    };
  }
  const sessionResult = await invokePublicCreativeOperation({
    action: 'create_external_reviewer_session',
    ...identity.data,
  });
  if (!sessionResult.ok) return { ok: false, error: sessionResult.message };
  const session = externalReviewerSessionResponseSchema.safeParse(sessionResult.data);
  if (!session.success) return { ok: false, error: 'Could not establish reviewer identity.' };
  await storeReviewerSession(token, session.data.sessionToken, session.data.expiresAt);
  return { ok: true, token: session.data.sessionToken };
}

export async function postExternalComment(
  token: string,
  assetId: string,
  versionId: string,
  _previous: ExternalCommentActionState,
  formData: FormData,
): Promise<ExternalCommentActionState> {
  const reviewerSession = await reviewerSessionForMutation(token, formData);
  if (!reviewerSession.ok) return { error: reviewerSession.error, posted: false };

  // A guest pins feedback to the player's moment, or the I/O range they marked.
  const timeMs = String(formData.get('timeMs') ?? '');
  const endMs = String(formData.get('endMs') ?? '');
  const annotation = /^\d+$/.test(timeMs)
    ? {
        kind: 'time' as const,
        timeMs: Number(timeMs),
        ...(/^\d+$/.test(endMs) ? { endMs: Number(endMs) } : {}),
      }
    : undefined;
  const input = createExternalShareCommentRequestSchema.safeParse({
    token,
    sessionToken: reviewerSession.token,
    assetId,
    versionId,
    body: String(formData.get('body') ?? ''),
    ...(annotation ? { annotation } : {}),
    idempotencyKey: crypto.randomUUID(),
  });
  if (!input.success) {
    return { error: input.error.issues[0]?.message ?? 'Write a comment first.', posted: false };
  }
  const result = await invokePublicCreativeOperation({
    action: 'create_external_share_comment',
    ...input.data,
  });
  if (!result.ok) return { error: result.message, posted: false };
  if (!createExternalShareCommentResponseSchema.safeParse(result.data).success) {
    return { error: 'The review service returned an invalid comment.', posted: false };
  }
  await recordReviewerEvent(token, reviewerSession.token, { kind: 'comment', assetId, versionId });
  revalidatePath(`/share/${token}`);
  return { error: null, posted: true };
}

export type ExternalReviewActionState = {
  error: string | null;
  decision: 'approved' | 'needs_changes' | null;
};

export async function decideExternalReview(
  token: string,
  assetId: string,
  versionId: string,
  _previous: ExternalReviewActionState,
  formData: FormData,
): Promise<ExternalReviewActionState> {
  const reviewerSession = await reviewerSessionForMutation(token, formData);
  if (!reviewerSession.ok) return { error: reviewerSession.error, decision: null };
  const input = decideExternalShareReviewRequestSchema.safeParse({
    token,
    sessionToken: reviewerSession.token,
    assetId,
    versionId,
    decision: String(formData.get('decision') ?? ''),
    note: String(formData.get('note') ?? '').trim() || undefined,
    idempotencyKey: crypto.randomUUID(),
  });
  if (!input.success) {
    return { error: input.error.issues[0]?.message ?? 'Choose a review decision.', decision: null };
  }
  const result = await invokePublicCreativeOperation({
    action: 'decide_external_share_review',
    ...input.data,
  });
  if (!result.ok) return { error: result.message, decision: null };
  const decision = externalShareReviewDecisionSchema.safeParse(result.data);
  if (!decision.success)
    return { error: 'The review service returned an invalid decision.', decision: null };
  await recordReviewerEvent(token, reviewerSession.token, { kind: 'decision', assetId, versionId });
  revalidatePath(`/share/${token}`);
  return { error: null, decision: decision.data.decision };
}

export type FeaturedFieldActionState = { error: string | null; saved: boolean };

function formValue(type: string, raw: FormDataEntryValue | null): string | number | boolean | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (type === 'checkbox') return text === 'true';
  if (text === '') return null;
  if (type === 'number' || type === 'rating') return Number(text);
  return text;
}

// A guest sets the one field the owner featured on this link. The library-share
// edge function checks the link, the reviewer's identity and the asset, and
// validates the value against the field (the asset_field_values trigger again).
export async function editFeaturedField(
  token: string,
  assetId: string,
  versionId: string,
  fieldType: string,
  _previous: FeaturedFieldActionState,
  formData: FormData,
): Promise<FeaturedFieldActionState> {
  const reviewerSession = await reviewerSessionForMutation(token, formData);
  if (!reviewerSession.ok) return { error: reviewerSession.error, saved: false };
  const result = await invokeLibraryShare({
    action: 'edit_featured_field',
    token,
    ...(await viewerContext(token, reviewerSession.token)),
    sessionToken: reviewerSession.token,
    assetId,
    versionId,
    value: formValue(fieldType, formData.get('value')),
  });
  if (!result.ok) return { error: result.error, saved: false };
  revalidatePath(`/share/${token}`);
  return { error: null, saved: true };
}

export type ViewerNameActionState = { error: string | null; saved: boolean };

// Light name capture on an open link: an optional name (no email) that opens a
// reviewer session, so this viewer's opens, views and downloads carry the name.
export async function setViewerName(
  token: string,
  _previous: ViewerNameActionState,
  formData: FormData,
): Promise<ViewerNameActionState> {
  const input = externalReviewerSessionRequestSchema.safeParse({
    token,
    // Its own field name: the identity forms beside it already use displayName.
    displayName: String(formData.get('viewerName') ?? '').trim() || undefined,
    passcode: String(formData.get('passcode') ?? '').trim() || undefined,
  });
  if (!input.success || !input.data.displayName) {
    return { error: 'Enter your name.', saved: false };
  }
  const result = await invokePublicCreativeOperation({
    action: 'create_external_reviewer_session',
    ...input.data,
  });
  if (!result.ok) return { error: result.message, saved: false };
  const session = externalReviewerSessionResponseSchema.safeParse(result.data);
  if (!session.success) return { error: 'Could not save your name.', saved: false };
  await storeReviewerSession(token, session.data.sessionToken, session.data.expiresAt);
  revalidatePath(`/share/${token}`);
  return { error: null, saved: true };
}
