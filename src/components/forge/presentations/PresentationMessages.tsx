'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { LazyFeatureMessages } from '@/i18n/LazyFeatureMessages';

const preloadPresentation = () => import('./PresentationWorkspace');
const PresentationWorkspace = dynamic(preloadPresentation, {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});
const namespaces = ['forge', 'library', 'studio'] as const;

type Props = ComponentProps<typeof import('./PresentationWorkspace').default>;

export default function PresentationMessages(props: Props) {
  const t = useTranslations('common');
  return (
    <LazyFeatureMessages
      scope="components/forge/presentations/PresentationMessages.tsx"
      namespaces={namespaces}
      preload={preloadPresentation}
      loading={
        <div role="status" aria-label={t('loading')}>
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <PresentationWorkspace {...props} />
    </LazyFeatureMessages>
  );
}
