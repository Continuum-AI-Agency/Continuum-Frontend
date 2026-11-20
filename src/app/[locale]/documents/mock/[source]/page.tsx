import { Suspense } from 'react';
import MockDocumentPicker from './MockDocumentPicker';

type MockDocumentPickerPageProps = { params: Promise<{ source?: string }> };

async function MockDocumentPickerLoader({ params }: MockDocumentPickerPageProps) {
  const { source } = await params;
  return <MockDocumentPicker source={source ?? 'external'} />;
}

// The picker used to be a Client Component reading its own route param, and the
// page awaited params directly. Both blocked prerender. The await now happens
// inside the boundary and the client half needs no router state at all.
export default function MockDocumentPickerPage(props: MockDocumentPickerPageProps) {
  return (
    <Suspense fallback={null}>
      <MockDocumentPickerLoader {...props} />
    </Suspense>
  );
}
