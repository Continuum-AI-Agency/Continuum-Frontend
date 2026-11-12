import { redirect } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { StarterKitPageClient } from '@/components/onboarding/v2/StarterKitPageClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

async function StarterKitContent() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');
  return <StarterKitPageClient brandId={activeBrandId} />;
}

export default function StarterKitPage() {
  const uiText = useTranslations('dashboard');
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          {uiText('loading_your_starter_kit_103d5c0')}
        </p>
      }
    >
      <StarterKitContent />
    </Suspense>
  );
}
