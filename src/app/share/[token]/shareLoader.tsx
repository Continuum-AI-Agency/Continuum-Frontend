import { cookies } from 'next/headers';
import { loadSharePayload } from './loadSharePayload';
import { reviewerSessionCookieName } from './reviewerSession.server';
import { ShareAccessChallenge } from './ShareAccessChallenge';
import { SharePayloadView } from './SharePayloadView';
import { ShareUnavailableCard } from './ShareUnavailableCard';

// Every dynamic read for this route lives here, behind the page's <Suspense>, so the route can still
// prerender a static shell. Awaiting params/cookies in the page component itself is what left this
// route emitting a 0-byte shell.
export async function ShareLoader({
  paramsPromise,
}: {
  paramsPromise: Promise<{ token: string }>;
}) {
  const { token } = await paramsPromise;
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
