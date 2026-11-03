'use client';

// The pieces the doctor tile and its module share: a check's status icon and the link to where
// it is fixed (in the product, or on the ad platform in a new tab).
import { CheckCircle2Icon, CircleDashedIcon, CircleXIcon, LoaderIcon } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DoctorCheckStatus, DoctorFix } from './doctorModel';

export function CheckIcon({ status }: { status: DoctorCheckStatus }) {
  const className = 'mt-0.5 size-4 shrink-0';
  if (status === 'pass') {
    return <CheckCircle2Icon aria-label="Passes" className={cn(className, 'text-emerald-500')} />;
  }
  if (status === 'fail') {
    return <CircleXIcon aria-label="Fails" className={cn(className, 'text-destructive')} />;
  }
  if (status === 'loading') {
    return <LoaderIcon aria-label="Reading" className={cn(className, 'text-muted-foreground')} />;
  }
  return (
    <CircleDashedIcon
      aria-label="Not readable"
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
