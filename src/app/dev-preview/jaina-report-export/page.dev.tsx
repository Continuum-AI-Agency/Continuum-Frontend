import { connection } from 'next/server';
import { Suspense } from 'react';
import { JainaReportExportPreview } from './JainaReportExportPreview';

async function Preview() {
  await connection();
  return <JainaReportExportPreview />;
}

export default function JainaReportExportPreviewPage() {
  return (
    <Suspense fallback={null}>
      <Preview />
    </Suspense>
  );
}
