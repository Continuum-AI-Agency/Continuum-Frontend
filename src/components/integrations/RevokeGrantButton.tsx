'use client';

import { Loader2, X } from 'lucide-react';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { revokeIntegrationFromBrandAction } from '@/app/[locale]/(post-auth)/settings/integrations/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';

type RevokeGrantButtonProps = {
  grantId: string;
  brandProfileId: string;
  integrationLabel: string;
};

export function RevokeGrantButton({
  grantId,
  brandProfileId,
  integrationLabel,
}: RevokeGrantButtonProps) {
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('common');
  const router = useRouter();
  const { show } = useToast();
  const [isPending, setIsPending] = React.useState(false);

  const handleRevoke = async () => {
    setIsPending(true);
    try {
      await revokeIntegrationFromBrandAction(grantId, brandProfileId);
      show({
        title: uiText('m_7d420ec72f'),
        description: uiText('m_8f2143c002', { v0: String(integrationLabel) }),
      });
      router.refresh();
    } catch (error) {
      show({
        title: uiText('m_a73da5ed22'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
      <span className="ml-1.5">{uiText('revoke_87e6d00')}</span>
    </Button>
  );
}
