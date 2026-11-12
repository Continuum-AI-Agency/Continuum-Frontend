import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { FeatureMessages } from '@/i18n/FeatureMessages';
import { ReactQueryProvider } from '@/lib/react-query/provider';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('metadataTitle') };
}

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <FeatureMessages scope="app/[locale]/onboarding/layout.tsx">
      <ReactQueryProvider>
        <ToastProvider>{children}</ToastProvider>
      </ReactQueryProvider>
    </FeatureMessages>
  );
}
