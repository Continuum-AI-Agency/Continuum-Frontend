import { Building2, Check, Clock, Lock, RotateCw, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const tUi = useTranslations('settings');

  return (
    <StateBlock
      testId="billing-locked"
      icon={<Lock className="size-4" aria-hidden />}
      title={tUi('m_6bd78cd0b2')}
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        {tUi('m_92476bcdb3')}
        {brandName}
        {tUi('m_524c259db5')}
      </p>
    </StateBlock>
  );
}

// billing-cutover: shown while PostgREST does not expose `billing`. Nothing here calls
// billing-api, which is not deployed until the same cutover.
export function BillingNotLiveState() {
  const tUi = useTranslations('settings');

  return (
    <StateBlock
      testId="billing-not-live"
      icon={<Clock className="size-4" aria-hidden />}
      title={tUi('m_4eab5bf51c')}
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">{tUi('m_3afd720053')}</p>
    </StateBlock>
  );
}

export function BillingContractState({ features }: { features: string[] }) {
  const tUi = useTranslations('settings');

  return (
    <StateBlock
      testId="billing-contract"
      icon={<Building2 className="size-4" aria-hidden />}
      title={tUi('m_1e251f9a73')}
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">{tUi('m_795c0cd199')}</p>
      {features.length > 0 ? (
        <ul aria-label={tUi('m_3e2c570409')} className="space-y-1.5">
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
  const tUi = useTranslations('settings');

  return (
    <StateBlock
      testId="billing-error"
      icon={<TriangleAlert className="size-4 text-destructive" aria-hidden />}
      title={tUi('m_cba734e072')}
    >
      <p className="max-w-[65ch] text-sm text-muted-foreground">{tUi('m_ddcdda31a9')}</p>
      <pre className="max-w-full overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-xs whitespace-pre-wrap break-all text-foreground">
        {message}
      </pre>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden />
        {tUi('m_9f5cd8a2e8')}
      </Button>
    </StateBlock>
  );
}

export function BillingSkeleton() {
  const tUi = useTranslations('settings');

  return (
    <div role="status" aria-label={tUi('m_e6428db5c5')} className="divide-y divide-border">
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
