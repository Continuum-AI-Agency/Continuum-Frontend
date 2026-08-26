// Public, unauthenticated share viewer. The token in the URL is the only
// credential: loadSharePayload validates it (existence, revocation, expiry)
// with the admin client and returns assets carrying short-lived signed URLs.

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShareViewerSkeleton } from './ShareViewerSkeleton';
import { ShareLoader } from './shareLoader';

export const metadata: Metadata = {
  title: 'Shared media — Continuum',
  robots: { index: false, follow: false },
};

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<ShareViewerSkeleton />}>
      <ShareLoader paramsPromise={params} />
    </Suspense>
  );
}
