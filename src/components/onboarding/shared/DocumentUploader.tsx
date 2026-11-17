'use client';

import { DocumentManager } from '@/components/documents';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';

export function DocumentUploader({
  initialFiles,
  onInitialFilesTaken,
}: {
  initialFiles?: File[];
  onInitialFilesTaken?: () => void;
}) {
  const { brandId, state, reloadState } = useOnboarding();
  // Every document action returns the state the server just saved. Adopt it: re-saving it as a
  // patch cost a second full onboarding load per file and raced the next upload's write.
  return (
    <DocumentManager
      brandId={brandId}
      seed={state.documents ?? []}
      density="compact"
      onStateChange={reloadState}
      initialFiles={initialFiles}
      onInitialFilesTaken={onInitialFilesTaken}
    />
  );
}
