'use client';

import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';

const WELCOME_PARAM = 'welcome';
const WELCOME_PREFIX = 'brand:';

export function BrandWelcomeBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { brandSummaries, activeBrandId } = useActiveBrandContext();
  const [dismissed, setDismissed] = React.useState(false);

  const welcomeValue = searchParams.get(WELCOME_PARAM);
  const welcomeBrandId =
    welcomeValue && welcomeValue.startsWith(WELCOME_PREFIX)
      ? welcomeValue.slice(WELCOME_PREFIX.length)
      : null;

  if (!welcomeBrandId || dismissed) return null;
  if (welcomeBrandId !== activeBrandId) return null;

  const brand = brandSummaries.find((b) => b.id === welcomeBrandId);
  if (!brand) return null;

  const dismiss = () => {
    setDismissed(true);
    const next = new URLSearchParams(searchParams);
    next.delete(WELCOME_PARAM);
    next.delete('invite');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto mt-4 flex max-w-3xl items-start gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
    >
      <div className="flex-1">
        <p className="font-medium text-foreground">Welcome to {brand.name}.</p>
        <p className="text-muted-foreground">
          You can switch brands anytime from the sidebar. Connected integrations are listed under
          Integrations.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-sm p-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        aria-label="Dismiss welcome banner"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
