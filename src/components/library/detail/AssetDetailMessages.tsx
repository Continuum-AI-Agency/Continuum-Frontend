'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { LazyFeatureMessages } from '@/i18n/LazyFeatureMessages';

const preloadAssetDetail = () => import('./AssetDetailModal');
const AssetDetailModal = dynamic(
  () => preloadAssetDetail().then((module) => module.AssetDetailModal),
  {
    ssr: false,
    loading: () => null,
  },
);
const namespaces = ['library', 'forge', 'studio'] as const;

type Props = ComponentProps<typeof import('./AssetDetailModal').AssetDetailModal>;

export default function AssetDetailMessages(props: Props) {
  const t = useTranslations('common');
  return (
    <LazyFeatureMessages
      scope="components/library/detail/AssetDetailMessages.tsx"
      namespaces={namespaces}
      preload={preloadAssetDetail}
      loading={
        <span className="sr-only" role="status">
          {t('loading')}
        </span>
      }
    >
      <AssetDetailModal {...props} />
    </LazyFeatureMessages>
  );
}
