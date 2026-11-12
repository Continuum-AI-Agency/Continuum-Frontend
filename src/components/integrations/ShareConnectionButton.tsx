'use client';

import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { GrantToBrandDialog } from '@/app/[locale]/(post-auth)/integrations/_components/GrantToBrandDialog';
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
  const tUi = useTranslations('common');

  const [open, setOpen] = React.useState(false);
  const grantedSet = React.useMemo(
    () => new Set(alreadyGrantedBrandIds ?? []),
    [alreadyGrantedBrandIds],
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="size-4 mr-1.5" />
        {tUi('m_6605c10f66')}
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
