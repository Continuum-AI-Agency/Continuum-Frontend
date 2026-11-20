import { Loader2 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { NewVideoProject } from './NewVideoProject';

// A blank 9:16 edit on the active brand, so a person can start from nothing and drop
// files in. The project is created client-side through the same Backend call the
// Library's "Edit video" uses.
async function NewVideoContent() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');
  return <NewVideoProject brandId={activeBrandId} />;
}

export default function NewVideoStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[var(--app-content-h)] items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      }
    >
      <NewVideoContent />
    </Suspense>
  );
}
