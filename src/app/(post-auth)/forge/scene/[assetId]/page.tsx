import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { ProductGate } from '@/components/billing/ProductGate';
import { SceneEditor } from '@/components/forge/scene/SceneEditor';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

export const metadata = {
  title: 'Scene editor · Forge',
  description: 'Edit a Blender template and render it.',
};

const assetIdSchema = z.string().uuid();

export default async function SceneEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const assetId = assetIdSchema.safeParse((await params).assetId);
  if (!assetId.success) notFound();
  const query = await searchParams;
  const revision = query.revision ? assetIdSchema.safeParse(query.revision) : null;
  if (revision && !revision.success) notFound();

  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');

  // The courtesy, not the boundary: every scene route checks Forge again on the server.
  const denied = await ProductGate('forge');
  if (denied) return denied;

  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <SceneEditor brandId={activeBrandId} assetId={assetId.data} revisionId={revision?.data} />
    </div>
  );
}
