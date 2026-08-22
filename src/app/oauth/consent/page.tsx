import { Suspense } from 'react';
import { ConsentContent, ConsentSkeleton } from './ConsentClient';

// The Suspense boundary has to live in the server tree. When the whole page was
// a Client Component the boundary sat inside the client bundle, so prerender
// still hit useSearchParams() with nothing to suspend on.
export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<ConsentSkeleton />}>
      <ConsentContent />
    </Suspense>
  );
}
