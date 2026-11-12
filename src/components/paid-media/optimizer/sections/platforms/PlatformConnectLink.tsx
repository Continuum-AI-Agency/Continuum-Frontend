// The one button a disconnected platform's tab offers: "Connect Google Ads", to the
// integration settings where that login is connected and its account granted to the brand.

import { PlugZapIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type AdPlatform, PLATFORM_CONNECT_HREF, PLATFORM_NAMES } from './platformTabsModel';

export function PlatformConnectLink({ platform }: { platform: AdPlatform }) {
  const uiText = useTranslations('scale');
  return (
    <Link
      className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'h-7 gap-1.5 px-2 text-xs')}
      data-platform={platform}
      data-testid={`platform-connect-${platform}`}
      href={PLATFORM_CONNECT_HREF[platform]}
    >
      <PlugZapIcon aria-hidden="true" className="size-3.5" />
      {uiText('connectPlatform', {
        platform: `${PLATFORM_NAMES[platform]} Ads`,
      })}
    </Link>
  );
}
