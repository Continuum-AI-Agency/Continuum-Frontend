'use client';

import { type DriveWhoami, driveWhoamiSchema } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { StorageQuotaMeter } from '@/components/library/StorageQuotaMeter';
import { http } from '@/lib/api/http';
import { billingHref } from '@/lib/billing/productAccess';

/** Each brand's Library allowance — the same numbers a mounted drive reports as free space. */
export function DriveStorage() {
  const whoami = useQuery({
    queryKey: ['drive', 'whoami'],
    queryFn: () =>
      http.request<DriveWhoami>({ path: '/drive/v1/whoami', schema: driveWhoamiSchema }),
    retry: false,
  });

  if (whoami.isPending) return <p className="text-sm text-muted-foreground">Loading storage…</p>;
  if (whoami.isError)
    return <p className="text-sm text-muted-foreground">Could not load storage.</p>;
  return (
    <div className="space-y-4">
      <ul className="flex flex-col gap-3">
        {whoami.data.brands.map((brand) => (
          <li
            key={brand.brandId}
            data-brand-id={brand.brandId}
            className="space-y-1 rounded-lg border bg-card p-3"
          >
            <span className="text-sm font-medium">{brand.folder}</span>
            <StorageQuotaMeter brandId={brand.brandId} />
          </li>
        ))}
      </ul>
      <StorageAllowanceExplainer />
    </div>
  );
}

/**
 * How the allowance is set and raised, stated as it works today — see
 * docs/billing-library-storage-plan.md. Buying capacity is sold but not yet applied
 * automatically (no Stripe purchase has ever produced a capacity grant), and this says so.
 */
function StorageAllowanceExplainer() {
  return (
    <div
      data-testid="storage-allowance-explainer"
      className="space-y-2 rounded-lg border p-3 text-sm"
    >
      <h3 className="font-medium">How the allowance is set</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Every brand includes 10 GB.</li>
        <li>A brand with the Organic Agent includes 100 GB.</li>
        <li>Continuum can add extra capacity on top of either.</li>
        <li>
          Files in the Trash stop counting once deleted; uploads in progress count until they
          finish.
        </li>
      </ul>
      <h3 className="font-medium">How to raise it</h3>
      <p className="text-muted-foreground">
        Extra Library capacity (+250 GB for $15 a month) is listed under{' '}
        <Link href={billingHref()} className="underline underline-offset-2">
          Billing
        </Link>
        , but buying it does not raise your allowance automatically yet — Continuum applies it by
        hand. Ask your Continuum contact to raise it. Until then, uploads stop when a brand reaches
        100%.
      </p>
    </div>
  );
}
