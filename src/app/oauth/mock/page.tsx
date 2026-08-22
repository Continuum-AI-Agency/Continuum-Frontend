import { Suspense } from 'react';
import { MockOAuthPopupContent, PopupStatus } from './MockOAuthClient';

// The Suspense boundary has to live in the server tree. When the whole page was
// a Client Component the boundary sat inside the client bundle, so prerender
// still hit useSearchParams() with nothing to suspend on.
export default function MockOAuthPopup() {
  return (
    <Suspense fallback={<PopupStatus provider="account" />}>
      <MockOAuthPopupContent />
    </Suspense>
  );
}
