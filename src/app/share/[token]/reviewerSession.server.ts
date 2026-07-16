import 'server-only';

import { createHash } from 'node:crypto';

export function reviewerSessionCookieName(shareToken: string): string {
  const suffix = createHash('sha256').update(shareToken).digest('hex').slice(0, 20);
  return `continuum_share_${suffix}`;
}

export function hashReviewerSessionToken(sessionToken: string): string {
  return createHash('sha256').update(sessionToken).digest('base64url');
}

export async function invokePublicCreativeOperation(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, message: 'Review service is not configured.' };
  try {
    const response = await fetch(`${url}/functions/v1/library-creative-operations`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = (await response.json()) as { message?: unknown; error?: unknown };
    if (!response.ok) {
      return {
        ok: false,
        message:
          typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : 'The review link could not be unlocked.',
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, message: 'The review service is temporarily unavailable.' };
  }
}
