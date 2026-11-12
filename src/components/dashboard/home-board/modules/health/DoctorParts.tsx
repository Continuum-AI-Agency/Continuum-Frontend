'use client';

// The pieces the doctor tile and its module share: a check's status icon and the link to where
// it is fixed (in the product, or on the ad platform in a new tab).
import { CheckCircle2Icon, CircleDashedIcon, CircleXIcon, LoaderIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations as useBetaTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DoctorCheckStatus, DoctorFix } from './doctorModel';

export function CheckIcon({ status }: { status: DoctorCheckStatus }) {
  const betaUiText = useBetaTranslations('dashboard');

  const className = 'mt-0.5 size-4 shrink-0';
  if (status === 'pass') {
    return (
      <CheckCircle2Icon
        aria-label={betaUiText('beta_d9720c0030b1')}
        className={cn(className, 'text-emerald-500')}
      />
    );
  }
  if (status === 'fail') {
    return (
      <CircleXIcon
        aria-label={betaUiText('beta_c5d507708563')}
        className={cn(className, 'text-destructive')}
      />
    );
  }
  if (status === 'loading') {
    return (
      <LoaderIcon
        aria-label={betaUiText('beta_463816d07097')}
        className={cn(className, 'text-muted-foreground')}
      />
    );
  }
  return (
    <CircleDashedIcon
      aria-label={betaUiText('beta_9742efc95918')}
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
