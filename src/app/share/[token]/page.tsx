// Public, unauthenticated share viewer. The token in the URL is the only
// credential: loadSharePayload validates it (existence, revocation, expiry)
// with the admin client and returns assets carrying short-lived signed URLs.

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { loadSharePayload } from './loadSharePayload';
import { reviewerSessionCookieName } from './reviewerSession.server';
import { ShareAccessChallenge } from './ShareAccessChallenge';
import { SharePayloadView } from './SharePayloadView';
import { ShareUnavailableCard } from './ShareUnavailableCard';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: 'Shared media — Continuum',
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cookieStore = await cookies();
  const reviewerSession = cookieStore.get(reviewerSessionCookieName(token))?.value;
  const result = await loadSharePayload(token, reviewerSession);
  if (!result.ok && result.reason === 'challenge') {
    return (
      <ShareAccessChallenge
        token={token}
        needsPasscode={result.needsPasscode}
        requireIdentity={result.requireIdentity}
      />
    );
  }
  if (!result.ok) return <ShareUnavailableCard reason={result.reason} />;
  return <SharePayloadView token={token} payload={result.payload} />;
}
