'use client';

import { useTranslations } from 'next-intl';
import { User } from '@/components/icons';

import { ComingSoonPrimitive } from './ComingSoonPrimitive';

export function BrandPersonasPrimitive() {
  const uiText = useTranslations('scale');
  return (
    <ComingSoonPrimitive
      title={uiText('brand_personas_b1903fc')}
      summary={uiText('personasComingSoon')}
      icon={<User />}
    />
  );
}
