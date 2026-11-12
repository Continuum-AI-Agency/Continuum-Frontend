import { notFound, redirect } from 'next/navigation';
import { getTranslations as getUiTranslations } from 'next-intl/server';
import { z } from 'zod';
import { ProductGate } from '@/components/billing/ProductGate';
import { NativeHyperframesPage } from '@/components/forge/native/NativeHyperframesEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

export async function generateMetadata() {
  const t = await getUiTranslations('forge');
  return { title: t('nativeEditorTitle'), description: t('nativeEditorDescription') };
}
const uuid = z.uuid();
const pins = z.object({
  brandId: uuid.optional(),
  revisionId: uuid.optional(),
  jobId: uuid.optional(),
  uploadJobId: uuid.optional(),
});

export default async function NativeHyperframesEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const translateUi = await getUiTranslations('forge');

  const asset = uuid.safeParse((await params).assetId);
  const query = pins.safeParse(await searchParams);
  if (!asset.success || !query.success) notFound();
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');
  const denied = await ProductGate('forge');
  if (denied) return denied;
  if (query.data.brandId && query.data.brandId !== activeBrandId)
    return (
      <Alert>
        <AlertTitle>{translateUi('choose_this_template_s_brand_5b77bb65')}</AlertTitle>
        <AlertDescription>
          {' '}
          {translateUi('switch_to_the_brand_used_by_this_te_55f2a530')}{' '}
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <NativeHyperframesPage
        brandId={activeBrandId}
        assetId={asset.data}
        initialRevisionId={query.data.revisionId}
        initialJobId={query.data.jobId}
        initialUploadJobId={query.data.uploadJobId}
      />
    </div>
  );
}
