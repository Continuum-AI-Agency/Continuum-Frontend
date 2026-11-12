'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

function LoadingStyles() {
  const t = useTranslations('common');
  return <p className="text-xs text-muted-foreground">{t('m_251e5148ad')}</p>;
}

const StylesShelfDynamic = dynamic(
  () =>
    import('@/components/styles/StylesShelf').then((m) => ({
      default: m.StylesShelf,
    })),
  { ssr: false, loading: LoadingStyles },
);

export function StylesShelfLazy(props: { brandId: string; className?: string }) {
  return <StylesShelfDynamic {...props} />;
}
