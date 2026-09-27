'use server';

import {
  createExternalShareCommentRequestSchema,
  createExternalShareCommentResponseSchema,
  decideExternalShareReviewRequestSchema,
  externalReviewerSessionRequestSchema,
  externalReviewerSessionResponseSchema,
  externalShareReviewDecisionSchema,
  type ShareLinkEventKind,
  customFieldOptionsSchema,
  customFieldTypeSchema,
  isShareFeaturableFieldType,
  valueSchemaFor,
} from '@continuum/contracts';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { mediaSchema } from '@/lib/media/supabase-media';
import { resolveShareLink, shareAssetIds } from './loadSharePayload';
import { invokePublicCreativeOperation, reviewerSessionCookieName } from './reviewerSession.server';
import { recordShareEvent } from './shareEvents.server';

async function recordReviewerEvent(
  token: string,
  sessionToken: string,
  event: { kind: ShareLinkEventKind; assetId: string; versionId?: string },
): Promise<void> {
  const resolved = await resolveShareLink(token, sessionToken);
  if (!resolved.ok) return;
  await recordShareEvent(
    { linkId: resolved.link.id, brandId: resolved.link.brand_id, sessionId: resolved.session?.id ?? null },
    event,
  );
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

function formValue(type: string, raw: FormDataEntryValue | null): unknown {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (type === 'checkbox') return text === 'true';
  if (text === '') return null;
  if (type === 'number' || type === 'rating') return Number(text);
  return text;
}

// A guest sets the one field the owner featured on this link. The value is
// checked against the field here and again by the asset_field_values trigger.
export async function editFeaturedField(
  token: string,
  assetId: string,
  versionId: string,
  _previous: FeaturedFieldActionState,
  formData: FormData,
): Promise<FeaturedFieldActionState> {
  const reviewerSession = await reviewerSessionForMutation(token, formData);
  if (!reviewerSession.ok) return { error: reviewerSession.error, saved: false };
  const resolved = await resolveShareLink(token, reviewerSession.token);
  if (!resolved.ok || !resolved.link.featured_field_id || !resolved.identityPresent) {
    return { error: 'This link does not take field edits.', saved: false };
  }
  const { admin, link } = resolved;
  if (!(await shareAssetIds(admin, link)).includes(assetId)) {
    return { error: 'That asset is not on this link.', saved: false };
  }
  const media = mediaSchema(admin);
  const { data: field } = await media
    .from('custom_fields')
    .select('id, type, options')
    .eq('id', link.featured_field_id)
    .eq('brand_id', link.brand_id)
    .maybeSingle();
  const type = customFieldTypeSchema.safeParse((field as { type?: unknown } | null)?.type);
  const options = customFieldOptionsSchema.safeParse((field as { options?: unknown } | null)?.options);
  if (!type.success || !options.success || !isShareFeaturableFieldType(type.data)) {
    return { error: 'This field cannot be edited here.', saved: false };
  }

  const raw = formValue(type.data, formData.get('value'));
  const write =
    raw === null
      ? await media
          .from('asset_field_values')
          .delete()
          .eq('asset_id', assetId)
          .eq('field_id', link.featured_field_id)
      : await (async () => {
          const value = valueSchemaFor(type.data, options.data).safeParse(raw);
          if (!value.success) return { error: { message: 'invalid_field_value' } };
          return media.from('asset_field_values').upsert(
            {
              asset_id: assetId,
              field_id: link.featured_field_id,
              brand_id: link.brand_id,
              value: value.data,
              updated_by: null,
            },
            { onConflict: 'asset_id,field_id' },
          );
        })();
  if (write.error) {
    return {
      error:
        write.error.message === 'invalid_field_value' ? 'That value does not fit this field.' : 'Could not save.',
      saved: false,
    };
  }
  await recordShareEvent(
    { linkId: link.id, brandId: link.brand_id, sessionId: resolved.session?.id ?? null },
    { kind: 'field_edit', assetId, versionId },
  );
  revalidatePath(`/share/${token}`);
  return { error: null, saved: true };
}
