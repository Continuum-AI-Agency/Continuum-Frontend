'use client';

import { useRouter } from 'next/navigation';
import { DocumentManager } from '@/components/documents';
import type { OnboardingDocument } from '@/lib/onboarding/state';

interface BrandDocumentsSectionProps {
  brandId: string;
  documents: OnboardingDocument[];
}

export function BrandDocumentsSection({ brandId, documents }: BrandDocumentsSectionProps) {
  const router = useRouter();
  return (
    <DocumentManager
      brandId={brandId}
      seed={documents}
      density="full"
      onStateChange={() => router.refresh()}
      emptyHint="Upload PDFs, Word docs, presentations, or images to ground brand intelligence."
    />
  );
}
