'use client';

import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';
import React, { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { buildOAuthStartUrl } from '@/lib/oauth';
import { openCenteredPopup, waitForPopupMessage } from '@/lib/popup';

export default function GoogleOAuthButton() {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('auth');

  const router = useRouter();
  const { show } = useToast();
  const [pending, setPending] = useState(false);

  const handleGoogleLogin = () => {
    if (pending) return;
    setPending(true);

    const popupUrl = buildOAuthStartUrl('google', 'auth', { popup: true });
    const popup = openCenteredPopup(popupUrl, tUi('m_ccc5b0edaa'));
    if (!popup) {
      show({
        title: tUi('m_ee9be85313'),
        description: tUi('m_339554ce02'),
        variant: 'error',
      });
      setPending(false);
      return;
    }

    const success = waitForPopupMessage<{ type: string; context?: string }>('oauth:success', {
      predicate: (message) => message.context === 'auth',
    });
    const failure = waitForPopupMessage<{
      type: string;
      context?: string;
      message?: string;
    }>('oauth:error', {
      predicate: (message) => message.context === 'auth',
    }).then((payload) => {
      throw new Error(payload.message ?? tUi('m_219408b705'));
    });

    Promise.race([success, failure])
      .then(() => {
        show({
          title: tUi('m_1b6c524ffb'),
          description: tUi('m_1c5b34d687'),
          variant: 'success',
        });
        router.replace('/onboarding');
      })
      .catch((error) => {
        show({
          title: tUi('m_44c242032b'),
          description: uiErrorMessage(error),
          variant: 'error',
        });
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      disabled={pending}
      className="px-3 py-2 rounded border w-full disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? tUi('m_ad35c732bd') : tUi('m_ccc5b0edaa')}
    </button>
  );
}
