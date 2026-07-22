'use client';

import { Share2 } from 'lucide-react';
import * as React from 'react';
import { GrantToBrandDialog } from '@/app/(post-auth)/integrations/_components/GrantToBrandDialog';
import { Button } from '@/components/ui/button';

type ShareConnectionButtonProps = {
  integrationId: string;
  integrationLabel: string;
  alreadyGrantedBrandIds?: string[];
};

export function ShareConnectionButton({
  integrationId,
  integrationLabel,
  alreadyGrantedBrandIds,
}: ShareConnectionButtonProps) {
  const [open, setOpen] = React.useState(false);
  const grantedSet = React.useMemo(
    () => new Set(alreadyGrantedBrandIds ?? []),
    [alreadyGrantedBrandIds],
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="size-4 mr-1.5" />
        Share with brand
      </Button>
      <GrantToBrandDialog
        open={open}
        onOpenChange={setOpen}
        integrationId={integrationId}
        integrationLabel={integrationLabel}
        alreadyGrantedBrandIds={grantedSet}
      />
    </>
  );
}
