import { Suspense } from 'react';
import { MockOAuthPopupContent, PopupStatus } from './MockOAuthClient';

// The dynamic read has to be a server await inside the boundary, not a client hook. A server-tree
// <Suspense> around a component calling useSearchParams() does NOT satisfy Cache Components — the
// route still reports CLIENT_HOOK_DYNAMIC and loses its static shell (measured). Awaiting the
// searchParams promise here and passing the value down keeps the subtree server-rendered.
async function MockOAuthLoader({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const provider = typeof searchParams.provider === 'string' ? searchParams.provider : 'mock';
  const context = typeof searchParams.context === 'string' ? searchParams.context : 'onboarding';
  return <MockOAuthPopupContent provider={provider} context={context} />;
}

export default function MockOAuthPopup({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense fallback={<PopupStatus provider="account" />}>
      <MockOAuthLoader searchParamsPromise={searchParams} />
    </Suspense>
  );
}
