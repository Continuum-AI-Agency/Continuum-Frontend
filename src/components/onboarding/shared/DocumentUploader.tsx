"use client";

import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { DocumentManager } from "@/components/documents";

export function DocumentUploader() {
  const { brandId, state, updateState } = useOnboarding();
  return (
    <DocumentManager
      brandId={brandId}
      seed={state.documents ?? []}
      density="compact"
      onStateChange={(next) => void updateState({ documents: next.documents })}
    />
  );
}
