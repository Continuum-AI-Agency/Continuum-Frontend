'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DocumentManager } from '@/components/documents';
import type { OnboardingDocument } from '@/lib/onboarding/state';

interface BrandDocumentsSectionProps {
  brandId: string;
  documents: OnboardingDocument[];
}

export function BrandDocumentsSection({ brandId, documents }: BrandDocumentsSectionProps) {
  const router = useRouter();
  const uiText = useTranslations('common');
  return (
    <DocumentManager
      brandId={brandId}
      seed={documents}
      density="full"
      onStateChange={() => router.refresh()}
      emptyHint={uiText('brandDocumentsHint')}
    />
  );
}
