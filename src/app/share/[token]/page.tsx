// Public, unauthenticated share viewer. The token in the URL is the only
// credential: the library-share edge function validates it (existence,
// revocation, expiry, passcode and identity) and returns the assets with
// short-lived signed URLs; loadSharePayload maps them onto the page.

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { loadSharePresentation } from './loadSharePayload';
import { ShareViewerSkeleton } from './ShareViewerSkeleton';
import { ShareLoader } from './shareLoader';

// The tab names the link (its header title, else the brand); a white-labelled
// link (hideFooter) leaves Continuum out of it too.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const presentation = await loadSharePresentation(token);
  const name = presentation?.title ?? presentation?.brandName ?? 'Shared media';
  return {
    title: presentation?.hideFooter ? name : `${name} — Continuum`,
    robots: { index: false, follow: false },
  };
}

export default function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<ShareViewerSkeleton />}>
      <ShareLoader paramsPromise={params} searchParamsPromise={searchParams} />
    </Suspense>
  );
}
