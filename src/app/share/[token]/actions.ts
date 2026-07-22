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

  const input = createExternalShareCommentRequestSchema.safeParse({
    token,
    sessionToken: reviewerSession.token,
    assetId,
    versionId,
    body: String(formData.get('body') ?? ''),
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
  revalidatePath(`/share/${token}`);
  return { error: null, decision: decision.data.decision };
}
