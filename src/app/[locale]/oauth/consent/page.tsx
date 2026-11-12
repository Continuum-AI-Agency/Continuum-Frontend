import { Suspense } from 'react';
import { ConsentContent, ConsentSkeleton } from './ConsentClient';

// The dynamic read has to be a server await inside the boundary, not a client hook. A server-tree
// <Suspense> around a component calling useSearchParams() does NOT satisfy Cache Components — the
// route still reports CLIENT_HOOK_DYNAMIC and loses its static shell (measured). Awaiting the
// searchParams promise here and passing the value down keeps the subtree server-rendered.
async function ConsentLoader({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const authorizationId = searchParams.authorization_id;
  return (
    <ConsentContent
      authorizationId={typeof authorizationId === 'string' ? authorizationId : null}
    />
  );
}

export default function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense fallback={<ConsentSkeleton />}>
      <ConsentLoader searchParamsPromise={searchParams} />
    </Suspense>
  );
}
