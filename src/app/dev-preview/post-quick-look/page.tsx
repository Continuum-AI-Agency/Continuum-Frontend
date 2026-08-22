import { connection } from 'next/server';
import { Suspense } from 'react';
import { PostQuickLookPreview } from './PostQuickLookPreview';

// TEMPORARY visual-QA harness for PostQuickLook spacing/text rendering.
// Not linked from any nav; safe to delete after review.
//
// It renders six fully-populated cards with chart history, which took over the
// 60s prerender budget and failed the build. connection() keeps it request-time
// so a QA-only page never costs build time.
async function Preview() {
  await connection();
  return <PostQuickLookPreview />;
}

export default function PostQuickLookPreviewPage() {
  return (
    <Suspense fallback={null}>
      <Preview />
    </Suspense>
  );
}
