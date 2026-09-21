import { Building2, Check, Clock, Lock, RotateCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// The billing panel's non-purchase states. Each explains what the person is looking at and
// what, if anything, they can do about it — none offers an action they are not allowed to take.

function StateBlock({
  icon,
  title,
  testId,
  children,
}: {
  icon: ReactNode;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function BillingLockedState({ brandName }: { brandName: string }) {
  return (
    <StateBlock
      testId="billing-locked"
      icon={<Lock className="size-4" aria-hidden />}
      title="Only the brand owner manages billing"
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        Plans, payment details and invoices for {brandName} are managed by its owner. Ask them to
        change a plan or buy Canvas credits.
      </p>
    </StateBlock>
  );
}

// billing-cutover: shown while PostgREST does not expose `billing`. Nothing here calls
// billing-api, which is not deployed until the same cutover.
export function BillingNotLiveState() {
  return (
    <StateBlock
      testId="billing-not-live"
      icon={<Clock className="size-4" aria-hidden />}
      title="Billing isn't available yet"
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        Plans, payment details and invoices will appear here once self-serve billing opens.
        Nothing about your current access changes in the meantime.
      </p>
    </StateBlock>
  );
}

export function BillingContractState({ features }: { features: string[] }) {
  return (
    <StateBlock
      testId="billing-contract"
      icon={<Building2 className="size-4" aria-hidden />}
      title="Managed by Continuum"
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        This brand is billed through its agreement with Continuum, so there is nothing to buy or
        change here. Contact your Continuum team to adjust what it includes.
      </p>
      {features.length > 0 ? (
        <ul aria-label="Included" className="space-y-1.5">
          {features.map((feature) => (
            <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </StateBlock>
  );
}

export function BillingErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateBlock
      testId="billing-error"
      icon={<TriangleAlert className="size-4 text-destructive" aria-hidden />}
      title="Billing did not load"
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        Nothing about your plan changed. Retry, and if it keeps failing, send this error to support:
      </p>
      <pre className="max-w-full overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-xs whitespace-pre-wrap break-all text-foreground">
        {message}
      </pre>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden />
        Retry
      </Button>
    </StateBlock>
  );
}

export function BillingSkeleton() {
  return (
    <div role="status" aria-label="Loading billing" className="divide-y divide-border">
      <div className="grid gap-6 pb-4 @[36rem]/settings-section:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="space-y-3">
            <Skeleton className="h-4 w-28 bg-muted/70" />
            <Skeleton className="h-5 w-16 bg-muted/70" />
            <Skeleton className="h-3 w-3/4 bg-muted/70" />
            <Skeleton className="h-3 w-2/3 bg-muted/70" />
            <Skeleton className="h-8 w-36 bg-muted/70" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between py-4">
        <Skeleton className="h-4 w-32 bg-muted/70" />
        <Skeleton className="h-8 w-44 bg-muted/70" />
      </div>
      <div className="space-y-3 pt-4">
        <Skeleton className="h-6 w-40 bg-muted/70" />
        <Skeleton className="h-2 w-full rounded-full bg-muted/70" />
      </div>
    </div>
  );
}
