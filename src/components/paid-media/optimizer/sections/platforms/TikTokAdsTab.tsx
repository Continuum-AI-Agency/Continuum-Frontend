// The Overview's TikTok tab. TikTok Ads has no connector yet (frontend.html §9), so there is
// nothing real to read and the tab shows no numbers — a mock figure here would be the first
// thing a client quotes back. It stays in the row so the gap is visible, not hidden.

import { PlugZapIcon } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PAID_SETUP_CONNECT_HREF } from '../../../paid-setup-diagnostics';
import * as typeScale from '../../typeScale';
import { PlatformChip } from './PlatformChip';

export function TikTokAdsTab() {
  return (
    <section
      className="space-y-2 rounded-lg border border-border/70 border-dashed bg-card px-4 py-5"
      data-testid="tiktok-empty"
    >
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform="tiktok_ads" />
        <p className={cn(typeScale.body, 'font-semibold text-foreground')}>
          TikTok Ads isn't connected yet
        </p>
      </div>
      <p className="text-muted-foreground text-sm">
        Once a TikTok Ads advertiser is connected and granted to this brand, its spend, results and
        decisions appear here beside Meta and Google.
      </p>
      <Link
        className={cn(
          buttonVariants({ size: 'sm', variant: 'outline' }),
          'h-7 gap-1.5 px-2 text-xs',
        )}
        href={PAID_SETUP_CONNECT_HREF}
      >
        <PlugZapIcon aria-hidden="true" className="size-3.5" />
        Connect
      </Link>
    </section>
  );
}
