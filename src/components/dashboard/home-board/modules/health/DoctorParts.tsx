'use client';

import Link from 'next/link';
// The pieces the doctor tile and its module share: a check's status icon and the link to where
// it is fixed (in the product, or on the ad platform in a new tab).
import { useTranslations } from 'next-intl';
import { CircleCheck, CircleDashed, CircleX, Spinner } from '@/components/icons';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DoctorCheckStatus, DoctorFix } from './doctorModel';

export function CheckIcon({ status }: { status: DoctorCheckStatus }) {
  const uiText = useTranslations('dashboard');
  const className = 'mt-0.5 size-4 shrink-0';
  if (status === 'pass') {
    return (
      <CircleCheck
        aria-label={uiText('passes_d9720c0')}
        className={cn(className, 'text-emerald-500')}
      />
    );
  }
  if (status === 'fail') {
    return (
      <CircleX aria-label={uiText('fails_c5d5077')} className={cn(className, 'text-destructive')} />
    );
  }
  if (status === 'loading') {
    return (
      <Spinner
        aria-label={uiText('reading_463816d')}
        className={cn(className, 'text-muted-foreground')}
      />
    );
  }
  return (
    <CircleDashed
      aria-label={uiText('not_readable_9742efc')}
      className={cn(className, 'text-muted-foreground')}
    />
  );
}

export function FixLink({ fix }: { fix: DoctorFix }) {
  const className = cn(buttonVariants({ size: 'xs', variant: 'outline' }), 'hit-area shrink-0');
  if (fix.external) {
    return (
      <a
        className={className}
        data-testid="home-health-fix"
        href={fix.href}
        rel="noreferrer"
        target="_blank"
      >
        {fix.label}
      </a>
    );
  }
  return (
    <Link className={className} data-testid="home-health-fix" href={fix.href}>
      {fix.label}
    </Link>
  );
}
