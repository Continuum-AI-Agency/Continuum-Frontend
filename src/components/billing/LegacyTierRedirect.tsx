'use client';

// billing-cutover: the tier-era gate — a warning toast and a replace to the dashboard — kept
// verbatim so every gated page behaves exactly as before while billing is not live. ProductGate
// renders it only on that branch; wave 4 deletes this file with the rest of the tier fallback.

import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/ToastProvider';

const DEFAULT_REDIRECT = '/dashboard';
const DEFAULT_TITLE = 'Access Restricted';

type LegacyTierRedirectProps = {
  description: string;
  title?: string;
  redirectTo?: string;
};

export function LegacyTierRedirect({
  description,
  title = DEFAULT_TITLE,
  redirectTo = DEFAULT_REDIRECT,
}: LegacyTierRedirectProps) {
  const { show } = useToast();
  const router = useRouter();
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (hasTriggered.current) return;
    hasTriggered.current = true;
    show({
      title,
      description,
      variant: 'warning',
      durationMs: 6000,
    });
    router.replace(redirectTo);
  }, [description, redirectTo, router, show, title]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <Card className="w-full max-w-xl bg-surface border-subtle shadow-sm">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <ShieldAlert className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-primary">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Button variant="secondary" onClick={() => router.replace(redirectTo)}>
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
