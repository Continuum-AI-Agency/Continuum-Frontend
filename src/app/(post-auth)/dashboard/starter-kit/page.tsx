import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { StarterKitPageClient } from '@/components/onboarding/v2/StarterKitPageClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

async function StarterKitContent() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');
  return <StarterKitPageClient brandId={activeBrandId} />;
}

export default function StarterKitPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          Loading your starter kit…
        </p>
      }
    >
      <StarterKitContent />
    </Suspense>
  );
}
