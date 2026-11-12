import type { ReactNode } from 'react';
import { FeatureMessages } from '@/i18n/FeatureMessages';

export default function FeatureLayout({ children }: { children: ReactNode }) {
  return <FeatureMessages scope="app/[locale]/documents/layout.tsx">{children}</FeatureMessages>;
}
