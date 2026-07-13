// Public, unauthenticated share viewer. The token in the URL is the only
// credential: loadSharePayload validates it (existence, revocation, expiry)
// with the admin client and returns assets carrying short-lived signed URLs.

import type { Metadata } from 'next';
import { loadSharePayload } from './loadSharePayload';
import { SharePayloadView } from './SharePayloadView';
import { ShareUnavailableCard } from './ShareUnavailableCard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shared media — Continuum',
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadSharePayload(token);
  if (!result.ok) return <ShareUnavailableCard reason={result.reason} />;
  return <SharePayloadView payload={result.payload} />;
}
