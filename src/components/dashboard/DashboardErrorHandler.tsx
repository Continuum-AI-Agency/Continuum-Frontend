'use client';

import { useTranslations } from 'next-intl';
import React from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';

type DashboardErrorHandlerProps = {
  error?: string;
};

export function DashboardErrorHandler({ error }: DashboardErrorHandlerProps) {
  const uiText = useTranslations('dashboard');
  const getUiErrorMessage = useUiErrorMessage();
  const { show: showToast } = useToast();
  const [errorShown, setErrorShown] = React.useState(false);

  React.useEffect(() => {
    if (error && !errorShown) {
      showToast({
        title: uiText('access_restricted_a3966fe'),
        description: getUiErrorMessage({ code: error }),
        variant: 'warning',
        durationMs: 6000,
      });
      setErrorShown(true);
      // Clear the error from URL without triggering a navigation
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('error');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [error, showToast, errorShown, uiText, getUiErrorMessage]);

  return null;
}
